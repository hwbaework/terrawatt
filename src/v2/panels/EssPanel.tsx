import { MIcon } from '../lib/MIcon';
import { ESS_SPEC, ESS_READING } from '../data/specs';

/* ESS 정보 카드 — 지도 위 ESS 뱃지 클릭 시.
   값은 전부 고정(specs.ts) — 타이머·계산 없음. 실시간 연동 시 값만 교체된다. */

export function EssPanel({ onClose }: { onClose: () => void }) {
  const s = ESS_READING;

  return (
    <div className="w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-white">
          <MIcon name="battery_charging_full" size={18} className="text-emerald-400" />
          {ESS_SPEC.name}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 text-slate-400 transition-colors hover:text-white"
        >
          <MIcon name="close" size={18} />
        </button>
      </div>

      {/* 상태 + 충전율 */}
      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="flex items-center gap-0.5 text-[13px] font-bold text-emerald-400">
          <MIcon name="bolt" size={15} /> {s.mode}
          <span className="ml-1 text-[11px] font-semibold">{s.powerMw} MW</span>
        </span>
        <span className="text-2xl font-extrabold text-white">
          {s.soc}
          <span className="text-sm font-bold text-slate-400">%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.soc}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-slate-400">저장량</span>
        <span className="text-right font-semibold text-white">
          {s.storedMwh} / {ESS_SPEC.capacityMwh} MWh
        </span>
        <span className="text-slate-400">정격 출력</span>
        <span className="text-right font-semibold text-white">{ESS_SPEC.powerMw} MW</span>
        <span className="text-slate-400">오늘 충전</span>
        <span className="text-right font-semibold text-emerald-400">{s.chargedTodayMwh} MWh</span>
        <span className="text-slate-400">오늘 방전</span>
        <span className="text-right font-semibold text-orange-400">{s.dischargedTodayMwh} MWh</span>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px]">
        <span className="text-slate-400">
          셀 온도 <b className="text-white">{s.tempC}°C</b>
        </span>
        <span className="text-emerald-400">● 정상</span>
        <span className="text-slate-400">화재감지</span>
        <span className={s.fireOk ? 'text-emerald-400' : 'text-red-400'}>● 정상</span>
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-slate-500">
        표시값은 고정 — 실시간(BEMS) 연동 후 실측값으로 바뀝니다.
      </p>
    </div>
  );
}
