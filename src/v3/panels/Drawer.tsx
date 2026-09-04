import type { ReactNode } from 'react';
import { MIcon } from '../../v2/lib/MIcon';

/* 오른쪽에서 밀려 나오는 패널 껍데기 — 시설 정보·DT 화면이 모두 이걸 쓴다.
   내용만 갈아끼우면 되도록 머리말/스크롤 영역만 담당한다. */

export function Drawer({
  title,
  subtitle,
  badge,
  onClose,
  onBack,
  width = 'normal',
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** 제목 옆 작은 꼬리표 (근거 쪽수 등) */
  badge?: string;
  onClose: () => void;
  /** 있으면 제목 앞에 뒤로 화살표가 생긴다 (리포트에서 원래 화면으로) */
  onBack?: () => void;
  /** 표·그래프가 들어가면 'wide' */
  width?: 'normal' | 'wide';
  children: ReactNode;
}) {
  return (
    <aside
      className={`animate-[slideInRight_.22s_ease-out] fixed right-0 top-0 z-30 flex h-dvh flex-col
                 border-l border-white/10 bg-slate-950/95 shadow-[-8px_0_32px_rgba(0,0,0,.45)] backdrop-blur-md
                 ${width === 'wide' ? 'w-[34rem] max-w-[92vw]' : 'w-[21rem]'}`}
    >
      <header className="flex items-start justify-between gap-2 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                title="돌아가기"
                className="-ml-1 shrink-0 rotate-180 rounded-md p-0.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
              >
                <MIcon name="chevron_right" size={16} />
              </button>
            )}
            <h2 className="truncate text-[17px] font-extrabold text-white">{title}</h2>
            {badge && (
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-400">{badge}</span>
            )}
          </div>
          {subtitle && <div className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="닫기"
          className="-mr-1 shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          <MIcon name="close" size={17} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</div>
    </aside>
  );
}

/** 구역 제목 + 내용 — 글자 크기는 어르신도 읽게 키워 둔다(2026-08-24 사용자 지적: 너무 작아 안 보임) */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/[0.07] px-5 py-4">
      <h3 className="mb-2.5 text-[12px] font-bold tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

/** 화면 안에서 무언가를 실행하는 버튼 (시뮬레이션 등) — 메뉴를 늘리지 않기 위해 */
export function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="px-5 py-3">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-blue-600/90 px-3 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-blue-600"
      >
        {label}
        <MIcon name="chevron_right" size={16} className="opacity-80" />
      </button>
    </div>
  );
}

/** 값 한 줄 — 라벨 왼쪽, 값 오른쪽 */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-[13px] text-slate-400">{label}</span>
      <span className="text-right text-[14px] font-bold text-slate-100">{children}</span>
    </div>
  );
}
