import { useState } from 'react';
import {
  RISK_ITEMS,
  RISK_LEVEL_LABEL,
  RISK_ORDER,
  hhmm,
  invName,
  isSafetyLate,
  isDxTarget,
  sensorsOf,
  topRisk,
  useDxSafety,
  useDxSafetyHistory,
  type DxSafety,
  type RiskLevel,
} from '../data/umeiDx';
import { Section } from './Drawer';
import { TrendChart } from './TrendChart';

/* 안전 — 전기안전지수(아이티공간 연계 v1.1 API-006 · 007, 5분). 울산 플랫폼 안전과 같은 기준(2026-10-29 사용자):
   · 0~100 점수만 — 전기안전지수(높을수록 양호) · 등급 5가지 · 항목별 위험점수(정수, 높을수록 위험) · 아크.
     센서가 잰 값(℃ · A · %)은 예지보전에 있다 — 여기 넣지 않는다
   · 위 = 인버터 중 가장 나쁜 지수 · 등급([등급]을 누르면 5가지), 아크 지수(판정 보류)
   · 센서별 전기안전지수 = 번호 순(이름은 인버터 #1), 줄 = 지수 · 등급, 누르면 항목별 위험점수(숫자, 가장 높은 항목 amber) · 산출 시각 · 24시간 추이(올리면 시각 · 지수 · 등급)
   · 계산식은 화면에 쓰지 않는다. 값이 없으면 '미산출', 15분 넘게 멈추면 '갱신 지연'(문서 6.2)
   · 등급 색은 울산과 같게 — 위험 · 경고 빨강, 주의 amber, 관찰 회색, 정상 초록 */

const NONE = '-';
const fx = (v: number | null | undefined, d = 1) =>
  v == null ? null : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

const LEVEL_PILL: Record<RiskLevel, string> = {
  danger: 'bg-red-500/15 text-red-300',
  warning: 'bg-red-500/15 text-red-300',
  caution: 'bg-amber-500/15 text-amber-300',
  watch: 'bg-white/10 text-slate-300',
  normal: 'bg-emerald-500/15 text-emerald-300',
};
const LEVEL_HEX: Record<RiskLevel, string> = { danger: '#ef4444', warning: '#ef4444', caution: '#f59e0b', watch: '#64748b', normal: '#10b981' };

function Pill({ level, late }: { level?: RiskLevel; late?: boolean }) {
  if (!level) return <span className="text-[12px] text-slate-500">-</span>;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${late ? 'bg-white/10 text-slate-400' : LEVEL_PILL[level]}`}>
      {late ? '갱신 지연' : RISK_LEVEL_LABEL[level]}
    </span>
  );
}

/** 센서들 중 가장 나쁜 안전 결과 — 갱신 중인 것 중 등급이 나쁜 것, 같으면 지수가 낮은 것 */
function worstSafety(xs: DxSafety[]) {
  return xs
    .filter((x) => !isSafetyLate(x))
    .sort((a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel) || (a.safetyIndex ?? 101) - (b.safetyIndex ?? 101))[0];
}

/** 항목별 위험점수 0~100(정수) — 울산 표처럼 숫자만, 가장 높은 항목(지수를 낮춘 항목)은 amber(문서 6.2), 아크는 제공 전까지 미산출 */
function RiskScores({ sf }: { sf: DxSafety }) {
  const top = topRisk(sf);
  const late = isSafetyLate(sf);
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-[12px]">
      {RISK_ITEMS.map((it) => {
        const v = sf.risks[it.key];
        const isTop = !late && top?.label === it.label;
        return (
          <div key={it.key} className="rounded bg-white/[0.04] py-1.5">
            <div className="text-[11px] text-slate-500">{it.label}</div>
            <div className={`mt-0.5 font-bold ${typeof v !== 'number' ? 'text-[11px] text-slate-500' : isTop ? 'text-amber-400' : late ? 'text-slate-500' : 'text-slate-200'}`}>
              {typeof v === 'number' ? fx(v, 0) : NONE}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 인버터 하나 — 전기안전지수 5분 추이(API-007, 최근 24시간). 등급이 바뀐 시각만 그 등급 색 점 */
function SafetyTrend({ mac }: { mac: string }) {
  const hist = useDxSafetyHistory(mac, 24);
  const pts = hist.items.filter((x) => x.safetyIndex != null).map((x) => ({ at: x.windowStartedAt, v: x.safetyIndex as number, l: x.riskLevel }));
  const marks = pts.filter((p, i) => i > 0 && p.l !== pts[i - 1]!.l).map((p) => ({ ...p, color: LEVEL_HEX[p.l] }));
  return pts.length ? (
    <TrendChart
      pts={pts}
      tip={(p) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold">{fx(p.v)}</span>
          <Pill level={p.l} />
        </span>
      )}
      max={100}
      min={Math.max(0, Math.floor(Math.min(...pts.map((p) => p.v)) / 10) * 10 - 10)}
      marks={marks}
      unit="전기안전지수 · 5분 · 점 = 등급이 바뀐 시각"
      label="전기안전지수 24시간 추이"
    />
  ) : (
    <div className="flex h-[110px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[12px] text-slate-500">
      {hist.status === 'loading' ? '불러오는 중' : NONE}
    </div>
  );
}

export function SafetyScreen({ plantCode }: { plantCode: number | undefined }) {
  const sensors = plantCode == null ? [] : sensorsOf(plantCode);
  const safety = useDxSafety(sensors.length ? plantCode : undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);

  const worst = worstSafety(safety.items);
  // 결과가 있는데 모두 15분 넘게 멈췄으면 '미산출'이 아니라 '갱신 지연'(문서 6.2)
  const allLate = !worst && safety.items.length > 0;

  return (
    <>
      <Section title="전기안전지수">
        <div className="border-b border-white/5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
              전기안전지수
              {/* 누르면 등급 5가지(riskLevel 코드, 문서 5.4) */}
              <button
                type="button"
                onClick={() => setLevelsOpen((v) => !v)}
                className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11.5px] font-bold text-slate-200 ring-1 ring-white/15 hover:bg-white/[0.12]"
              >
                등급
              </button>
            </span>
            <span className="flex items-center gap-2">
              <span className={`text-[20px] font-extrabold ${worst ? 'text-slate-100' : 'text-slate-500'}`}>{fx(worst?.safetyIndex) ?? (allLate ? '-' : NONE)}</span>
              {worst ? <Pill level={worst.riskLevel} /> : allLate ? <Pill level="normal" late /> : null}
            </span>
          </div>
          {levelsOpen && (
            <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              {RISK_ORDER.map((l) => (
                <div key={l} className="flex items-center justify-between text-[12px]">
                  <Pill level={l} />
                  <span className="font-mono text-slate-400">{l}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-[12px]">
                <Pill level="normal" late />
                <span className="text-slate-500">15분 넘게 산출 없음</span>
              </div>
            </div>
          )}
          <p className="mt-1 text-[12px] text-slate-500">0~100, 높을수록 양호</p>
          <p className="text-[12px] text-slate-500">5분 갱신{worst ? ` · 산출 ${hhmm(worst.diagnosedAt)}` : ''}</p>
        </div>
        {/* 아크 지수 — 시범 산출 중이라 외부 제공 전(문서 6.4) */}
        <div className="flex items-center justify-between py-2">
          <span className="text-[13px] font-semibold text-slate-200">아크 지수</span>
          <span className="flex items-center gap-2">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] font-bold text-slate-400">판정 보류</span>
          </span>
        </div>
        <p className="-mt-1 pb-2 text-[12px] text-slate-500">시범 산출 중</p>
      </Section>

      {/* 인버터별 — 번호 순. 줄 = 지수 · 등급, 누르면 항목별 위험점수 · 추이 */}
      <Section title="센서별 전기안전지수">
        <div className="space-y-1.5">
          {sensors.map((s) => {
            const sf = safety.items.find((x) => x.macAddress === s.mac);
            const late = isSafetyLate(sf);
            const isOpen = open === s.mac;
            return (
              <div key={s.mac} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.mac)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.04]"
                >
                  <span className="text-[13px] font-bold text-slate-200">{invName(s)}</span>
                  <span className="flex items-center gap-2 text-[12px]">
                    <span className={`font-extrabold ${sf && !late ? 'text-slate-100' : 'text-slate-500'}`}>
                      {fx(sf?.safetyIndex) ?? (isDxTarget(s.mac) ? NONE : '미수신')}
                    </span>
                    {sf && <Pill level={sf.riskLevel} late={late} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-white/10 px-3 py-2.5">
                    {sf ? (
                      <>
                        <p className="mb-1.5 text-[11.5px] text-slate-500">항목별 위험점수 (0~100, 높을수록 위험)</p>
                        <RiskScores sf={sf} />
                        <p className="mt-2 text-[12px] text-slate-500">산출 {hhmm(sf.diagnosedAt)}</p>
                      </>
                    ) : (
                      <p className="text-[12px] text-slate-500">{isDxTarget(s.mac) ? NONE : '미수신'}</p>
                    )}
                    {isDxTarget(s.mac) && (
                      <div className="mt-2">
                        <SafetyTrend mac={s.mac} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
