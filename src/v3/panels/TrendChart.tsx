import { minutesSince } from '../data/umeiDx';

/* 센서 추이 — 최근 hours 시간, 가로축 왼쪽 'n시간 전' · 오른쪽 '현재'.
   점과 점 사이가 10분 넘게 비면 선을 끊는다(수집이 끊긴 구간을 이어 그리지 않는다).
   marks = 등급이 바뀐 시각 같은 점 표시 */

export interface TrendPoint {
  /** 'YYYY-MM-DD HH:MM:SS'(KST) */
  at: string;
  v: number;
}

export function TrendChart({
  pts,
  hours = 24,
  min,
  max,
  unit,
  marks = [],
  label,
}: {
  pts: TrendPoint[];
  hours?: number;
  /** 세로축 고정 — 비우면 값에 맞춘다 */
  min?: number;
  max?: number;
  unit?: string;
  marks?: (TrendPoint & { color: string })[];
  label: string;
}) {
  const W = 320;
  const H = 120;
  const L = 34;
  const span = hours * 60;
  const xs = pts.map((p) => ({ m: minutesSince(p.at) ?? 0, v: p.v })).sort((a, b) => b.m - a.m);
  const vals = xs.map((p) => p.v);
  let lo = min ?? Math.min(...vals);
  let hi = max ?? Math.max(...vals);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const X = (m: number) => L + ((span - m) / span) * (W - L - 6);
  const Y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (H - 28);
  const path = xs
    .map((p, i) => `${i === 0 || xs[i - 1]!.m - p.m > 10 ? 'M' : 'L'}${X(p.m).toFixed(1)},${Y(p.v).toFixed(1)}`)
    .join(' ');
  const num = (v: number) => (Math.abs(hi - lo) < 10 ? v.toFixed(1) : String(Math.round(v)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
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
        <circle key={i} cx={X(minutesSince(p.at) ?? 0)} cy={Y(p.v)} r="3.5" fill={p.color} />
      ))}
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
  );
}
