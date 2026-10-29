import { useId, useState } from 'react';

/* (i) 도움말 — 지표 설명은 값 아래에 늘어놓지 않고 아이콘에 올리면(또는 포커스하면) 보인다.
   연계 문서 v1.1 7장 '도움말'(법정 판정 · 아크 확률이 아니라는 점)도 여기에 둔다.
   align — 화면 · 패널 가장자리 가까운 아이콘은 그쪽으로 붙여 잘리지 않게(오른쪽 끝 = right, 왼쪽 끝 = left) */
const POS = {
  center: 'left-1/2 -translate-x-1/2',
  left: 'left-0',
  right: 'right-0',
} as const;

export function InfoHint({ text, label, align = 'center' }: { text: string; label: string; align?: keyof typeof POS }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label} 설명`}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="inline-flex cursor-help text-slate-500 hover:text-slate-200"
      >
        {/* (i) — 아이콘 폰트 서브셋(index.css)에 info 가 없어 글자 'info'로 나오던 것을 그림으로 */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16.5" strokeLinecap="round" />
          <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={`absolute top-full z-50 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded-md border border-white/10 bg-slate-900 px-2.5 py-2 text-[12px] font-normal leading-relaxed text-slate-200 shadow-lg ${POS[align]}`}
      >
        {text}
      </span>
    </span>
  );
}
