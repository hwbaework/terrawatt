import { useState } from 'react';
import { INVERTER_HISTORY, PLANT_DEMO, invLabel, type PlantReading } from '../data/demoReadings';
import { INVERTER_COMM_DOWN, type PlantEventKind } from '../data/plantEvents';
import { SELF_TARIFF } from '../lib/bizSim';
import { MIcon } from '../../v2/lib/MIcon';
import { Section } from './Drawer';

/* 발전소 상세 — 한일튜브 본인이 보는 화면.

   표시 규칙(사용자 지시):
     · 정상 여부는 **이름 앞 점** 하나로만 (초록=정상 / 빨강=이상)
     · 인버터는 "지금 얼마 만들고 얼마 버는지"가 핵심(2026-08-26) — 예지보전과 같은 카드로,
       각 인버터 현재 출력 + 시간당 금액, 4대 아래 금액 큰 박스(금일·누적)
     · 값은 예시 데이터 (`demoReadings.ts`) — 실연동 시 그 파일만 교체 */

const fmt = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 자가소비 전력량 단가(원/kWh) — 발전량을 "아낀 돈"으로 환산(SELF_TARIFF, 157.6) */
const RATE = SELF_TARIFF.energyKrwKwh;
/** 원 — 정확히(콤마) */
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
/** 억/만원 — 큰 금액을 짧게 */
const wonShort = (n: number) =>
  n >= 1e8 ? `${(n / 1e8).toFixed(2)}억원` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원` : won(n);

/** 이름 앞 상태 점 — 색은 둘뿐(2026-08-31 사용자 확정, 노란색 금지):
    초록 = 정상 / 빨강 = 고장 확정(DX riskLevel 연동 후에만). 그 외(통신 없음 등)는 회색 */
/* 점 색 = 상태값이 사실 2개다(2026-08-31 사용자 확정):
   빨강 = 꺼짐(전원 Off·통신 두절 — 데이터 자체가 안 옴) / 주황 = 고장(데이터는 오는데 설비 이상, API status_msg) / 초록 = 정상 */
function Dot({ ok, fault }: { ok: boolean; fault?: boolean }) {
  return (
    <span
      className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${
        !ok ? 'bg-red-400' : fault ? 'bg-amber-400' : 'bg-emerald-400'
      }`}
    />
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

/** 금일 누적 발전량 추이 — 라이브러리 없이 SVG로 직접 그린다.
    마우스를 올리면 그 시각의 누적 발전량 + 직전 시간 동안 얼마나 늘었는지 툴팁(2026-08-24, 발전량 시뮬 막대와 같은 문법) */
function TodayChart({ curve }: { curve: PlantReading['todayCurve'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 288;
  const H = 96;
  const PAD_B = 16; // 시각 라벨 자리
  const max = Math.max(...curve.map(([, v]) => v)) || 1;
  const x = (i: number) => (i / (curve.length - 1)) * W;
  const y = (v: number) => (H - PAD_B) * (1 - v / max);

  const line = curve.map(([, v], i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H - PAD_B} L0,${H - PAD_B} Z`;
  const hv = hover != null ? curve[hover] : null;
  const delta = hover != null && hover > 0 ? curve[hover][1] - curve[hover - 1][1] : null;

  return (
    <div className="relative">
      {hv && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 text-center shadow-xl"
          style={{ left: `${(x(hover!) / W) * 100}%` }}
        >
          <div className="text-[12px] font-bold text-slate-200">{hv[0]}</div>
          <div className="text-[13px] font-extrabold text-emerald-300">누적 {fmt(hv[1], 1)} kWh</div>
          {delta != null && <div className="text-[11.5px] text-slate-400">직전 1시간 +{fmt(delta, 1)} kWh</div>}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="금일 누적 발전량 추이">
        {/* 가로 눈금 */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={(H - PAD_B) * t}
            y2={(H - PAD_B) * t}
            stroke="rgba(255,255,255,.07)"
            strokeWidth={1}
          />
        ))}
        <path d={area} fill="rgba(52,211,153,.13)" />
        <path d={line} fill="none" stroke="#34d399" strokeWidth={1.8} strokeLinejoin="round" />
        {/* 호버 점 + 세로 안내선 */}
        {hv && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={H - PAD_B} stroke="rgba(52,211,153,.35)" strokeWidth={1} />
            <circle cx={x(hover!)} cy={y(hv[1])} r={3.5} fill="#34d399" stroke="#0f172a" strokeWidth={1.5} />
          </>
        )}
        {/* 마우스 판 — 점마다 세로 띠를 깔아 가장 가까운 시각을 잡는다 */}
        {curve.map((_, i) => (
          <rect
            key={i}
            x={i === 0 ? 0 : (x(i - 1) + x(i)) / 2}
            y={0}
            width={i === 0 || i === curve.length - 1 ? W / (curve.length - 1) / 2 : W / (curve.length - 1)}
            height={H - PAD_B}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {/* 양 끝 시각만 표시 — 눈금이 많으면 오히려 안 읽힌다 */}
        <text x={0} y={H - 3} fill="#64748b" fontSize={11}>
          {curve[0][0]}
        </text>
        <text x={W} y={H - 3} fill="#64748b" fontSize={11} textAnchor="end">
          {curve[curve.length - 1][0]}
        </text>
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

      <Section title="금일 발전량 추이">
        <TodayChart curve={d.todayCurve} />
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
              /* 예지보전 판정 — #2처럼 통신은 정상이고 값도 들어오는데 설비가 이상한 경우:
                 값은 그대로 두고 **상태만** 배지로 표시한다(2026-08-31 사용자 확정) */
              const verdict = INVERTER_HISTORY.find((h) => h.id === inv.id)?.verdict;
              const warn = !down && verdict && verdict !== '정상';
              return (
                <tr key={inv.id} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-left">
                    <span className="flex items-center font-bold text-slate-200">
                      {/* 점: 꺼짐=빨강(데이터 없음) / 점검 필요=주황(값은 있고 설비 이상) / 정상=초록.
                          순간 출력에는 여전히 색을 안 칠한다(구름·새·지붕 방향일 수 있음) — 판정 근거는 예지보전(5일 지속) */}
                      <Dot ok={inv.comm && !down} fault={warn} />
                      {invLabel(inv.id)}
                      <span className="ml-1 text-[11.5px] font-normal text-slate-500">{inv.ratedKw}kW</span>
                      {warn && (
                        <span className="ml-1.5 rounded bg-amber-400/10 px-1 py-px text-[10.5px] font-bold text-amber-300">
                          {verdict}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={`py-2 text-right font-bold ${down ? 'text-red-300' : 'text-slate-200'}`}>{fmt(down ? 0 : inv.acKw, 1)}</td>
                  <td className={`py-2 text-right font-bold ${down ? 'text-red-300' : 'text-slate-300'}`}>{fmt(down ? 0 : inv.dcKw, 1)}</td>
                  <td className={`py-2 text-right font-bold ${down ? 'text-red-300' : 'text-slate-300'}`}>{fmt(down ? 0 : inv.todayKwh, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 4대 아래 — "얼마 벌었나" 큰 박스(2026-08-26 사용자 확정): 금일·누적 금액 + 발전량.
            금액 = 발전량 × 157.6원(자가소비로 아낀 전기요금, SELF_TARIFF) */}
        <div className="mt-3 overflow-hidden rounded-xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.03]">
          <div className="flex items-end justify-between px-4 pt-3">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-200/80">
                <MIcon name="payments" size={15} className="text-emerald-300" />
                오늘 번 돈
              </div>
              <div className="mt-0.5 text-[24px] font-extrabold leading-none text-white">{won(d.todayKwh * RATE)}</div>
            </div>
            <div className="pb-0.5 text-right text-[11.5px] text-slate-400">
              금일 발전량
              <div className="text-[13px] font-bold text-slate-200">{fmt(d.todayKwh, 1)} kWh</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 px-4 py-2.5">
            <span className="text-[12px] text-slate-400">
              누적 절감액 <b className="ml-1 text-[14px] font-extrabold text-emerald-300">{wonShort(d.totalKwh * RATE)}</b>
            </span>
            <span className="text-[11.5px] text-slate-500">누적 {fmt(d.totalKwh)} kWh</span>
          </div>
        </div>
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
