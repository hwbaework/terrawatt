import { useState } from 'react';
import { PLANT_DEMO, invLabel, type PlantReading } from '../data/demoReadings';
import { INVERTER_COMM_DOWN, type PlantEventKind } from '../data/plantEvents';
import { solarHourShares } from '../data/kepcoTariff';
import { Section } from './Drawer';

/* 발전소 상세 — 한일튜브 본인이 보는 화면.

   표시 규칙(사용자 지시):
     · 정상 여부는 **이름 앞 점** 하나로만 (초록=정상 / 빨강=이상)
     · 인버터는 "지금 얼마 만들고 얼마 버는지"가 핵심(2026-08-26) — 예지보전과 같은 카드로,
       각 인버터 현재 출력 + 시간당 금액, 4대 아래 금액 큰 박스(금일·누적)
     · 값은 예시 데이터 (`demoReadings.ts`) — 실연동 시 그 파일만 교체 */

const fmt = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* 점 색은 둘뿐 — 초록 = 정상 / 빨강 = 오류(화면 전체 공통).
   오류 = 꺼짐(전원 Off·통신 두절 — 데이터가 안 옴) 또는 인버터가 보고한 이상 상태(status_msg).
   둘 다 API 가 알려주는 **사실**이다 — 우리가 추정한 판정은 여기 넣지 않는다 */
function Dot({ ok }: { ok: boolean }) {
  return (
    <span className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
  );
}

/** 큰 숫자 타일 */
function Tile({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
      <div className="text-[12px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[17px] font-extrabold leading-tight text-white">
        {value}
        {unit && <span className="ml-1 text-[12px] font-bold text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-slate-500">{sub}</div>}
    </div>
  );
}

/** 시간별 출력 — 지도 팝업(DtViewPopup)에 있던 그래프를 우측 패널로 옮김(2026-09-07 사용자 확정).
    점선 = 24시간 예상 출력(태양 고도 기반 시간 분포 × 일 예상 발전량) / 초록 막대 = 현재까지 실측
    (실측 = 오늘 누적 곡선의 시간당 증가분 — 발전소 상세와 같은 데이터) */
function HourlyChart({ curve, capacityKw }: { curve: PlantReading['todayCurve']; capacityKw: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const expectedDaily = capacityKw * 3.82; // 일 예상 발전량 = 용량 × 일평균 발전시간
  const shares = solarHourShares(new Date().getMonth() + 1); // 이번 달의 시간별 발전 비중(합 1)
  const expected = shares.map((s) => s * expectedDaily);
  /* 실측 — 누적 곡선의 시간당 증가분. 슬롯 h = h시~h+1시 */
  const actual: (number | null)[] = Array.from({ length: 24 }, () => null);
  curve.slice(1).forEach(([, v], i) => {
    const h = parseInt(curve[i][0].slice(0, 2), 10);
    actual[h] = v - curve[i][1];
  });
  const max = Math.max(...expected, ...actual.map((v) => v ?? 0), 1);
  const W = 400;
  const H = 190;
  const padL = 38;
  const padB = 22;
  const padT = 30; // 위 여백 — kWh 단위가 맨 위 눈금 숫자와 겹치지 않게
  const slotW = (W - padL - 10) / 24;
  const x = (i: number) => padL + slotW * (i + 0.5); // 슬롯 가운데
  const y = (v: number) => H - padB - ((H - padB - padT) * v) / max;
  const barW = slotW * 0.62;
  const expPts = expected.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <div className="relative">
      {/* 범례 — 색 칩으로만 */}
      <div className="mb-1.5 flex items-center gap-4 text-[11.5px] font-bold text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px] bg-emerald-400/80" />실측
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[3px] w-4 rounded bg-sky-300/80" />예상
        </span>
      </div>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 text-center shadow-xl"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <div className="text-[12px] font-bold text-slate-300">{hover}시</div>
          <div className="text-[12.5px] font-bold text-sky-300">예상 {fmt(expected[hover], 1)} kWh</div>
          {actual[hover] != null && (
            <div className="text-[13px] font-extrabold text-emerald-300">실측 {fmt(actual[hover]!, 1)} kWh</div>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="시간별 출력">
        {/* 세로축 단위 — 눈금 숫자 위에 따로 */}
        <text x={padL - 5} y={13} textAnchor="end" fill="#94a3b8" fontSize={10} fontWeight={700}>
          kWh
        </text>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 10} y1={y(max * t)} y2={y(max * t)} stroke="rgba(255,255,255,.08)" />
            <text x={padL - 5} y={y(max * t) + 3.5} textAnchor="end" fill="#64748b" fontSize={10.5}>
              {fmt(max * t)}
            </text>
          </g>
        ))}
        {/* 실측 — 초록 막대 (아직 안 온 시간은 없음) */}
        {actual.map((v, i) =>
          v == null ? null : (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={y(v)}
              width={barW}
              height={Math.max(1, H - padB - y(v))}
              rx={2}
              fill={hover === i ? '#34d399' : 'rgba(52,211,153,.75)'}
            />
          ),
        )}
        {/* 예상 — 24시간 선 */}
        <polyline points={expPts} fill="none" stroke="#7dd3fc" strokeOpacity={0.9} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
        {/* 마우스 판 — 시간마다 세로 띠 */}
        {Array.from({ length: 24 }, (_, i) => (
          <rect
            key={`h${i}`}
            x={padL + slotW * i}
            y={0}
            width={slotW}
            height={H - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {/* 축 라벨 — 4시간 간격 */}
        {[0, 4, 8, 12, 16, 20].map((h) => (
          <text key={h} x={x(h)} y={H - 6} textAnchor="middle" fill="#64748b" fontSize={10.5}>
            {h}시
          </text>
        ))}
      </svg>
    </div>
  );
}

export function PlantScreen({
  onRunGen,
  onEvent,
  activeEvent,
}: {
  onRunGen: () => void;
  onEvent: (kind: PlantEventKind) => void;
  /** 지금 떠 있는 이벤트 팝업 — 해당 항목의 점을 빨갛게 바꾼다(2026-08-31 사용자 확정) */
  activeEvent: PlantEventKind | null;
}) {
  const d = PLANT_DEMO;
  /* 인버터 통신 이벤트가 떠 있는 동안 안 되는 2대 — 점 빨강 + 값 0 + 상태 2/4 (2026-08-31 사용자 확정) */
  const commDown = activeEvent === 'inverterComm' ? INVERTER_COMM_DOWN : [];
  const invCommLabel = commDown.length ? `${d.inverters.length - commDown.length}/${d.inverters.length}` : d.inverterComm;

  return (
    <>
      {/* 설비 상태 — 점 + 이름만. 누르면 그 신호에 이상이 왔을 때의 이벤트 팝업을 미리 본다(2026-08-31 사용자 확정) */}
      <Section title="설비 상태">
        <div className="flex flex-wrap gap-x-1.5 gap-y-1.5 text-[13px] text-slate-300">
          {(
            [
              ['rtuPower', <>RTU 전원</>, d.rtuPower],
              ['rtuComm', <>RTU 통신</>, d.rtuComm],
              ['inverterComm', <>인버터 통신 {invCommLabel}</>, true],
            ] as const
          ).map(([kind, label, ok]) => (
            <button
              key={kind}
              type="button"
              onClick={() => onEvent(kind)}
              title="누르면 이 신호에 이상이 왔을 때의 알림을 미리 봅니다"
              className="flex items-center rounded-lg px-1.5 py-1 transition-colors hover:bg-white/10"
            >
              <Dot ok={ok && activeEvent !== kind} />
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* 발전 현황 — 살아 움직이는 값 4개(2026-08-26 사용자 확정: 4개 유지) */}
      <Section title="발전 현황">
        <div className="grid grid-cols-2 gap-2">
          <Tile label="현재 출력" value={fmt(d.currentKw, 1)} unit="kW" />
          <Tile label="금일 발전량" value={fmt(d.todayKwh)} unit="kWh" />
          <Tile label="금일 발전시간" value={fmt(d.todayHours, 1)} unit="h" />
          <Tile label="누적 발전량" value={fmt(d.totalKwh)} unit="kWh" />
        </div>
      </Section>

      <Section title="시간별 출력">
        <HourlyChart curve={d.todayCurve} capacityKw={d.capacityKw} />
      </Section>

      {/* 인버터 4대 — **정보 제공용 표**(2026-08-26 사용자 확정: 예지보전 같은 클릭 이벤트 없음).
          시간당 금액은 뺐다 — "지금 출력이 1시간 유지되면"이라는 가정이지 데이터가 아니다.
          금일(dailyEnergy)·누적(totalEnergy)은 API 실제 필드라 근거가 있다 */}
      <Section title={`인버터 ${d.inverters.length}대`}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-[11.5px] text-slate-500">
              <th className="py-1.5 text-left font-semibold">인버터</th>
              <th className="py-1.5 text-right font-semibold">현재(AC) kW</th>
              <th className="py-1.5 text-right font-semibold">DC kW</th>
              <th className="py-1.5 text-right font-semibold">금일 kWh</th>
            </tr>
          </thead>
          <tbody>
            {d.inverters.map((inv) => {
              /* 통신 두절 이벤트 중인 인버터 — 값이 안 들어오므로 0으로 표시(2026-08-31 사용자 확정) */
              const down = commDown.includes(inv.id);
              /* 오류로 단정하는 것은 **통신 두절**뿐 — 명세가 connectionState 1 = 통신오류로 정의한다.
                 상태 메시지(statusMsg)는 값을 그대로 보여주기만 한다(2026-09-09 사용자 확정):
                 명세 응답 예제의 정상 값이 'Run' 이고 'Wait' 는 일출 전 대기라, 값이 있다고 이상이라 할 수 없다.
                 아이티공간에서 상태 코드 목록을 받으면 그때 어떤 값이 이상인지 색을 입힌다.
                 ⚠️ 예지보전 판정('점검 필요' 등)도 여기 넣지 않는다 — 인버터별 과거 이력이 없어 근거를 못 댄다 */
              return (
                <tr key={inv.id} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-left">
                    <span className="flex items-center font-bold text-slate-200">
                      {/* 점 = 통신. 순간 출력에는 색을 칠하지 않는다 — 구름·새·지붕 방향으로 한 대만 낮은 건 정상일 수 있다 */}
                      <Dot ok={inv.comm && !down} />
                      {invLabel(inv.id)}
                      <span className="ml-1 text-[11.5px] font-normal text-slate-500">{inv.ratedKw}kW</span>
                      {/* 통신이 끊기면 '오류'(명세 정의), 살아 있으면 인버터가 보낸 상태값을 그대로 */}
                      {down ? (
                        <span className="ml-1.5 rounded bg-red-500/15 px-1 py-px text-[10.5px] font-bold text-red-300">
                          오류
                        </span>
                      ) : (
                        inv.statusMsg && (
                          <span className="ml-1.5 rounded bg-white/10 px-1 py-px text-[10.5px] font-bold text-slate-300">
                            {inv.statusMsg}
                          </span>
                        )
                      )}
                    </span>
                  </td>
                  {/* 통신이 끊기면 값이 안 오므로 0 + 빨강. 그 외에는 API 가 준 값을 그대로(색 판정 없음) */}
                  <td className={`py-2 text-right font-bold ${down ? 'text-red-300' : 'text-slate-200'}`}>{fmt(down ? 0 : inv.acKw, 1)}</td>
                  <td className={`py-2 text-right font-bold ${down ? 'text-red-300' : 'text-slate-300'}`}>{fmt(down ? 0 : inv.dcKw, 1)}</td>
                  <td className={`py-2 text-right font-bold ${down ? 'text-red-300' : 'text-slate-300'}`}>{fmt(down ? 0 : inv.todayKwh, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 금액(오늘 번 돈·누적 절감액)은 여기 두지 않는다(2026-09-09 사용자 확정) —
            발전소 상세는 "설비가 지금 어떤가"를 보는 화면이고, 얼마 아꼈는지는 시설 화면의 몫이다 */}
      </Section>

      {/* 발전량 시뮬레이션(#8). 재해 시뮬(지진·홍수·태풍)은 인천 개발물을 가져와 붙일 예정 — 우리 범위 아님 */}
      <div className="px-5 py-3">
        <button
          type="button"
          onClick={onRunGen}
          className="w-full rounded-lg bg-blue-600/90 px-2 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-blue-600"
        >
          발전량 시뮬레이션
        </button>
      </div>
    </>
  );
}
