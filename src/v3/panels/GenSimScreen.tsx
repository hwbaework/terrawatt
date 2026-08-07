import { useState } from 'react';
import { fetchMonthlyIrradiance, forecast, WEATHER_YEAR, type GenForecast } from '../lib/genSim';
import { PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { ActionButton, Section } from './Drawer';

/* 발전량 시뮬레이션 — 기간·계약 단가를 정하고 [시작]. 결과는 지도 왼쪽 화면에 뜬다.

   기간 = 프리셋(1/3/6/12개월, 다음 달부터) 또는 [기간 지정] 원하는 시작~끝 월.
   일사량은 작년 울산 실측(NASA POWER)을 시작할 때 받아온다 — 실패하면 실패했다고 말한다.

   ★ 계약 단가는 여기서 입력하지만, 바꿔도 [시작]을 다시 누를 필요 없다 —
     발전량은 단가와 무관하므로, 단가 변경은 결과의 수익만 즉시 바꾼다(NASA 재호출 없음).
     기간을 바꿨을 때만 [시작]으로 발전량을 다시 계산한다. */

const PERIODS = [
  { n: 1, label: '1개월' },
  { n: 3, label: '3개월' },
  { n: 6, label: '6개월' },
  { n: 12, label: '1년' },
] as const;

/** "YYYY-MM" → {y, m} */
const parseYm = (s: string) => ({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) });

export function GenSimScreen({
  price,
  onPriceChange,
  onForecast,
}: {
  price: number;
  onPriceChange: (p: number) => void;
  /** [시작] 시 발전량만 넘긴다 (단가 무관) */
  onForecast: (gen: GenForecast) => void;
}) {
  const capacityKw = PLANT_SPECS[HOME.facilityId]?.capacityKw ?? 0;
  const now = new Date();
  const nextYm = `${now.getFullYear()}-${String(now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2).padStart(2, '0')}`;

  const [months, setMonths] = useState<number | 'custom'>(3);
  const [from, setFrom] = useState(nextYm);
  const [to, setTo] = useState(nextYm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      let startY: number;
      let startM: number;
      let n: number;
      if (months === 'custom') {
        const a = parseYm(from);
        const b = parseYm(to);
        n = (b.y - a.y) * 12 + (b.m - a.m) + 1;
        if (n < 1) throw new Error('끝 월이 시작 월보다 빠릅니다');
        if (n > 24) throw new Error('기간은 최대 24개월까지');
        startY = a.y;
        startM = a.m;
      } else {
        const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        startY = start.getFullYear();
        startM = start.getMonth() + 1;
        n = months;
      }
      const irr = await fetchMonthlyIrradiance(HOME.lng, HOME.lat);
      const rows = forecast(capacityKw, irr, startY, startM, n);
      if (rows.some((r) => r.irr <= 0)) throw new Error('일부 달의 일사량 데이터가 없습니다');
      onForecast({ rows, capacityKw, weatherYear: WEATHER_YEAR });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section title="기간">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.n}
              type="button"
              onClick={() => setMonths(p.n)}
              className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-colors ${
                months === p.n ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-300 hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMonths('custom')}
            className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-colors ${
              months === 'custom' ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-300 hover:bg-white/10'
            }`}
          >
            기간 지정
          </button>
        </div>

        {months === 'custom' && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="month"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-slate-200 outline-none [color-scheme:dark]"
            />
            <span className="text-[11px] text-slate-500">~</span>
            <input
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-slate-200 outline-none [color-scheme:dark]"
            />
          </div>
        )}

        <p className="mt-2 text-[9.5px] text-slate-500">
          설비 {capacityKw.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} kW · 날씨 {WEATHER_YEAR}년 울산 실측
        </p>
      </Section>

      {/* 계약 단가 — 넣어보면 결과의 수익이 바로 바뀐다. 발전량은 단가와 무관해 재계산 안 함 */}
      <Section title="PPA 계약 단가">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">계약이 이 단가일 때</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step={0.1}
              value={price}
              onChange={(e) => onPriceChange(Math.max(0, Number(e.target.value)))}
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-[12px] font-bold text-slate-100 outline-none"
            />
            <span className="text-[10px] text-slate-500">원/kWh</span>
          </div>
        </div>
        <p className="mt-2 text-[9.5px] text-slate-500">
          단가를 바꾸면 결과의 수익이 바로 바뀝니다 ([시작] 다시 누를 필요 없음).
        </p>
      </Section>

      <ActionButton label={busy ? '일사량 데이터 받는 중…' : '시작'} onClick={() => !busy && void run()} />

      {error && (
        <div className="px-5 pb-2">
          <p className="rounded-lg bg-red-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-red-300">{error}</p>
        </div>
      )}
    </>
  );
}
