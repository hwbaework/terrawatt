import { useState } from 'react';
import { basicSaveWonPerMonth, totalKwh, type GenSimResult, type MonthForecast } from '../lib/genSim';
import { MIcon } from '../../v2/lib/MIcon';

/* 발전량 시뮬레이션 결과 — 지도 왼쪽에 뜬다 (서랍이 아니라 화면에).
   발전량 + 월별 막대(마우스 올리면 그 달 상세) + 예상 절감액.
   단가는 자가소비 고정(157.6원, 2026-08-24) — "오르내리면?"은 ±10% 민감도 두 줄로 보여준다. */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 큰 금액을 "1억 2,300만원"처럼 읽기 쉽게 */
export function money(won: number): string {
  if (won < 10000) return `${num(Math.round(won))}원`;
  const eok = Math.floor(won / 100_000_000);
  const man = Math.round((won % 100_000_000) / 10_000);
  return eok > 0 ? `${eok}억 ${num(man)}만원` : `${num(man)}만원`;
}

/** 월별 막대 — 마우스를 올리면 그 달 발전량·절감액(전력량+기본요금) 툴팁 */
function Bars({ rows, price, basicPerMonth }: { rows: MonthForecast[]; price: number; basicPerMonth: number }) {
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
          <div className="text-[12px] font-bold text-slate-200">
            {hr.year}.{hr.month}월
          </div>
          <div className="text-[13px] font-extrabold text-blue-300">{num(hr.kwh)} kWh</div>
          <div className="text-[12px] font-bold text-emerald-300">{money(hr.kwh * price + basicPerMonth)}</div>
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
                <text x={i * bw + bw / 2} y={H - 4} fill={on ? '#93c5fd' : '#64748b'} fontSize={10} textAnchor="middle">
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
  onOpenDoc?: () => void;
}) {
  const { rows, ppaPrice, capacityKw } = result;
  const total = totalKwh(rows);
  /* 절감액 = 전력량(발전량×157.6) + 기본요금(용량×30%×8,320×개월) — 사업성 검토와 같은 식(2026-08-24).
     단가 ±10% 민감도는 전력량 쪽에만 붙는다(기본요금 단가는 별개) */
  const energyWon = total * ppaPrice;
  const basicWon = basicSaveWonPerMonth(capacityKw) * rows.length;
  const revenue = energyWon + basicWon;
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <div className="absolute left-4 top-32 z-20 w-[19rem] rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-extrabold text-white">발전량 시뮬레이션</h3>
          <div className="mt-0.5 text-[12px] text-slate-400">
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
        <span className="text-[12px] text-slate-400">예상 발전량</span>
        <span className="text-[16px] font-extrabold text-white">
          {num(total)}
          <span className="ml-1 text-[12px] font-bold text-slate-500">kWh</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between rounded-lg bg-white/[0.04] px-3 py-2.5">
        <span className="text-[12px] text-slate-400">월평균</span>
        <span className="text-[13px] font-extrabold text-slate-200">
          {num(total / rows.length)}
          <span className="ml-1 text-[12px] font-bold text-slate-500">kWh</span>
        </span>
      </div>

      <div className="mt-3">
        <Bars rows={rows} price={ppaPrice} basicPerMonth={basicSaveWonPerMonth(capacityKw)} />
      </div>

      {/* 예상 절감액 = 전력량 + 기본요금 — 사업성 검토와 같은 식. 밑에 단가 ±10% 민감도 */}
      <div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-emerald-200/70">예상 절감액</span>
          <span className="text-[19px] font-extrabold text-emerald-300">{money(revenue)}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-emerald-200/50">
          전력량 {money(energyWon)} ({num(total)} kWh × {num(ppaPrice, 1)}원) + 기본요금 {money(basicWon)}
        </div>
      </div>

      {/* 단가가 오르내리면? — 전력량 단가에만 ±10% (기본요금 단가는 별개라 그대로) */}
      <div className="mt-1.5 rounded-lg bg-white/[0.04] px-3 py-2.5">
        <div className="text-[11.5px] font-bold text-slate-400">전력량 단가가 오르내리면 (±10%)</div>
        <div className="mt-1.5 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] text-slate-500">{num(ppaPrice * 0.9, 1)} 원/kWh 로 내리면</span>
            <span className="text-[13px] font-extrabold text-red-300">{money(energyWon * 0.9 + basicWon)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] text-slate-500">{num(ppaPrice * 1.1, 1)} 원/kWh 로 오르면</span>
            <span className="text-[13px] font-extrabold text-emerald-300">{money(energyWon * 1.1 + basicWon)}</span>
          </div>
        </div>
      </div>

      {/* 문서는 한일튜브 사양(주소·모델)으로 짜여 있어, 다른 대상(세운 건물)일 땐 안 보인다 */}
      {onOpenDoc && (
        <button
          type="button"
          onClick={onOpenDoc}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[13px] font-bold text-slate-200 transition-colors hover:bg-white/20"
        >
          <MIcon name="payments" size={14} className="text-slate-400" />
          문서로 보기
        </button>
      )}
    </div>
  );
}
