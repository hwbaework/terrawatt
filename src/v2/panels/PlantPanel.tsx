import { MIcon } from '../lib/MIcon';
import { PLANT_SPECS, PLANT_READINGS, formatCapacity } from '../data/specs';

/* 발전소 정보 카드 — 지도 마커의 칩 또는 브랜드 카드의 내 발전소 클릭 시.
   값은 전부 고정(specs.ts) — 타이머·계산 없음. 실시간 연동 시 값만 교체된다. */

export function PlantPanel({
  laseeId,
  name,
  onClose,
}: {
  laseeId: number;
  name: string;
  onClose: () => void;
}) {
  const spec = PLANT_SPECS[laseeId];
  const r = PLANT_READINGS[laseeId];
  const pct = spec && r ? Math.round((r.currentOutputKw / spec.capacityKw) * 100) : 0;
  const warn = r && r.status !== '정상 발전';

  return (
    <div className="w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-white">
          <MIcon name="solar_power" size={18} className="text-orange-400" />
          {name}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 text-slate-400 transition-colors hover:text-white"
        >
          <MIcon name="close" size={18} />
        </button>
      </div>

      {r && (
        <>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className={`text-[13px] font-bold ${warn ? 'text-red-400' : 'text-emerald-400'}`}>
              ● {r.status}
            </span>
            <span className="text-2xl font-extrabold text-white">
              {r.currentOutputKw}
              <span className="text-sm font-bold text-slate-400"> kW</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, pct)}%`, background: warn ? '#f87171' : '#f97316' }}
            />
          </div>
        </>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-slate-400">발전률</span>
        <span className="text-right font-semibold text-white">{pct}%</span>
        {spec && (
          <>
            <span className="text-slate-400">설비 용량</span>
            <span className="text-right font-semibold text-white">{formatCapacity(spec.capacityKw)}</span>
          </>
        )}
        {r && (
          <>
            <span className="text-slate-400">오늘 발전량</span>
            <span className="text-right font-semibold text-white">
              {(r.dailyEnergyKwh / 1000).toFixed(1)} MWh
            </span>
          </>
        )}
        {spec && (
          <>
            <span className="text-slate-400">유형</span>
            <span className="text-right font-semibold text-white">{spec.type}</span>
            <span className="text-slate-400">소재지</span>
            <span className="text-right font-semibold text-white">{spec.address}</span>
          </>
        )}
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-slate-500">
        표시값은 고정 — 실시간(LASEE) 연동 후 실측값으로 바뀝니다.
      </p>
    </div>
  );
}
