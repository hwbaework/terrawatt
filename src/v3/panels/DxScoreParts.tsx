import type { ReactNode } from 'react';

/* 예지보전 · 안전이 같이 쓰는 점수 화면 부품 — 글자 크기 · 칸 모양을 여기 한 곳에서 정한다(2026-11-03 사용자: 두 화면을 통일).
   두 화면 모두 점수(0~100)만 보인다. 정상 · 관찰 같은 등급 표시는 넣지 않는다. */

const NONE = '-';

/** 맨 위 전체 점수 */
export function ScoreSummary({ label, value, notes }: { label: string; value: string | null; notes: string[] }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-slate-200">{label}</span>
        <span className={`text-[20px] font-extrabold ${value ? 'text-white' : 'text-slate-300'}`}>
          {value ?? NONE}
          {value && <span className="ml-1 text-[14px] font-bold text-slate-300">/ 100</span>}
        </span>
      </div>
      {notes.map((n, i) => (
        <p key={n} className={`${i === 0 ? 'mt-1 ' : ''}text-[14px] text-slate-300`}>
          {n}
        </p>
      ))}
    </div>
  );
}

/** 인버터 한 줄 + 펼친 칸. 점: on = 수신 중 초록 / stop = 멈춤 빨강 / none = 대상 아님 · 응답 없음 회색.
 *  status 가 있으면(수집 중단 · 갱신 지연 · 미수신) 점수 대신 그 글자를 보인다 */
export function InverterRow({
  name,
  dot,
  score,
  status,
  open,
  onToggle,
  children,
}: {
  name: string;
  dot: 'on' | 'stop' | 'none';
  score: string | null;
  status?: string | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const dotCls = dot === 'on' ? 'bg-emerald-400' : dot === 'stop' ? 'bg-red-400' : 'bg-slate-500';
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.04]"
      >
        <span className="flex items-center text-[14px] font-bold text-slate-200">
          <span className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${dotCls}`} />
          {name}
        </span>
        <span className="flex items-baseline gap-1">
          {status ? (
            <span className="text-[14px] font-bold text-slate-300">{status}</span>
          ) : (
            <>
              <span className={`text-[17px] font-extrabold ${score ? 'text-white' : 'text-slate-300'}`}>{score ?? NONE}</span>
              {score && <span className="text-[14px] font-bold text-slate-300">점</span>}
            </>
          )}
        </span>
      </button>
      {open && <div className="border-t border-white/10 px-3 py-2.5">{children}</div>}
    </div>
  );
}

/** 펼친 칸의 값 목록 */
export function ValueList({ children }: { children: ReactNode }) {
  return <dl className="space-y-2 text-[14px]">{children}</dl>;
}

/** 펼친 칸의 한 줄 — hot = 가장 높은 위험점수처럼 눈에 띄어야 하는 값 */
export function Line({ label, value, hot }: { label: string; value: string | null; hot?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-300">{label}</dt>
      <dd className={`font-bold ${!value ? 'text-slate-300' : hot ? 'text-amber-400' : 'text-white'}`}>
        {value ?? NONE}
      </dd>
    </div>
  );
}

/** 펼친 칸의 안내 글 */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[14px] text-slate-300 ${className}`}>{children}</p>;
}

/** 추이가 비었을 때 */
export function TrendEmpty({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-[110px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[14px] text-slate-300">
      {loading ? '불러오는 중' : NONE}
    </div>
  );
}
