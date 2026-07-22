import { PLANTS } from '../map/simpleFlow';
import { MIcon } from '../lib/MIcon';
import { PLANT_READINGS } from '../data/specs';

/* 내 발전소 — 타겟 회사(한일튜브) 바로가기. 브랜드 카드(TerraWatt) 안에 들어간다.
   클릭 → 지도 이동(가깝게) + 정보 카드. 계측값은 실데이터 연동 후. */

const MY_PLANT_ID = 17514; // 한일튜브 (LASEE)

export function MyPlantsPanel({
  onSelect,
}: {
  onSelect: (laseeId: number, name: string) => void;
}) {
  const plant = PLANTS.find((p) => p.laseeId === MY_PLANT_ID);
  if (!plant) return null;
  const r = PLANT_READINGS[plant.laseeId];

  return (
    <button
      type="button"
      onClick={() => onSelect(plant.laseeId, plant.name)}
      className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-white/10 px-2.5 py-2 text-left transition-colors hover:bg-white/20"
    >
      <span className="flex items-center gap-1.5 text-xs font-bold text-white">
        <MIcon name="solar_power" size={15} className="text-orange-400" />
        {plant.name}
      </span>
      <span className="flex items-center gap-1">
        {r && (
          <span className="text-[12px] font-bold text-white">{r.currentOutputKw}kW</span>
        )}
        <MIcon name="chevron_right" size={15} className="text-slate-400" />
      </span>
    </button>
  );
}
