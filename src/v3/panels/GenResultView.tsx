import { useState } from 'react';
import { totalKwh, type GenSimResult, type MonthForecast } from '../lib/genSim';
import { MIcon } from '../../v2/lib/MIcon';

/* 발전량 시뮬레이션 결과 — 지도 왼쪽에 뜬다 (서랍이 아니라 화면에).
   발전량 + 월별 막대(마우스 올리면 그 달 상세) + 예상 수익.
   계약 단가는 조건 칸(서랍)에서 입력하고, 여기 수익은 그 단가로 즉시 갱신된다. */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 큰 금액을 "1억 2,300만원"처럼 읽기 쉽게 */
export function money(won: number): string {
  if (won < 10000) return `${num(Math.round(won))}원`;
  const eok = Math.floor(won / 100_000_000);
  const man = Math.round((won % 100_000_000) / 10_000);
  return eok > 0 ? `${eok}억 ${num(man)}만원` : `${num(man)}만원`;
}

/** 월별 막대 — 마우스를 올리면 그 달 발전량·수익 툴팁 */
function Bars({ rows, price }: { rows: MonthForecast[]; price: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 272;
  const H = 104;
  const PAD_B = 16;
  const max = Math.max(...rows.map((r) => r.kwh)) || 1;
  const bw = W / rows.length;
  const hr = hover != null ? rows[hover] : null;

  return (
    <div className="relative">
      {hr && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 text-center shadow-xl"
          style={{ left: `${((hover! + 0.5) / rows.length) * 100}%` }}
        >
          <div className="text-[10px] font-bold text-slate-200">
            {hr.year}.{hr.month}월
          </div>
          <div className="text-[11px] font-extrabold text-blue-300">{num(hr.kwh)} kWh</div>
          <div className="text-[10px] font-bold text-emerald-300">{money(hr.kwh * price)}</div>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="월별 예상 발전량">
        {rows.map((r, i) => {
          const h = (r.kwh / max) * (H - PAD_B - 8);
          const on = hover === i;
          return (
            <g key={`${r.year}-${r.month}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect
                x={i * bw + bw * 0.18}
                y={H - PAD_B - h}
                width={bw * 0.64}
                height={h}
                rx={2}
                fill={on ? '#60a5fa' : 'rgba(96,165,250,.75)'}
              />
              {rows.length <= 13 && (
                <text x={i * bw + bw / 2} y={H - 4} fill={on ? '#93c5fd' : '#64748b'} fontSize={8.5} textAnchor="middle">
                  {r.month}월
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GenResultView({
  result,
  onClose,
  onOpenDoc,
}: {
  result: GenSimResult;
  onClose: () => void;
  onOpenDoc: () => void;
}) {
  const { rows, ppaPrice } = result;
  const total = totalKwh(rows);
  const revenue = total * ppaPrice;
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <div className="absolute left-4 top-32 z-20 w-[19rem] rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-extrabold text-white">발전량 시뮬레이션</h3>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {first.year}.{first.month} ~ {last.year}.{last.month} · {rows.length}개월
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="닫기"
          className="-mr-1 -mt-1 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          <MIcon name="close" size={15} />
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between rounded-lg bg-white/[0.04] px-3 py-2.5">
        <span className="text-[10px] text-slate-400">예상 발전량</span>
        <span className="text-[16px] font-extrabold text-white">
          {num(total)}
          <span className="ml-1 text-[10px] font-bold text-slate-500">kWh</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between rounded-lg bg-white/[0.04] px-3 py-2.5">
        <span className="text-[10px] text-slate-400">월평균</span>
        <span className="text-[13px] font-extrabold text-slate-200">
          {num(total / rows.length)}
          <span className="ml-1 text-[10px] font-bold text-slate-500">kWh</span>
        </span>
      </div>

      <div className="mt-3">
        <Bars rows={rows} price={ppaPrice} />
      </div>

      {/* 예상 수익 — 조건 칸의 계약 단가로 즉시 갱신 */}
      <div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-emerald-200/70">예상 수익</span>
          <span className="text-[19px] font-extrabold text-emerald-300">{money(revenue)}</span>
        </div>
        <div className="mt-0.5 text-[9px] text-emerald-200/50">
          발전량 {num(total)} kWh × PPA {ppaPrice} 원/kWh
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenDoc}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[11.5px] font-bold text-slate-200 transition-colors hover:bg-white/20"
      >
        <MIcon name="payments" size={14} className="text-slate-400" />
        문서로 보기
      </button>
    </div>
  );
}
