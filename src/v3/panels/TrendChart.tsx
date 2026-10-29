import { useState, type ReactNode } from 'react';
import { minutesSince } from '../data/umeiDx';

/* 센서 추이 — 최근 hours 시간, 가로축 왼쪽 'n시간 전' · 오른쪽 '현재'.
   점과 점 사이가 10분 넘게 비면 선을 끊는다(수집이 끊긴 구간을 이어 그리지 않는다).
   marks = 등급이 바뀐 시각 같은 점 표시(글자 없이 색만). 올리면 가장 가까운 점의 시각 · 값(tip) */

export interface TrendPoint {
  /** 'YYYY-MM-DD HH:MM:SS'(KST) */
  at: string;
  v: number;
}

export function TrendChart<T extends TrendPoint>({
  pts,
  hours = 24,
  min,
  max,
  unit,
  marks = [],
  label,
  tip,
}: {
  pts: T[];
  hours?: number;
  /** 세로축 고정 — 비우면 값에 맞춘다 */
  min?: number;
  max?: number;
  unit?: string;
  marks?: (TrendPoint & { color: string })[];
  label: string;
  /** 올렸을 때 보일 내용 — 비우면 시각 · 값 */
  tip?: (p: T) => ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 120;
  const L = 34;
  const span = hours * 60;
  const xs = pts.map((p) => ({ p, m: minutesSince(p.at) ?? 0 })).sort((a, b) => b.m - a.m);
  const vals = xs.map((x) => x.p.v);
  let lo = min ?? Math.min(...vals);
  let hi = max ?? Math.max(...vals);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const X = (m: number) => L + ((span - m) / span) * (W - L - 6);
  const Y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (H - 28);
  const path = xs
    .map((x, i) => `${i === 0 || xs[i - 1]!.m - x.m > 10 ? 'M' : 'L'}${X(x.m).toFixed(1)},${Y(x.p.v).toFixed(1)}`)
    .join(' ');
  const num = (v: number) => (Math.abs(hi - lo) < 10 ? v.toFixed(1) : String(Math.round(v)));
  const h = hover != null ? xs[hover] : undefined;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          let best = -1;
          let d = Infinity;
          xs.forEach((p, i) => {
            const dd = Math.abs(X(p.m) - x);
            if (dd < d) {
              d = dd;
              best = i;
            }
          });
          setHover(best >= 0 ? best : null);
        }}
      >
        {[hi, lo].map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - 6} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,.08)" />
            <text x={L - 5} y={Y(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {num(t)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
        {marks.map((p, i) => (
          <circle key={i} cx={X(minutesSince(p.at) ?? 0)} cy={Y(p.v)} r="4" fill={p.color} stroke="#0b1220" strokeWidth="1.2" />
        ))}
        {h && (
          <g>
            <line x1={X(h.m)} x2={X(h.m)} y1={8} y2={H - 20} stroke="rgba(255,255,255,.25)" strokeDasharray="2 2" />
            <circle cx={X(h.m)} cy={Y(h.p.v)} r="3" fill="#e2e8f0" />
          </g>
        )}
        <text x={L} y={H - 4} fontSize="10" fill="#64748b">
          {hours}시간 전
        </text>
        {unit && (
          <text x={(L + W) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#64748b">
            {unit}
          </text>
        )}
        <text x={W - 6} y={H - 4} textAnchor="end" fontSize="10" fill="#64748b">
          현재
        </text>
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11.5px] text-slate-200 ring-1 ring-white/10"
          style={{ left: `${Math.min(85, Math.max(15, (X(h.m) / W) * 100))}%` }}
        >
          <span className="mr-1.5 text-slate-400">{h.p.at.slice(11, 16)}</span>
          {tip ? tip(h.p) : num(h.p.v)}
        </div>
      )}
    </div>
  );
}
