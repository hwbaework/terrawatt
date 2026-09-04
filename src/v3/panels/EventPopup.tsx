import { PLANT_EVENTS, type PlantEventKind } from '../data/plantEvents';

/* ── 설비 이벤트 팝업 — 통신·전원 이상이 오면 지도 위에 떠서 "현장 확인"을 시킨다 ──
   조건·철학은 plantEvents.ts 주석 참고(발전량 0은 안 울린다 — 구름일 수 있어서).
   시연: 발전소 상세의 "설비 상태" 항목을 누르면 그 신호의 알림을 미리 본다. */
export function EventPopup({ kind, onClose }: { kind: PlantEventKind; onClose: () => void }) {
  const e = PLANT_EVENTS[kind];

  return (
    <div className="fixed left-1/2 top-1/2 z-40 w-[24rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-red-400/30 bg-slate-950/95 shadow-2xl backdrop-blur">
      {/* 머리 — 빨간 점(깜빡임) + 제목 + 판정 시각 */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-red-500/10 px-4 py-2.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
        <span className="text-[13.5px] font-extrabold text-red-300">{e.title}</span>
        <span className="ml-auto text-[11.5px] font-bold text-slate-500">{e.occurredAt}</span>
      </div>

      <div className="px-4 py-3">
        <div className="text-[12.5px] leading-relaxed text-slate-300">{e.detail}</div>
        <div className="mt-1 text-[12.5px] font-bold leading-relaxed text-slate-100">{e.action}</div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-lg bg-white/10 py-2 text-[12.5px] font-bold text-slate-200 transition-colors hover:bg-white/20"
        >
          확인
        </button>
      </div>
    </div>
  );
}
