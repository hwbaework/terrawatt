import type { ReactNode } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { SELF_TARIFF } from '../lib/bizSim';
import type { PvAssumption, PvProject } from '../lib/pvPlan';
import { PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { Section } from './Drawer';

/* 발전량 시뮬레이션(한일튜브) 조건 서랍 — 건물 세우기(BG-01) 폼과 같은 문법(2026-08-24 사용자 확정).

   기존의 "기간 선택 + 작은 결과 팝업"을 버리고, 건물 세우기와 같은 통합 구성으로:
     오른쪽(여기) = 조정 가능한 입력(발전시간·효율감소율·상승률·피크감축) + [시뮬레이션 실행]
     가운데       = 사업성 검토 큰 팝업(BizResultView) — KPI·월별·20년 누적·민감도·연차 표
   설치용량은 실측(PLANT_SPECS, 429.44kW) 고정 — 건물 세우기(면적÷12)와 달리 이미 있는 설비라 면적 입력이 없다.
   값을 바꾸면 열려 있는 결과가 즉시 다시 계산된다(건물 세우기와 동일). */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

function NumRow({ label, value, unit, step, onChange }: { label: string; value: number; unit: string; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[1fr_124px_44px] items-center gap-x-1.5 py-1">
      <span className="min-w-0 text-[13px] leading-tight text-slate-300">{label}</span>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[124px] rounded-md border border-white/10 bg-slate-900/70 px-2 py-1 text-right text-[13px] font-bold text-white outline-none focus:border-sky-400/60"
      />
      <span className="text-[12px] leading-tight text-slate-400">{unit}</span>
    </div>
  );
}

function AutoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-2">
      <span className="text-[13px] text-slate-400">{label}</span>
      <span className="text-[14px] font-extrabold text-white">{children}</span>
    </div>
  );
}

/** 월별 차트의 기간 선택지 — 월 단위만(2026-08-24 사용자 확정). null = 올해(1~12월, 실측 비교 포함).
    프리셋 밖 개월수는 [직접]으로 입력 — 상한 24개월(예측이 멀수록 1차년 분포 재사용의 근거가 약해져서) */
const PERIODS: { label: string; months: number | null }[] = [
  { label: '올해', months: null },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '12개월', months: 12 },
];
const MAX_MONTHS = 24;

export function PlantSimScreen({
  assumption,
  project,
  periodMonths,
  onAssumption,
  onProject,
  onPeriodMonths,
  onRun,
}: {
  assumption: PvAssumption;
  project: PvProject;
  /** null = 올해(실측 비교) / n = 다음 달부터 n개월 예측 */
  periodMonths: number | null;
  onAssumption: (a: PvAssumption) => void;
  onProject: (p: PvProject) => void;
  onPeriodMonths: (m: number | null) => void;
  onRun: () => void;
}) {
  const capacityKw = PLANT_SPECS[HOME.facilityId]?.capacityKw ?? 0;
  /** 프리셋(올해·3·6·12) 밖의 개월수 = 직접 입력 모드 */
  const isCustom = periodMonths != null && !PERIODS.some((pr) => pr.months === periodMonths);

  return (
    <>
      <Section title="대상">
        <div className="divide-y divide-white/5">
          <AutoRow label="시설">{HOME.name}</AutoRow>
          <AutoRow label="설치용량 (실측)">{num(capacityKw, 2)} kW</AutoRow>
        </div>
      </Section>

      {/* 기간 — 올해(실측 비교) 또는 다음 달부터 n개월 예측. 결과의 월별 차트가 이 범위로 바뀐다.
          [직접] = 프리셋 밖 개월수 입력(1~24) */}
      <Section title="기간">
        <div className="grid grid-cols-5 gap-1.5">
          {PERIODS.map((pr) => {
            const on = periodMonths === pr.months;
            return (
              <button
                key={pr.label}
                type="button"
                onClick={() => onPeriodMonths(pr.months)}
                className={`rounded-md py-1.5 text-[12px] font-bold transition-colors ${
                  on ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-400 hover:bg-white/10'
                }`}
              >
                {pr.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onPeriodMonths(18)}
            className={`rounded-md py-1.5 text-[12px] font-bold transition-colors ${
              isCustom ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-400 hover:bg-white/10'
            }`}
          >
            직접
          </button>
        </div>
        {isCustom && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[13px] text-slate-400">다음 달부터</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={MAX_MONTHS}
                value={periodMonths ?? 18}
                onChange={(e) => onPeriodMonths(Math.min(MAX_MONTHS, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-[14px] font-bold text-white outline-none focus:border-sky-400/60"
              />
              <span className="text-[12px] text-slate-500">개월 (최대 {MAX_MONTHS})</span>
            </div>
          </div>
        )}
      </Section>

      <Section title="발전 조건">
        <div className="divide-y divide-white/5">
          <NumRow label="일평균 발전시간" value={assumption.hoursPerDay} unit="h/일" step={0.01} onChange={(v) => onAssumption({ ...assumption, hoursPerDay: v })} />
          <NumRow label="모듈 효율감소율" value={assumption.degradePctYr} unit="%/yr" step={0.1} onChange={(v) => onAssumption({ ...assumption, degradePctYr: v })} />
        </div>
      </Section>

      <Section title="자가소비">
        <div className="space-y-2.5 pt-1">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <span className="text-[12px] font-bold text-slate-400">적용 단가 (자가소비)</span>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-slate-200">
              <span>기본요금 <b className="text-white">{num(SELF_TARIFF.basicKrwKw)}</b> 원/kW</span>
              <span>전력량 <b className="text-white">{num(SELF_TARIFF.energyKrwKwh, 1)}</b> 원/kWh</span>
            </div>
          </div>
          <div className="divide-y divide-white/5">
            <NumRow label="전기요금 상승률" value={project.self.priceRisePctYr} unit="%/yr" step={0.1} onChange={(v) => onProject({ ...project, self: { ...project.self, priceRisePctYr: v } })} />
            <NumRow label="기본요금 피크감축 반영률" value={project.self.peakCutPct} unit="%" step={5} onChange={(v) => onProject({ ...project, self: { ...project.self, peakCutPct: v } })} />
          </div>
        </div>
      </Section>

      <div className="px-5 py-3">
        <button
          type="button"
          onClick={onRun}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-blue-500"
        >
          <MIcon name="bolt" size={16} />
          시뮬레이션 실행 — {num(capacityKw, 2)} kW
        </button>
      </div>
    </>
  );
}
