import { useState } from 'react';
import { InfoHint } from './InfoHint';
import { firstNum, hhmm, isStale, metric, sensorsOf, useDxLatest, type DxLatest } from '../data/umeiDx';
import { Section } from './Drawer';

/* 예지보전 › DX 센서별 — API-003(아이티공간 연계 v1.1).
   · Health Index = 직전 1시간 설비 상태 점수(0~100, 높을수록 양호). 등급 구간이 없어 **숫자만**(문서 6.1)
   · 누르면 그 센서의 전기 측정값(전류·전압 R/S/T, 유효전력, 역률, 주파수)
   · 수신이 5분 넘게 멈추면 '수집 중단' — 마지막 값을 현재처럼 보이지 않는다(문서 8-4)
   · 센서가 어느 인버터·분전반에 붙었는지는 아직 모른다(locationName 미등록) — 인버터와 섞지 않는다 */

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

export function DxSensorsSection({ plantCode }: { plantCode?: number }) {
  const sensors = plantCode == null ? [] : sensorsOf(plantCode);
  const latest = useDxLatest(sensors.length ? plantCode : undefined);
  const [open, setOpen] = useState<string | null>(null);
  if (!sensors.length) return null;

  const rows = sensors.map((s) => ({ s, d: latest.items.find((x) => x.macAddress === s.mac) as DxLatest | undefined }));
  // 요약 = 센서 중 가장 낮은 Health Index(문서 6.1)
  const his = rows
    .filter((r) => !isStale(r.d) && r.d?.health?.healthIndex != null)
    .map((r) => ({ name: r.s.deviceName, v: r.d!.health!.healthIndex as number, w: r.d!.health! }));
  const low = his.sort((a, b) => a.v - b.v)[0];

  return (
    <Section title={`DX 센서별 상태 (${sensors.length})`}>
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-slate-200">
          건전성 지수 (Health Index) <InfoHint text="설비 상태 점수 0~100, 높을수록 양호합니다. 경보 · 등급 판단은 전기안전지수로 합니다." label="건전성 지수" />
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
      <div className="space-y-1.5">
        {rows.map(({ s, d }) => {
          const stale = isStale(d);
          const hi = stale ? null : (d?.health?.healthIndex ?? null);
          const isOpen = open === s.mac;
          const kw = firstNum(metric(d, 'active_power'));
          return (
            <div key={s.mac} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.mac)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.04]"
              >
                <span className="flex items-center text-[13.5px] font-bold text-slate-200">
                  {/* 점 — 수신 중 초록 / 수집 중단 빨강 */}
                  <span className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${!d ? 'bg-slate-500' : stale ? 'bg-red-400' : 'bg-emerald-400'}`} />
                  {s.deviceName}
                </span>
                <span className="flex items-baseline gap-1">
                  {stale ? (
                    <span className="text-[12px] font-bold text-slate-500">{d ? '수집 중단' : '미수신'}</span>
                  ) : (
                    <>
                      <span className={`text-[15px] font-extrabold ${hi != null ? 'text-slate-100' : 'text-slate-500'}`}>{fx(hi) ?? NONE}</span>
                      {hi != null && <span className="text-[11px] font-bold text-slate-500">점</span>}
                    </>
                  )}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-white/10 px-3 py-2.5">
                  {stale ? (
                    <p className="text-[12px] text-slate-500">{d ? `수집 중단 · 마지막 수신 ${d.receivedAt}` : '미수신'}</p>
                  ) : (
                    <dl className="space-y-1.5 text-[12.5px]">
                      <Line label="전류 R/S/T" value={rst(metric(d, 'current_rst'))} unit="A" />
                      <Line label="전압 R/S/T" value={rst(metric(d, 'voltage_rst'))} unit="V" />
                      {/* 유효전력은 W 로 온다 — kW 로 */}
                      <Line label="유효전력" value={fx(kw == null ? null : kw / 1000, 2)} unit="kW" />
                      <Line label="역률" value={fx(firstNum(metric(d, 'power_factor')))} unit="%" />
                      <Line label="주파수" value={fx(firstNum(metric(d, 'frequency')), 2)} unit="Hz" />
                      <Line label="측정 시각" value={d ? hhmm(d.observedAt) : null} />
                    </dl>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
