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
import { InverterRow, Line, Note, ScoreSummary, TrendEmpty, ValueList } from './DxScoreParts';

/* 예지보전 — DX 센서가 잰 값(아이티공간 연계 v1.1 API-003 · 005). 울산 플랫폼 예지보전과 같은 기준(2026-10-29 사용자):
   · 설비 상태 = Health Index(직전 1시간, 등급 없이 숫자만). 발전량 예측은 뺐다(2026-10-29 사용자 — 발전량 그래프가 앞 화면에 있다)
   · UMEI 응답이 없으면 데모 값(umeiDxDemo.ts)으로 채운다 — POC 라 값이 있어야 한다
   · 인버터별 현황 — 줄 = Health 점수(2026-11-03 사용자: 설비 상태는 kW 가 아니라 점수), 누르면 측정값(Health · 전류 · 전압 · 역률 · 주파수 · 누설전류 · 고조파 · 온도) + 5분 추이
   · 전기안전지수 · 항목별 위험점수(0~100 점수)는 안전에 있다 — 여기 넣지 않는다
   · 센서는 인버터마다 하나라 이름은 '인버터 #1', 번호 순
   · 수신이 5분 넘게 멈추면 '수집 중단' — 마지막 값을 현재처럼 보이지 않는다(문서 8-4) */

const fx = (v: number | null | undefined, d = 1) =>
  v == null ? null : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
const rst = (v: number | number[] | null, d = 1) =>
  Array.isArray(v) ? v.map((x) => fx(x, d) ?? '—').join(' / ') : null;

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
            className={`rounded px-2 py-1 text-[13px] font-bold transition-colors ${
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
        <TrendEmpty loading={hist.status === 'loading'} />
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
      {/* 설비 상태 — 센서가 잰 값 쪽(API-003). 전기안전지수는 안전에 있다. 화면 모양은 안전과 같다(DxScoreParts.tsx) */}
      <Section title="설비 상태">
        <ScoreSummary
          label="설비 상태 (Health Index)"
          value={fx(low?.v)}
          hint={['설비 상태 점수 0~100, 높을수록 양호', `1시간 갱신${low ? ` · ${hhmm(low.w.windowStartedAt)}~${hhmm(low.w.windowEndedAt)}` : ''}`]}
        />
      </Section>

      <Section title="설비별 상태">
        <div className="space-y-1.5">
          {rows.map(({ s, d }) => {
            const stale = isStale(d);
            const w = firstNum(metric(d, 'active_power'));
            const kw = w == null ? null : w / 1000; // 유효전력은 W 로 온다
            const score = fx(d?.health?.healthIndex);
            return (
              <InverterRow
                key={s.mac}
                name={invName(s)}
                dot={!isDxTarget(s.mac) || latest.status !== 'ok' ? 'none' : stale ? 'stop' : 'on'}
                score={score}
                status={stale ? stopLabel(s.mac, latest.status === 'ok') : null}
                open={open === s.mac}
                onToggle={() => setOpen(open === s.mac ? null : s.mac)}
              >
                {stale ? (
                  <Note>{d ? `수집 중단 · 마지막 수신 ${d.receivedAt}` : stopLabel(s.mac, latest.status === 'ok')}</Note>
                ) : (
                  <ValueList>
                    {/* 울산 예지보전 설비별 상태 표와 같은 칸 · 순서 · 이름 */}
                    <Line label="Health" value={score} />
                    <Line label="전류 R/S/T (A)" value={rst(metric(d, 'current_rst'))} />
                    <Line label="전압 R/S/T (V)" value={rst(metric(d, 'voltage_rst'))} />
                    <Line label="유효전력 (kW)" value={fx(kw)} />
                    <Line label="역률 (%)" value={fx(firstNum(metric(d, 'power_factor')))} />
                    <Line label="주파수 (Hz)" value={fx(firstNum(metric(d, 'frequency')), 2)} />
                    <Line label="누설전류 (A)" value={fx(firstNum(metric(d, 'ground_current')), 3)} />
                    <Line label="고조파 THD (%)" value={fx(firstNum(metric(d, 'thdi')))} />
                    <Line label="온도 (℃)" value={fx(firstNum(metric(d, 'temperature')))} />
                    <Line label="측정 시각" value={d ? d.observedAt.slice(11, 19) : null} />
                  </ValueList>
                )}
                {/* 수집이 멈춰도 지난 추이는 볼 수 있다 — 연계 대상 센서만 */}
                {isDxTarget(s.mac) && <InverterTrend mac={s.mac} />}
              </InverterRow>
            );
          })}
        </div>
      </Section>
    </>
  );
}
