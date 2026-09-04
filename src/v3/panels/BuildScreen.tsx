import { useEffect, useState, type ReactNode } from 'react';
import {
  clearSketch,
  ringsAreaM2,
  getBuilding,
  listBuildings,
  raiseBuilding,
  removeBuilding,
  setBuildingPlan,
  startSketch,
  stopSketch,
  type SketchBuilding,
  type SketchPoint,
} from '../map/buildSketch';
import {
  DEFAULT_PV_ASSUMPTION,
  PPA_CONTRACT_TYPES,
  PV_MODE_LABEL,
  defaultProject,
  planPv,
  type PvMode,
  type PvProject,
} from '../lib/pvPlan';
import { SELF_TARIFF } from '../lib/bizSim';
import { MIcon } from '../../v2/lib/MIcon';
import { Section } from './Drawer';

/* 건물 세우기(BG-01) — 화면 쪽.

   흐름(2026-08-19 사용자와 합의): 사람은 **먼저 가능한 자리에 점을 찍고, 그 다음에 거기 뭘 얹을지** 정한다.
     ① 스케치: 땅을 드래그해 사각형 바닥 → 지붕 가용면적 → [건물 세우기] → 건물이 바로 올라오고 그 건물이 선택됨
     ② 정보: 선택된 건물의 사업 조건 폼 — 사업성 시뮬레이터 폼과 같은 항목(자가소비용/OnSite PPA 탭,
        고객사명, 가용면적(자동), **모듈(셀렉트 — 늘어난다)**, 기상 조건, 자동 산정, 요금/계약, 사업비)
     [시뮬레이션 실행] → 지도 위에 사업성 결과 팝업(BizResultView) — 폼 값을 바꾸면 팝업이 그 자리에서 다시 계산된다.

   위에 세운 건물 칩이 줄지어 있고, [+ 새 건물]을 누르면 다시 ① 스케치로 돌아간다.
   ★ 스케치 모드는 ①일 때만 켜진다(그때만 지도 클릭 = 점 찍기). 닫으면 찍다 만 점은 지워지고 건물은 남는다.
   숫자 출처·계산식은 lib/pvPlan.ts · lib/bizSim.ts 머리 주석. 요금제별 단가표는 고압A 선택II 하나만(역산) 있다. */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ── 폼 부품 — 사업성 시뮬 폼과 같은 생김새(라벨 왼쪽, 값 오른쪽, 단위 꼬리).
   ★ 모든 줄이 같은 3열 격자(라벨 | 값칸 124px | 단위 44px)라 입력칸이 들쑥날쑥하지 않다 ── */
const BOX_W = 'w-[124px]';
const boxCls = `${BOX_W} rounded-md border border-white/10 bg-slate-900/70 px-2 py-1 text-[12px] font-bold text-white outline-none focus:border-sky-400/60`;
const numCls = `${boxCls} text-right`;
const selectCls = `${boxCls} text-[13px] text-slate-100`;

function FieldRow({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[1fr_124px_44px] items-center gap-x-1.5 py-1">
      <span className="min-w-0 text-[13px] leading-tight text-slate-300" title={hint}>
        {label}
      </span>
      {children}
    </div>
  );
}
const Unit = ({ children }: { children?: ReactNode }) => (
  <span className="text-[12px] leading-tight text-slate-400">{children}</span>
);
function NumField({
  label,
  value,
  unit,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <input type="number" step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value))} className={numCls} />
      <Unit>{unit}</Unit>
    </FieldRow>
  );
}
function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <FieldRow label={label}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${boxCls} placeholder:font-normal placeholder:text-slate-600`}
      />
      <Unit />
    </FieldRow>
  );
}
function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <Unit />
    </FieldRow>
  );
}
/** 자동 계산값 — 입력칸과 같은 자리지만 잠겨 있음(점선·회색) */
function AutoField({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <FieldRow label={label}>
      <span className={`${BOX_W} rounded-md border border-dashed border-white/10 bg-white/[0.03] px-2 py-1 text-right text-[12px] font-bold text-slate-300`}>
        {value}
      </span>
      <Unit>{unit}</Unit>
    </FieldRow>
  );
}

/* ── ① 스케치 화면 ── */
function SketchStep({ onBuilt }: { onBuilt: (b: SketchBuilding) => void }) {
  const [rings, setRings] = useState<SketchPoint[][]>([]);
  const [engineOk, setEngineOk] = useState(true);

  useEffect(() => {
    let tries = 0;
    let started = startSketch(setRings);
    const t = window.setInterval(() => {
      if (started || ++tries > 20) {
        window.clearInterval(t);
        setEngineOk(started);
        return;
      }
      started = startSketch(setRings);
    }, 300);
    return () => {
      window.clearInterval(t);
      stopSketch();
    };
  }, []);

  const area = ringsAreaM2(rings);
  const canRaise = rings.length > 0;

  const raise = () => {
    // 세울 때는 기본 조건으로 계산해 붙이고, 이어지는 ② 화면에서 고친다
    const project = defaultProject();
    const b = raiseBuilding(planPv(area, DEFAULT_PV_ASSUMPTION), project);
    if (b) onBuilt(b);
  };

  return (
    <>
      <Section title="지붕 그리기">
        {!engineOk && (
          <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[12px] text-red-300">
            3D 엔진이 아직 준비되지 않았습니다 — 잠시 후 화면을 다시 열어 주세요.
          </p>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2.5">
            <div className="text-[12px] text-slate-400">면적{rings.length > 1 ? ` · 조각 ${rings.length}` : ''}</div>
            <div className={`mt-0.5 text-[17px] font-extrabold leading-tight ${canRaise ? 'text-sky-300' : 'text-slate-600'}`}>
              {canRaise ? num(area) : '—'}
              <span className="ml-1 text-[12px] font-bold text-slate-400">㎡</span>
            </div>
          </div>
          <button
            type="button"
            onClick={clearSketch}
            disabled={rings.length === 0}
            className="flex items-center justify-center gap-1 self-stretch rounded-lg bg-white/[0.06] px-3 text-[13px] font-bold text-slate-300 transition-colors hover:bg-white/10 disabled:text-slate-600 disabled:hover:bg-white/[0.06]"
          >
            <MIcon name="close" size={14} />
            지우기
          </button>
        </div>
      </Section>

      <div className="px-5 py-3">
        <button
          type="button"
          onClick={raise}
          disabled={!canRaise}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12px] font-bold transition-colors ${
            canRaise ? 'bg-sky-600/90 text-white hover:bg-sky-600' : 'bg-white/[0.04] text-slate-600'
          }`}
        >
          <MIcon name="add" size={16} />
          {canRaise ? `건물 세우기 — ${num(area)} ㎡` : '건물 세우기'}
        </button>
      </div>
    </>
  );
}

/* ── ② 건물 정보 폼 ── */
function ProjectStep({
  building,
  onChange,
  onRemove,
  onRunSim,
}: {
  building: SketchBuilding;
  onChange: () => void;
  onRemove: () => void;
  onRunSim: (b: SketchBuilding) => void;
}) {
  const b = building;
  const p = b.project;
  const pv = b.pv;

  /* 입력이 바뀔 때마다 계획을 다시 계산해 엔진 쪽 기록에 저장 → 부모가 다시 읽는다 */
  const update = (next: PvProject, assumption = pv.assumption) => {
    setBuildingPlan(b.id, planPv(b.areaM2, assumption), next);
    onChange();
  };
  const setMode = (mode: PvMode) => update({ ...p, mode });

  return (
    <>
      {/* 자가소비용 / OnSite PPA — 폼 맨 위 탭과 같다 */}
      <div className="px-5 pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.05] p-1">
          {(Object.keys(PV_MODE_LABEL) as PvMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md py-1.5 text-[13px] font-bold transition-colors ${
                p.mode === m ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {PV_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <Section title="프로젝트">
        <div className="divide-y divide-white/5">
          <TextField label="고객사명 (선택)" value={p.customer} placeholder="기업명 입력" onChange={(v) => update({ ...p, customer: v })} />
          {/* 설치용량 = 가용면적 ÷ 12 (2026-08-24 확정) — 모듈 개념 없음 */}
          <AutoField label="지붕 가용면적" value={num(b.areaM2)} unit="㎡" />
          <NumField
            label="일평균 발전시간"
            value={pv.assumption.hoursPerDay}
            unit="h/일"
            step={0.01}
            hint="울산미포 기준, 손실 반영 환산치"
            onChange={(v) => update(p, { ...pv.assumption, hoursPerDay: v })}
          />
          <NumField
            label="모듈 효율감소율"
            value={pv.assumption.degradePctYr}
            unit="%/yr"
            step={0.1}
            onChange={(v) => update(p, { ...pv.assumption, degradePctYr: v })}
          />
        </div>
      </Section>

      {/* ── 자동 산정 — 위 입력(면적·모듈·장당 면적·발전시간·감소율)이 바뀌면 여기 숫자가 바뀐다. 눈에 띄게 ── */}
      <div className="px-5 pt-3">
        <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3">
          <div className="flex items-center gap-1 text-[12px] font-bold text-sky-300">
            <MIcon name="expand_more" size={12} />
            위 값으로 자동 산정
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11.5px] text-slate-400">설치용량</div>
              <div className="text-[18px] font-extrabold leading-tight text-white">
                {num(pv.capacityKw, 2)}
                <span className="ml-0.5 text-[12px] font-bold text-slate-400">kW</span>
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-slate-400">일 평균 발전량</div>
              <div className="text-[18px] font-extrabold leading-tight text-sky-200">
                {num(pv.yearKwh / 365)}
                <span className="ml-0.5 text-[12px] font-bold text-slate-400">kWh</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {p.mode === 'self' ? (
        <Section title="자가소비">
          <div className="space-y-2.5 pt-1">
            {/* 요금제는 하나로 통일(2026-08-24) — 종별/전압/선택/단가표기준 셀렉트를 걷어냈다.
                적용 단가는 아래 고정 블록으로만 보여주고, 상승률·피크감축만 입력으로 남긴다.
                (월평균 사용량·자가소비율은 2026-08-19에 이미 뺐다 — 공장은 사용량 ≫ 옥상 발전량이라 늘 100%) */}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <span className="text-[12px] font-bold text-slate-400">적용 단가 (자가소비)</span>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-slate-200">
                <span>기본요금 <b className="text-white">{num(SELF_TARIFF.basicKrwKw)}</b> 원/kW</span>
                <span>전력량 <b className="text-white">{num(SELF_TARIFF.energyKrwKwh, 1)}</b> 원/kWh</span>
              </div>
            </div>
            <div className="divide-y divide-white/5">
              <NumField label="전기요금 상승률" value={p.self.priceRisePctYr} unit="%/yr" step={0.1} onChange={(v) => update({ ...p, self: { ...p.self, priceRisePctYr: v } })} />
              <NumField label="기본요금 피크감축 반영률" value={p.self.peakCutPct} unit="%" step={5} onChange={(v) => update({ ...p, self: { ...p.self, peakCutPct: v } })} />
            </div>
          </div>
        </Section>
      ) : (
        <Section title="OnSite PPA">
          <div className="divide-y divide-white/5">
            <TextField label="수요기업 (공급처)" value={p.ppa.buyer} placeholder="기업명 입력" onChange={(v) => update({ ...p, ppa: { ...p.ppa, buyer: v } })} />
            <NumField label="PPA 단가" value={p.ppa.priceKrwKwh} unit="원/kWh" step={0.1} onChange={(v) => update({ ...p, ppa: { ...p.ppa, priceKrwKwh: v } })} />
            <SelectField label="계약 유형" value={p.ppa.contractType} options={PPA_CONTRACT_TYPES} onChange={(v) => update({ ...p, ppa: { ...p.ppa, contractType: v } })} />
            <NumField label="계약 기간" value={p.ppa.years} unit="년" onChange={(v) => update({ ...p, ppa: { ...p.ppa, years: v } })} />
          </div>
        </Section>
      )}
      {/* 사업비(설치단가·국비·O&M)는 화면에서 뺐다(2026-08-19) — 계약 단계에서 따로 다룬다. 계산식은 lib/pvPlan costOf 에 남김 */}

      <div className="px-5 py-3">
        <button
          type="button"
          onClick={() => onRunSim(b)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-blue-500"
        >
          <MIcon name="bolt" size={16} />
          시뮬레이션 실행 — {num(pv.capacityKw, 2)} kW
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[12.5px] font-bold text-slate-500 transition-colors hover:bg-white/5 hover:text-red-300"
        >
          <MIcon name="close" size={13} />이 건물 지우기
        </button>
      </div>
    </>
  );
}

/* ── 전체 ── */
export function BuildScreen({
  onRun,
  onChanged,
  onRemoved,
}: {
  /** [시뮬레이션 실행] — 결과 팝업을 연다 */
  onRun: (b: SketchBuilding) => void;
  /** 폼 값이 바뀔 때마다 — 열려 있는 결과 팝업이 다시 계산하도록 */
  onChanged: () => void;
  onRemoved: (id: string) => void;
}) {
  const [built, setBuilt] = useState<SketchBuilding[]>(() => listBuildings());
  /** null = ① 스케치, id = ② 그 건물의 폼 */
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = () => {
    setBuilt(listBuildings());
    onChanged();
  };
  const current = selected ? getBuilding(selected) : undefined;

  return (
    <>
      {/* 세운 건물 칩 + 새 건물 — 지금 어디를 보고 있는지 한 줄로 */}
      {built.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 pt-3">
          {built.map((b) => {
            const on = b.id === selected;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelected(b.id)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-bold transition-colors ${
                  on ? 'border-sky-400/70 bg-sky-500/20 text-sky-100' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10'
                }`}
              >
                <span className="inline-block h-2 w-2 rounded-sm border border-white/70 bg-sky-400/70" />
                {b.project.customer || b.name}
                <span className="text-sky-300">{num(b.pv.capacityKw, 1)}kW</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={`flex items-center gap-0.5 rounded-full border border-dashed px-2.5 py-1 text-[12.5px] font-bold transition-colors ${
              selected === null ? 'border-sky-400/70 text-sky-200' : 'border-white/15 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MIcon name="add" size={12} />새 건물
          </button>
        </div>
      )}

      {current ? (
        <ProjectStep
          key={current.id}
          building={current}
          onChange={refresh}
          onRemove={() => {
            removeBuilding(current.id);
            onRemoved(current.id);
            refresh();
            setSelected(null);
          }}
          onRunSim={onRun}
        />
      ) : (
        <SketchStep
          onBuilt={(b) => {
            refresh();
            setSelected(b.id);
          }}
        />
      )}
    </>
  );
}
