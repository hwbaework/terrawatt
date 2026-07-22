import { useState } from 'react';
import { PRICE_CARDS_LAND, PRICE_CARDS_JEJU } from '../data/market';
import { MIcon } from '../lib/MIcon';

/* 1단계 · 단가 패널 — energy-landing(/insight/trend) '단가' 카드 6종을 지도 오버레이로.
   SMP · REC현물 · SMP+1REC · 장기계약 · RE100용 REC · 탄소배출권 + 육지/제주 토글 */
export function MarketPanel() {
  const [region, setRegion] = useState<'육지' | '제주'>('육지');
  const cards = region === '육지' ? PRICE_CARDS_LAND : PRICE_CARDS_JEJU;

  return (
    <div className="w-64 rounded-xl bg-black/70 px-4 py-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-bold tracking-wide text-white">
          <MIcon name="payments" size={14} className="text-slate-400" /> 단가
        </span>
        <div className="inline-flex rounded-md bg-white/10 p-0.5">
          {(['육지', '제주'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                region === r ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {cards.map((c) => (
          <div key={c.key} className="rounded-lg bg-white/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: c.color }} />
              <span className="text-[11px] font-semibold text-slate-200">{c.label}</span>
              <span className="ml-auto text-[9px] text-slate-500">{c.date}</span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="text-sm font-bold text-white">
                {c.value} <span className="text-[9px] font-medium text-slate-500">{c.unit}</span>
              </span>
              <span
                className={`text-[11px] font-bold ${
                  c.up === null ? 'text-slate-500' : c.up ? 'text-red-400' : 'text-sky-400'
                }`}
              >
                {c.up === null ? '—' : c.up ? '▲' : '▼'} {c.delta}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
