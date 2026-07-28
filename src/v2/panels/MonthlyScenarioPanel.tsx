import { useState } from 'react';
import { MIcon } from '../lib/MIcon';
import { monthlyKwh, type MonthWx } from '../data/monthlyScenario';

/* 월별 시뮬레이션 — 기간을 정하고 ▶ 누르면 해가 뜨고 지는 하루가 반복되며
   누적 발전량 계기판이 낮에만 올라간다. 하루 재생 = 실제 1주(일별 실측):
   그 주에 진짜 비 온 날 차례에만 지도에 비가 내리고, 그날은 계기판도 느려진다.
   실행 엔진(runSim)은 AppV2 — 여기는 조작·표시만. */

export type SimView = {
  playing: boolean;
  month: number; // 지금 지나는 달 (1~12)
  weekN: number; // 그 달의 몇 주차 (1~5)
  hour: number; // 0~24
  cumKwh: number; // 누적 발전량
  rainMm: number; // 지금 지나는 실제 날의 강수(mm) — 0이면 맑음
  months: number[]; // 시뮬 기간 전체
};

/* 기간 프리셋 — 대부분 계절 단위로 이야기하니까. 겨울은 12→2 로 해 넘어감 */
const PRESETS = [
  { label: '봄', a: 3, b: 5 },
  { label: '여름', a: 6, b: 8 },
  { label: '가을', a: 9, b: 11 },
  { label: '겨울', a: 12, b: 2 },
  { label: '1년', a: 1, b: 12 },
];

/** 시작~끝 월을 순서대로 (12월→2월처럼 해 넘어가는 범위 지원) */
export function rangeMonths(a: number, b: number): number[] {
  const out: number[] = [];
  let m = a;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === b) break;
    m = (m % 12) + 1;
  }
  return out;
}

export function MonthlyScenarioPanel({
  rows,
  source,
  kwp,
  sim,
  busy,
  onRun,
  onStop,
  onClose,
}: {
  rows: MonthWx[];
  source: 'nasa' | 'fallback';
  kwp: number;
  /** 시뮬 진행 상태 (AppV2가 매 프레임 갱신) — null이면 대기 */
  sim: SimView | null;
  /** 일별 실측 데이터 불러오는 중 (첫 시작 때 1회) */
  busy: boolean;
  onRun: (months: number[]) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const [selA, setSelA] = useState(1); // 기간 시작 월
  const [selB, setSelB] = useState(3); // 기간 끝 월
  const months = rangeMonths(selA, selB);
  const kwhs = rows.map((r) => monthlyKwh(kwp, r));
  const max = Math.max(...kwhs, 1);
  const periodTotal = months.reduce((a, m) => a + kwhs[m - 1], 0);
  const inRange = (m: number) => months.includes(m);
  const night = sim?.playing && (sim.hour < 6 || sim.hour >= 18);

  /* 완료 상태에서 기간을 바꾸면 지난 결과를 지워 새 시뮬 준비 — 몇 번이든 다시 돌릴 수 있게 */
  const changePeriod = (a: number, b: number) => {
    if (sim && !sim.playing) onStop();
    setSelA(a);
    setSelB(b);
  };

  const W = 516;
  const H = 76;
  const bw = W / 12;

  return (
    // 하단 중앙, WorldState 시계 바로 위 — 지도를 넓게 남겨 밤낮·비 효과가 보이게
    <div className="pointer-events-auto absolute bottom-[74px] left-1/2 z-10 w-[540px] max-w-[94vw] -translate-x-1/2 rounded-xl bg-black/65 p-3 shadow-xl backdrop-blur">
      {/* 1줄: 제목 + 닫기 / 2줄: 기간 설정 + 시작 — 한 줄에 다 넣으면 완료 후 '다시 시작'에서 줄이 깨짐 */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-white">
          <MIcon name="schedule" size={17} className="text-orange-400" />
          월별 시뮬레이션
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-0.5 text-slate-400 transition-colors hover:text-white"
        >
          <MIcon name="close" size={18} />
        </button>
      </div>

      {/* 기간 설정 — 프리셋(계절) 또는 직접 월 선택 */}
      <div className="mt-2 flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={sim?.playing}
              onClick={() => changePeriod(p.a, p.b)}
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                selA === p.a && selB === p.b
                  ? 'bg-orange-600 text-white'
                  : 'bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
          <select
            value={selA}
            disabled={sim?.playing}
            onChange={(e) => changePeriod(Number(e.target.value), selB)}
            className="rounded-md bg-white/10 px-1 py-0.5 text-[11px] font-bold text-white outline-none disabled:opacity-40"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1} className="bg-slate-900">
                {i + 1}월
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500">~</span>
          <select
            value={selB}
            disabled={sim?.playing}
            onChange={(e) => changePeriod(selA, Number(e.target.value))}
            className="rounded-md bg-white/10 px-1 py-0.5 text-[11px] font-bold text-white outline-none disabled:opacity-40"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1} className="bg-slate-900">
                {i + 1}월
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => (sim?.playing ? onStop() : onRun(months))}
            className={`ml-auto flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold text-white transition-colors disabled:opacity-50 ${
              sim?.playing ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <MIcon name={sim?.playing ? 'pause' : 'chevron_right'} size={14} />
            {busy ? '준비 중…' : sim?.playing ? '정지' : sim ? '다시 시작' : '시작'}
          </button>
      </div>

      {/* 막대 그래프 — 기간 밖은 흐리게, 시뮬 중인 달은 밝게 */}
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="mt-2 w-full">
        {rows.map((r, i) => {
          const h = Math.max(3, (kwhs[i] / max) * H);
          const cur = sim?.playing && sim.month === r.m;
          return (
            <g key={r.m}>
              <rect
                x={i * bw + 5}
                y={H - h}
                width={bw - 10}
                height={h}
                rx={2}
                fill={cur ? '#fdba74' : '#f97316'}
                opacity={cur ? 1 : inRange(r.m) ? 0.9 : 0.2}
              />
              <text
                x={i * bw + bw / 2}
                y={H + 11}
                textAnchor="middle"
                fontSize={9}
                fontWeight={cur ? 800 : 500}
                fill={cur ? '#fdba74' : inRange(r.m) ? '#cbd5e1' : '#64748b'}
              >
                {r.m}월
              </text>
            </g>
          );
        })}
      </svg>

      {/* 상태줄 — 시뮬 중엔 시계·일차·누적 계기판(낮에만 올라감) */}
      {sim ? (
        <p className="mt-1 flex items-baseline gap-2 text-[11px] text-slate-400">
          {sim.playing ? (
            <>
              <span className={`font-bold ${night ? 'text-indigo-300' : 'text-amber-300'}`}>
                {night ? '밤' : '낮'} {String(Math.floor(sim.hour)).padStart(2, '0')}:
                {String(Math.floor((sim.hour % 1) * 60)).padStart(2, '0')}
              </span>
              <span>
                {sim.month}월 {sim.weekN}주차
              </span>
              {sim.rainMm > 0 && <span className="font-bold text-sky-300">비 {sim.rainMm}mm</span>}
            </>
          ) : (
            <span className="font-bold text-emerald-300">완료 — {sim.months.length}개월 · 기간을 바꾸거나 다시 시작</span>
          )}
          <span className="ml-auto text-[13px] font-extrabold tabular-nums text-white">
            {sim.cumKwh.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">kWh 누적</span>
          </span>
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">
          {selA}월~{selB}월 예상 합계{' '}
          <span className="font-semibold text-white">{periodTotal.toLocaleString()} kWh</span>
          <span className="ml-1.5">— ▶ 시작을 누르면 하루하루 재생됩니다</span>
        </p>
      )}

      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        {source === 'nasa' ? '이 위치 2025년 실측 일사량·강수(위성 관측)' : '울산 2025년 실측 날씨(저장값)'} ·{' '}
        {kwp.toLocaleString()}kWp · 성능비 80% · 하루 재생 = 실제 1주 — 비 온 날 차례에 비가 내립니다
      </p>
    </div>
  );
}
