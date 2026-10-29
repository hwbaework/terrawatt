import { useState } from 'react';
import { InfoHint } from './InfoHint';
import {
  RISK_ITEMS,
  RISK_LEVEL_LABEL,
  RISK_ORDER,
  firstNum,
  hhmm,
  isSafetyLate,
  isDxTarget,
  isStale,
  stopLabel,
  metric,
  sensorsOf,
  topRisk,
  useDxLatest,
  useDxSafety,
  type DxLatest,
  type DxSafety,
  type RiskLevel,
} from '../data/umeiDx';
import { Section } from './Drawer';

/* 안전·화재 — DX 스마트센서 값(아이티공간 연계 문서 v1.1).
   · 화재징후 판정 = API-006 전기안전지수(5분) · 과열·전기 징후 = API-003 최신 측정(1분)
   · 센서가 여러 대면 위에는 **가장 나쁜 값**, 아래 센서별 표에서 각각(문서 7장)
   · 값이 없으면 0이 아니라 '미산출'. 갱신이 멈추면 회색 + '갱신 지연'(문서 6.2)
   · 색은 셋뿐(2026-08-31 사용자 규칙 — 노란색 금지): 초록 정상 / 빨강 위험·경고 / 회색 그 사이·미산출 */

const NONE = '미산출';
const fx = (v: number | null | undefined, d = 1) =>
  v == null ? null : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

const levelColor = (l: RiskLevel | undefined, late = false) =>
  late || !l
    ? 'bg-white/10 text-slate-400'
    : l === 'normal'
      ? 'bg-emerald-500/15 text-emerald-300'
      : l === 'danger' || l === 'warning'
        ? 'bg-red-500/15 text-red-300'
        : 'bg-white/10 text-slate-300';

function Row({ label, value, unit, sub }: { label: string; value: string | null; unit?: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="text-[13px] font-semibold text-slate-200">{label}</span>
      <span className="shrink-0 text-right">
        <span className={`text-[13px] font-extrabold ${value ? 'text-slate-100' : 'text-slate-500'}`}>{value ?? NONE}</span>
        {value && unit && <span className="ml-1 text-[12px] font-bold text-slate-400">{unit}</span>}
        {sub && <span className="ml-2 text-[11px] text-slate-500">{sub}</span>}
      </span>
    </div>
  );
}

/** 센서들 중 가장 나쁜 안전 결과 — 등급이 나쁜 것, 같으면 지수가 낮은 것 */
function worstSafety(xs: DxSafety[]) {
  return [...xs].sort(
    (a, b) =>
      RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel) ||
      (a.safetyIndex ?? 101) - (b.safetyIndex ?? 101),
  )[0];
}
/** 센서들 중 가장 큰 값(나쁜 쪽) — 수집 중단 센서는 뺀다 */
function maxOf(xs: DxLatest[], code: string) {
  const vals = xs.filter((x) => !isStale(x)).map((x) => firstNum(metric(x, code))).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : null;
}

export function SafetyScreen({ plantCode }: { plantCode: number | undefined }) {
  const sensors = plantCode == null ? [] : sensorsOf(plantCode);
  const latest = useDxLatest(sensors.length ? plantCode : undefined);
  const safety = useDxSafety(sensors.length ? plantCode : undefined);
  const [open, setOpen] = useState<string | null>(null);

  const worst = worstSafety(safety.items);
  const late = isSafetyLate(worst);
  const top = topRisk(worst);
  const fresh = latest.items.filter((x) => !isStale(x));
  const lastObserved = fresh.map((x) => x.observedAt).sort().at(-1);

  return (
    <>
      <Section title="화재징후 판정 (DX 안전지수)">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-200">
            전기안전지수 <InfoHint text="0~100, 높을수록 양호합니다. 센서가 여러 대면 가장 낮은 값입니다. 아래 항목 중 가장 높은 위험점수가 지수를 낮춘 항목입니다. 당사 운영 기준의 상태 지표이며 법정 · 표준 판정이 아닙니다. 보호계전기 동작을 대신하지 않습니다." label="전기안전지수" align="left" />
          </span>
          <span className="flex items-center gap-2">
            <span className={`text-[20px] font-extrabold ${worst && !late ? 'text-slate-100' : 'text-slate-500'}`}>
              {fx(worst?.safetyIndex) ?? NONE}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${levelColor(worst?.riskLevel, late)}`}>
              {worst ? (late ? '갱신 지연' : RISK_LEVEL_LABEL[worst.riskLevel]) : NONE}
            </span>
          </span>
        </div>

        {/* 항목별 위험점수 0~100 — 가장 높은 항목 강조, 아크는 제공 전까지 미산출 */}
        <div className="space-y-1.5">
          {RISK_ITEMS.map((it) => {
            const v = worst?.risks[it.key];
            const isTop = top && top.label === it.label;
            return (
              <div key={it.key} className="flex items-center gap-2 text-[12px]">
                <span className={`w-10 shrink-0 ${isTop ? 'font-bold text-slate-100' : 'text-slate-400'}`}>{it.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  {typeof v === 'number' && (
                    <div
                      className={`h-full rounded-full ${isTop ? 'bg-slate-200' : 'bg-slate-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, v))}%` }}
                    />
                  )}
                </div>
                <span className={`w-12 shrink-0 text-right ${typeof v === 'number' ? 'text-slate-200' : 'text-slate-500'}`}>
                  {typeof v === 'number' ? fx(v) : NONE}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3">
          <Row label="판정 근거" value={top ? `${top.label} ${fx(top.score)}` : null} sub={top ? '가장 높은 위험 항목' : undefined} />
          <Row label="판정 모델" value={worst ? `${worst.modelName} ${worst.modelVersion}` : null} />
          <Row label="산출 시각" value={worst ? hhmm(worst.diagnosedAt) : null} sub={worst ? `구간 ${hhmm(worst.windowStartedAt)}~${hhmm(worst.windowEndedAt)}` : undefined} />
        </div>
      </Section>

      <Section title="과열·전기 징후 (DX 전기설비)">
        <Row label="설비 온도" value={fx(maxOf(latest.items, 'temperature'))} unit="℃" />
        <Row label="누설전류" value={fx(maxOf(latest.items, 'ground_current'), 3)} unit="A" />
        <Row label="고조파 THD" value={fx(maxOf(latest.items, 'thdi'))} unit="%" />
        <Row label="전류 불평형" value={fx(maxOf(latest.items, 'current_unbalance'))} unit="%" />
        <Row label="측정 시각" value={lastObserved ? hhmm(lastObserved) : null} sub={sensors.length > 1 ? '센서 중 가장 큰 값' : undefined} />
      </Section>

      {/* 센서별 — 등급이 나쁜 순. 누르면 그 센서의 과열·전기 값 */}
      <Section title={`센서별 (${sensors.length})`}>
        <div className="space-y-1.5">
          {[...sensors]
            .map((s) => ({
              s,
              sf: safety.items.find((x) => x.macAddress === s.mac),
              lt: latest.items.find((x) => x.macAddress === s.mac),
            }))
            .sort(
              (a, b) =>
                (a.sf ? RISK_ORDER.indexOf(a.sf.riskLevel) : 9) - (b.sf ? RISK_ORDER.indexOf(b.sf.riskLevel) : 9) ||
                (a.sf?.safetyIndex ?? 101) - (b.sf?.safetyIndex ?? 101),
            )
            .map(({ s, sf, lt }) => {
              const sLate = isSafetyLate(sf);
              const stale = isStale(lt);
              const t = topRisk(sf);
              const isOpen = open === s.mac;
              return (
                <div key={s.mac} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : s.mac)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.04]"
                  >
                    <span className="text-[13px] font-bold text-slate-200">{s.deviceName}</span>
                    <span className="flex items-center gap-2 text-[12px]">
                      {stale && isDxTarget(s.mac) && latest.status === 'ok' && (
                        <span className="rounded border border-white/15 px-1.5 py-0.5 font-bold text-slate-400">수집 중단</span>
                      )}
                      <span className="text-slate-400">{t ? `${t.label} ${fx(t.score)}` : ''}</span>
                      <span className={`font-extrabold ${sf && !sLate ? 'text-slate-100' : 'text-slate-500'}`}>
                        {fx(sf?.safetyIndex) ?? NONE}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${levelColor(sf?.riskLevel, sLate)}`}>
                        {sf ? (sLate ? '갱신 지연' : RISK_LEVEL_LABEL[sf.riskLevel]) : NONE}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/10 px-3 py-1.5">
                      {stale ? (
                        <p className="py-1.5 text-[12px] text-slate-500">{stopLabel(s.mac, latest.status === 'ok')}</p>
                      ) : (
                        <>
                          <Row label="설비 온도" value={fx(firstNum(metric(lt, 'temperature')))} unit="℃" />
                          <Row label="누설전류" value={fx(firstNum(metric(lt, 'ground_current')), 3)} unit="A" />
                          <Row label="고조파 THD" value={fx(firstNum(metric(lt, 'thdi')))} unit="%" />
                          <Row label="전류 불평형" value={fx(firstNum(metric(lt, 'current_unbalance')))} unit="%" />
                        </>
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
