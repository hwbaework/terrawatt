import { useState } from 'react';
import { TrendChart } from './TrendChart';
import {
  firstNum,
  hhmm,
  invName,
  isDxTarget,
  isStale,
  isThinWindow,
  metric,
  sensorsOf,
  stopLabel,
  useDxFeatureHistory,
  useDxLatest,
  type DxLatest,
} from '../data/umeiDx';
import { Section } from './Drawer';

/* 예지보전 — DX 센서가 잰 값(아이티공간 연계 v1.1 API-003 · 005). 울산 플랫폼 예지보전과 같은 기준(2026-10-29 사용자):
   · 설비 상태 = Health Index(직전 1시간, 등급 없이 숫자만) · 발전량 예측(제공 전)
   · 인버터별 현황 — 줄 = 현재 유효전력, 누르면 측정값(Health · 전류 · 전압 · 역률 · 주파수 · 누설전류 · 고조파 · 온도) + 5분 추이
   · 전기안전지수 · 등급 · 항목별 위험점수(0~100 점수)는 안전에 있다 — 여기 넣지 않는다
   · 센서는 인버터마다 하나라 이름은 '인버터 #1', 번호 순
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
  { code: 'current_rst', label: '전류', unit: 'A', pick: (v) => (Array.isArray(v) ? (v.length ? Math.max(...v) : null) : v) },
  { code: 'voltage_mean', label: '전압', unit: 'V', pick: firstNum },
  { code: 'ground_current', label: '누설전류', unit: 'A', pick: firstNum },
  { code: 'power_factor', label: '역률', unit: '%', pick: firstNum },
  { code: 'thdi', label: '고조파 THD', unit: '%', pick: firstNum },
  { code: 'temperature', label: '온도', unit: '℃', pick: firstNum },
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
        <TrendChart pts={pts} unit={`${t.label} (${t.unit}) · 5분`} label={`${t.label} 24시간 추이`} tip={(p) => `${fx(p.v, t.code === 'ground_current' ? 3 : 1)} ${t.unit}`} />
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
  const [open, setOpen] = useState<string | null>(null);
  if (!sensors.length) return null;

  const rows = sensors.map((s) => ({ s, d: latest.items.find((x) => x.macAddress === s.mac) as DxLatest | undefined }));
  // 설비 상태 = 인버터 중 가장 낮은 Health Index(문서 6.1)
  const low = rows
    .filter((r) => !isStale(r.d) && r.d?.health?.healthIndex != null)
    .map((r) => ({ v: r.d!.health!.healthIndex as number, w: r.d!.health! }))
    .sort((a, b) => a.v - b.v)[0];

  return (
    <>
      {/* 설비 상태 — 센서가 잰 값 쪽(API-003). 전기안전지수 · 등급은 0~100 점수라 안전에 있다(울산 플랫폼 기준) */}
      <Section title="설비 상태">
        <div className="border-b border-white/5 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-slate-200">설비 상태 (Health Index)</span>
            <span className={`text-[18px] font-extrabold ${low ? 'text-slate-100' : 'text-slate-500'}`}>
              {fx(low?.v) ?? NONE}
              {low && <span className="ml-1 text-[12px] font-bold text-slate-500">/ 100</span>}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">설비 상태 점수 0~100, 높을수록 양호</p>
          <p className="text-[12px] text-slate-500">1시간 갱신{low ? ` · ${hhmm(low.w.windowStartedAt)}~${hhmm(low.w.windowEndedAt)}` : ''}</p>
        </div>
        {/* 발전량 예측 — 아이티공간이 외부 제공 방식을 정하면 연계(문서 6.3) */}
        <div className="flex items-baseline justify-between py-2">
          <span className="text-[13px] font-semibold text-slate-200">발전량 예측</span>
          <span className="text-[13px] font-extrabold text-slate-500">제공 전</span>
        </div>
      </Section>

      <Section title="설비별 상태">
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
                        {/* 울산 예지보전 설비별 상태 표와 같은 칸 · 순서 · 이름 */}
                        <Line label="Health" value={fx(d?.health?.healthIndex)} />
                        <Line label="전류 R/S/T (A)" value={rst(metric(d, 'current_rst'))} />
                        <Line label="전압 R/S/T (V)" value={rst(metric(d, 'voltage_rst'))} />
                        <Line label="유효전력 (kW)" value={fx(kw)} />
                        <Line label="역률 (%)" value={fx(firstNum(metric(d, 'power_factor')))} />
                        <Line label="주파수 (Hz)" value={fx(firstNum(metric(d, 'frequency')), 2)} />
                        <Line label="누설전류 (A)" value={fx(firstNum(metric(d, 'ground_current')), 3)} />
                        <Line label="고조파 THD (%)" value={fx(firstNum(metric(d, 'thdi')))} />
                        <Line label="온도 (℃)" value={fx(firstNum(metric(d, 'temperature')))} />
                        <Line label="측정 시각" value={d ? d.observedAt.slice(11, 19) : null} />
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
