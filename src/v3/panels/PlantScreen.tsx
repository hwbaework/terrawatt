import { PLANT_DEMO, type PlantReading } from '../data/demoReadings';
import { Section } from './Drawer';

/* 발전소 상세 — 한일튜브 본인이 보는 화면.

   표시 규칙(사용자 지시):
     · 정상 여부는 **이름 앞 점** 하나로만 (초록=정상 / 빨강=이상)
     · 출처·갱신주기 같은 부가 설명은 화면에 쓰지 않는다 (정보가 많으면 안 읽힌다)
     · 값은 예시 데이터 (`demoReadings.ts`) — 실연동 시 그 파일만 교체 */

const fmt = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 이름 앞 상태 점 */
function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`}
    />
  );
}

/** 큰 숫자 타일 */
function Tile({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[17px] font-extrabold leading-tight text-white">
        {value}
        {unit && <span className="ml-1 text-[10px] font-bold text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[9.5px] text-slate-500">{sub}</div>}
    </div>
  );
}

/** 금일 누적 발전량 추이 — 라이브러리 없이 SVG로 직접 그린다 */
function TodayChart({ curve }: { curve: PlantReading['todayCurve'] }) {
  const W = 288;
  const H = 96;
  const PAD_B = 16; // 시각 라벨 자리
  const max = Math.max(...curve.map(([, v]) => v)) || 1;
  const x = (i: number) => (i / (curve.length - 1)) * W;
  const y = (v: number) => (H - PAD_B) * (1 - v / max);

  const line = curve.map(([, v], i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H - PAD_B} L0,${H - PAD_B} Z`;

  return (
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
      {/* 양 끝 시각만 표시 — 눈금이 많으면 오히려 안 읽힌다 */}
      <text x={0} y={H - 3} fill="#64748b" fontSize={9}>
        {curve[0][0]}
      </text>
      <text x={W} y={H - 3} fill="#64748b" fontSize={9} textAnchor="end">
        {curve[curve.length - 1][0]}
      </text>
    </svg>
  );
}

export function PlantScreen({ onRunGen }: { onRunGen: () => void }) {
  const d = PLANT_DEMO;

  return (
    <>
      {/* 설비 상태 — 점 + 이름만 */}
      <Section title="설비 상태">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
          <span className="flex items-center">
            <Dot ok={d.rtuPower} />
            RTU 전원
          </span>
          <span className="flex items-center">
            <Dot ok={d.rtuComm} />
            RTU 통신
          </span>
          <span className="flex items-center">
            <Dot ok />
            인버터 통신 {d.inverterComm}
          </span>
        </div>
      </Section>

      <Section title="발전 현황">
        <div className="grid grid-cols-2 gap-2">
          <Tile label="현재 출력" value={fmt(d.currentKw, 1)} unit="kW" sub={`가동률 ${d.loadPercent}%`} />
          <Tile label="금일 발전량" value={fmt(d.todayKwh)} unit="kWh" />
          <Tile label="설비 용량" value={fmt(d.capacityKw, 2)} unit="kW" sub={`인버터 ${d.inverters.length}대`} />
          <Tile label="누적 발전량" value={fmt(d.totalKwh)} unit="kWh" />
          <Tile label="금일 발전시간" value={fmt(d.todayHours, 1)} unit="h" />
        </div>
        {/* 가동률 막대 */}
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-emerald-500" style={{ width: `${d.loadPercent}%` }} />
        </div>
      </Section>

      <Section title="금일 발전량 추이">
        <TodayChart curve={d.todayCurve} />
      </Section>

      <Section title={`인버터 ${d.inverters.length}대`}>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-white/10 text-[9.5px] text-slate-500">
              <th className="py-1.5 text-left font-semibold">인버터</th>
              <th className="py-1.5 text-right font-semibold">DC전력</th>
              <th className="py-1.5 text-right font-semibold">AC전력</th>
            </tr>
          </thead>
          <tbody>
            {d.inverters.map((inv) => (
              <tr key={inv.id} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-left">
                  <span className="flex items-center font-bold text-slate-200">
                    <Dot ok={inv.ok} />
                    {inv.id}
                    <span className="ml-1 text-[9.5px] font-normal text-slate-500">{inv.ratedKw}kW</span>
                  </span>
                </td>
                <td className="py-2 text-right font-bold text-slate-300">{fmt(inv.dcKw, 1)}</td>
                <td className="py-2 text-right font-bold text-slate-300">{fmt(inv.acKw, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 발전량 시뮬레이션(#8). 재해 시뮬(지진·홍수·태풍)은 인천 개발물을 가져와 붙일 예정 — 우리 범위 아님 */}
      <div className="px-5 py-3">
        <button
          type="button"
          onClick={onRunGen}
          className="w-full rounded-lg bg-blue-600/90 px-2 py-2.5 text-[11.5px] font-bold text-white transition-colors hover:bg-blue-600"
        >
          발전량 시뮬레이션
        </button>
      </div>
    </>
  );
}
