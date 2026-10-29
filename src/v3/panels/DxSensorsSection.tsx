import { useState } from 'react';
import { InfoHint } from './InfoHint';
import { TrendChart } from './TrendChart';
import {
  firstNum,
  hhmm,
  invName,
  isDxTarget,
  isSafetyLate,
  isStale,
  isThinWindow,
  metric,
  RISK_LEVEL_LABEL,
  RISK_ORDER,
  sensorsOf,
  stopLabel,
  useDxFeatureHistory,
  useDxLatest,
  useDxSafety,
  type DxLatest,
} from '../data/umeiDx';
import { Section } from './Drawer';

/* 예지보전 — DX 스마트센서(아이티공간 연계 v1.1). 센서는 인버터마다 하나라 이름은 '인버터 #1'.
   · 설비 상태 = 전기안전지수(API-006, 5분, 등급 5단계) · Health Index(API-003, 직전 1시간, 등급 없이 숫자만) 두 줄,
     인버터 중 가장 나쁜 값(문서 6.1 · 6.2, 2026-10-29 사용자 확정).
     RTU 전원 · 통신은 예지보전이 아니라 발전소 상세에 있다(2026-10-20 사용자 확정)
   · 인버터별 현황 — 줄 = 현재 유효전력, 누르면 측정값 + 5분 추이(API-005, 최근 24시간)
   · 수신이 5분 넘게 멈추면 '수집 중단' — 마지막 값을 현재처럼 보이지 않는다(문서 8-4) */

const NONE = '미산출';
const fx = (v: number | null | undefined, d = 1) =>
  v == null ? null : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
const rst = (v: number | number[] | null, d = 1) =>
  Array.isArray(v) ? v.map((x) => fx(x, d) ?? '—').join(' / ') : null;

function Line({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-bold ${value ? 'text-slate-100' : 'text-slate-500'}`}>
        {value ?? NONE}
        {value && unit ? ` ${unit}` : ''}
      </dd>
    </div>
  );
}

/** 추이로 고를 수 있는 값 — API-005 5분 특징값(문서 5.3). 전류는 R/S/T 중 가장 큰 상.
 *  온도 · 고조파 THD 도 들어온다고 보고 둔다(2026-10-29 사용자) — 응답이 null 이면 '미산출', 울산 플랫폼과 같은 항목 */
const TRENDS: { code: string; label: string; unit: string; pick: (v: number | number[] | null) => number | null }[] = [
  { code: 'current_rst', label: '전류', unit: 'A · R/S/T 최대', pick: (v) => (Array.isArray(v) ? (v.length ? Math.max(...v) : null) : v) },
  { code: 'voltage_mean', label: '전압', unit: 'V · 평균', pick: firstNum },
  { code: 'ground_current', label: '누설전류', unit: 'A · 평균', pick: firstNum },
  { code: 'power_factor', label: '역률', unit: '% · 평균', pick: firstNum },
  { code: 'thdi', label: '고조파 THD', unit: '% · 평균', pick: firstNum },
  { code: 'temperature', label: '온도', unit: '℃ · 평균', pick: firstNum },
];

/** 인버터 하나 — 측정값 추이 */
function InverterTrend({ mac }: { mac: string }) {
  const hist = useDxFeatureHistory(mac, 24);
  const [code, setCode] = useState(TRENDS[0]!.code);
  const t = TRENDS.find((x) => x.code === code)!;
  const pts = hist.items
    .filter((f) => !isThinWindow(f))
    .map((f) => ({ at: f.observedAt, v: t.pick(f.measurements.find((m) => m.metricCode === code)?.value ?? null) }))
    .filter((p): p is { at: string; v: number } => p.v != null);

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {TRENDS.map((x) => (
          <button
            key={x.code}
            type="button"
            onClick={() => setCode(x.code)}
            className={`rounded px-2 py-1 text-[11.5px] font-bold transition-colors ${
              code === x.code ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-300 hover:bg-white/10'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {pts.length ? (
        <TrendChart pts={pts} unit={t.unit} label={`${t.label} 24시간 추이`} />
      ) : (
        <div className="flex h-[110px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[12px] text-slate-500">
          {hist.status === 'loading' ? '불러오는 중' : NONE}
        </div>
      )}
    </div>
  );
}

export function DxSensorsSection({ plantCode }: { plantCode?: number }) {
  const sensors = plantCode == null ? [] : sensorsOf(plantCode);
  const latest = useDxLatest(sensors.length ? plantCode : undefined);
  const safety = useDxSafety(sensors.length ? plantCode : undefined);
  const [open, setOpen] = useState<string | null>(null);
  if (!sensors.length) return null;

  const rows = sensors.map((s) => ({ s, d: latest.items.find((x) => x.macAddress === s.mac) as DxLatest | undefined }));
  // 설비 상태 = 인버터 중 가장 낮은 Health Index(문서 6.1)
  const low = rows
    .filter((r) => !isStale(r.d) && r.d?.health?.healthIndex != null)
    .map((r) => ({ name: invName(r.s), v: r.d!.health!.healthIndex as number, w: r.d!.health! }))
    .sort((a, b) => a.v - b.v)[0];
  // 전기안전지수 = 갱신 중인 인버터 중 등급이 가장 나쁜 것, 같으면 지수가 낮은 것
  const worst = safety.items
    .filter((x) => !isSafetyLate(x))
    .sort((a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel) || (a.safetyIndex ?? 101) - (b.safetyIndex ?? 101))[0];
  const worstInv = worst && sensors.find((x) => x.mac === worst.macAddress);
  // 결과가 있는데 모두 15분 넘게 멈췄으면 '미산출'이 아니라 '갱신 지연'(문서 6.2)
  const allLate = !worst && safety.items.length > 0;

  return (
    <>
      <Section title="설비 상태">
        <div className="flex items-baseline justify-between border-b border-white/5 py-2">
          <span className="text-[13px] font-semibold text-slate-200">
            전기안전지수{' '}
            <InfoHint
              text="0~100, 높을수록 양호합니다. 5분마다 갱신되며, 인버터가 여러 대면 등급이 가장 나쁜 값입니다. 항목별 위험점수 중 가장 높은 항목이 지수를 낮춘 항목입니다. 당사 운영 기준의 상태 지표이며 법정 · 표준 판정이 아닙니다."
              label="전기안전지수"
              align="left"
            />
          </span>
          <span className="flex items-baseline gap-2 text-right">
            <span className={`text-[18px] font-extrabold ${worst ? 'text-slate-100' : 'text-slate-500'}`}>{fx(worst?.safetyIndex) ?? NONE}</span>
            {(worst || allLate) && (
              <span
                className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${
                  !worst
                    ? 'bg-white/10 text-slate-400'
                    : worst.riskLevel === 'normal'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : worst.riskLevel === 'danger' || worst.riskLevel === 'warning'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-white/10 text-slate-300'
                }`}
              >
                {worst ? RISK_LEVEL_LABEL[worst.riskLevel] : '갱신 지연'}
              </span>
            )}
            {worst && (
              <span className="text-[11px] text-slate-500">
                {sensors.length > 1 && worstInv ? `${invName(worstInv)} · ` : ''}
                {hhmm(worst.diagnosedAt)}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <span className="text-[13px] font-semibold text-slate-200">
            Health Index{' '}
            <InfoHint
              text="설비 상태 점수 0~100, 높을수록 양호합니다. 직전 1시간 값이며, 인버터가 여러 대면 가장 낮은 값입니다. 경보 · 등급 판단은 전기안전지수로 합니다."
              label="Health Index"
              align="left"
            />
          </span>
          <span className="text-right">
            <span className={`text-[18px] font-extrabold ${low ? 'text-slate-100' : 'text-slate-500'}`}>{fx(low?.v) ?? NONE}</span>
            {low && (
              <span className="ml-2 text-[11px] text-slate-500">
                {sensors.length > 1 ? `${low.name} · ` : ''}
                {hhmm(low.w.windowStartedAt)}~{hhmm(low.w.windowEndedAt)}
              </span>
            )}
          </span>
        </div>
      </Section>

      <Section title={`인버터별 현황 (${sensors.length})`}>
        <div className="space-y-1.5">
          {rows.map(({ s, d }) => {
            const stale = isStale(d);
            const isOpen = open === s.mac;
            const w = firstNum(metric(d, 'active_power'));
            const kw = w == null ? null : w / 1000; // 유효전력은 W 로 온다
            return (
              <div key={s.mac} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.mac)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.04]"
                >
                  <span className="flex items-center text-[13.5px] font-bold text-slate-200">
                    {/* 점 — 수신 중 초록 / 수집 중단 빨강 / 대상 아님 · 응답 없음 회색 */}
                    <span
                      className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${!isDxTarget(s.mac) || latest.status !== 'ok' ? 'bg-slate-500' : stale ? 'bg-red-400' : 'bg-emerald-400'}`}
                    />
                    {invName(s)}
                  </span>
                  <span className="flex items-baseline gap-1">
                    {stale ? (
                      <span className="text-[12px] font-bold text-slate-500">{stopLabel(s.mac, latest.status === 'ok')}</span>
                    ) : (
                      <>
                        <span className={`text-[15px] font-extrabold ${kw != null ? 'text-slate-100' : 'text-slate-500'}`}>{fx(kw) ?? NONE}</span>
                        {kw != null && <span className="text-[11px] font-bold text-slate-500">kW</span>}
                      </>
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-white/10 px-3 py-2.5">
                    {stale ? (
                      <p className="text-[12px] text-slate-500">{d ? `수집 중단 · 마지막 수신 ${d.receivedAt}` : stopLabel(s.mac, latest.status === 'ok')}</p>
                    ) : (
                      <dl className="space-y-1.5 text-[12.5px]">
                        <Line label="Health Index" value={fx(d?.health?.healthIndex)} unit="점" />
                        <Line label="전류 R/S/T" value={rst(metric(d, 'current_rst'))} unit="A" />
                        <Line label="전압 R/S/T" value={rst(metric(d, 'voltage_rst'))} unit="V" />
                        <Line label="역률" value={fx(firstNum(metric(d, 'power_factor')))} unit="%" />
                        <Line label="주파수" value={fx(firstNum(metric(d, 'frequency')), 2)} unit="Hz" />
                        <Line label="누설전류" value={fx(firstNum(metric(d, 'ground_current')), 3)} unit="A" />
                        <Line label="고조파 THD" value={fx(firstNum(metric(d, 'thdi')))} unit="%" />
                        <Line label="온도" value={fx(firstNum(metric(d, 'temperature')))} unit="℃" />
                        <Line label="측정 시각" value={d ? hhmm(d.observedAt) : null} />
                      </dl>
                    )}
                    {/* 수집이 멈춰도 지난 추이는 볼 수 있다 — 연계 대상 센서만 */}
                    {isDxTarget(s.mac) && <InverterTrend mac={s.mac} />}
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
