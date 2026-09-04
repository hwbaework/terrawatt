import { useState } from 'react';
import { fetchMonthlyIrradiance, forecast, WEATHER_YEAR, type GenForecast } from '../lib/genSim';
import { PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { ActionButton, Section } from './Drawer';

/* 발전량 시뮬레이션 — 기간을 정하고 [시작]. 결과는 지도 왼쪽 화면에 뜬다.

   기간 = 프리셋(1/3/6/12개월, 다음 달부터) 또는 [기간 지정] 원하는 시작~끝 월.
   일사량은 작년 울산 실측(NASA POWER)을 시작할 때 받아온다 — 실패하면 실패했다고 말한다.

   ★ 단가는 입력이 아니다(2026-08-24) — 한일튜브는 자가소비라 SELF_TARIFF(157.6원/kWh) 고정.
     "단가가 오르내리면?"은 결과 화면의 민감도(±10%)로 보여준다 — 건물 세우기 결과와 같은 방식. */

const PERIODS = [
  { n: 1, label: '1개월' },
  { n: 3, label: '3개월' },
  { n: 6, label: '6개월' },
  { n: 12, label: '1년' },
] as const;

/** "YYYY-MM" → {y, m} */
const parseYm = (s: string) => ({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) });

/** 시뮬 대상 — 안 주면 한일튜브(HOME). 건물 세우기에서 만든 건물이면 그 용량·위치 */
export interface GenSimTarget {
  label: string;
  capacityKw: number;
  lng: number;
  lat: number;
}

export function GenSimScreen({
  onForecast,
  target,
  price,
  onPriceChange,
}: {
  /** [시작] 시 발전량만 넘긴다 (단가와 무관 — 단가 변경은 금액만 즉시 갱신) */
  onForecast: (gen: GenForecast) => void;
  target?: GenSimTarget;
  /** 전력량 단가 (원/kWh) — 기본 157.6(자가소비), 편집 가능 */
  price: number;
  onPriceChange: (p: number) => void;
}) {
  const capacityKw = target?.capacityKw ?? PLANT_SPECS[HOME.facilityId]?.capacityKw ?? 0;
  const site = target ?? { label: HOME.name, lng: HOME.lng, lat: HOME.lat };
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
      const irr = await fetchMonthlyIrradiance(site.lng, site.lat);
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
              className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition-colors ${
                months === p.n ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-300 hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMonths('custom')}
            className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition-colors ${
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
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[13px] text-slate-200 outline-none [color-scheme:dark]"
            />
            <span className="text-[13px] text-slate-500">~</span>
            <input
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[13px] text-slate-200 outline-none [color-scheme:dark]"
            />
          </div>
        )}

        <p className="mt-2 text-[11.5px] text-slate-500">
          {site.label} · 설비 {capacityKw.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} kW · 날씨 {WEATHER_YEAR}년 울산 실측
        </p>
      </Section>

      {/* 적용 단가 — 기본 157.6원(자가소비), 편집 가능(2026-08-24). 바꾸면 결과의 금액이 바로 갱신된다 */}
      <Section title="적용 단가 (자가소비)">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-400">현재 전력량 단가</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step={0.1}
              value={price}
              onChange={(e) => onPriceChange(Math.max(0, Number(e.target.value)))}
              className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-[14px] font-bold text-white outline-none focus:border-sky-400/60"
            />
            <span className="text-[12px] text-slate-500">원/kWh</span>
          </div>
        </div>
      </Section>

      <ActionButton label={busy ? '일사량 데이터 받는 중…' : '시작'} onClick={() => !busy && void run()} />

      {error && (
        <div className="px-5 pb-2">
          <p className="rounded-lg bg-red-500/10 px-2.5 py-2 text-[12px] leading-relaxed text-red-300">{error}</p>
        </div>
      )}
    </>
  );
}
