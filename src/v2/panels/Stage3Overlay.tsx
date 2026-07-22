import { BuildingViewer } from './BuildingViewer';
import { MIcon } from '../lib/MIcon';
import { PLANTS } from '../map/simpleFlow';
import {
  PLANT_SPECS,
  PLANT_READINGS,
  ESS_SPEC,
  EQUIPMENT_STATUS,
  formatCapacity,
} from '../data/specs';

/* 3단계 진입 화면. 가운데 = 유니티 3D 자리(#unity-mount), 오른쪽 = 정보 패널.
   계측값(발전량·설비 상태)은 실데이터 연동 후 표시 — 임의 수치를 두지 않는다. */

export function Stage3Overlay({ name, onExit }: { name: string; onExit: () => void }) {
  const laseeId = PLANTS.find((p) => p.name === name)?.laseeId;
  const spec = laseeId ? PLANT_SPECS[laseeId] : undefined;
  const r = laseeId ? PLANT_READINGS[laseeId] : undefined;
  const pct = spec && r ? Math.round((r.currentOutputKw / spec.capacityKw) * 100) : 0;

  return (
    <div className="sf-stage3 absolute inset-0 z-[60] bg-slate-950 text-white">
      {/* 가운데 = 실제 3D 건물 뷰어 (마우스로 회전, 유니티 준비 전 미리보기). 나중에 유니티가 이 자리 대체 */}
      <div id="unity-mount" className="absolute inset-0">
        <BuildingViewer url="/models/hanil-tube-opt.glb" />
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">
        드래그로 회전 · 유니티 3D로 대체 예정
      </div>

      {/* 상단 바 */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">3단계 · 건물 내부</span>
          {name}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/20"
        >
          <MIcon name="chevron_right" size={16} className="rotate-180" />
          2단계로 나가기
        </button>
      </div>

      {/* 오른쪽: 발전소 정보 패널 — 값은 전부 고정(specs.ts) */}
      <div className="absolute right-5 top-16 w-72 rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur">
        {r && (
          <>
            <div className="text-sm font-bold text-emerald-400">● {r.status}</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold text-white">{r.currentOutputKw}</span>
              <span className="text-xs text-slate-400">kW 발전 중</span>
              <span className="ml-auto text-xs text-slate-400">{pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-sm font-bold text-white">
                  {spec ? formatCapacity(spec.capacityKw) : '—'}
                </div>
                <div className="text-[9px] text-slate-500">설비 용량</div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-sm font-bold text-white">
                  {(r.dailyEnergyKwh / 1000).toFixed(1)}
                </div>
                <div className="text-[9px] text-slate-500">오늘 누적 MWh</div>
              </div>
            </div>
          </>
        )}

        {/* 설비 상태 */}
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            설비 상태
          </div>
          <div className="flex flex-col gap-1 text-[12px]">
            {EQUIPMENT_STATUS.map((s) => (
              <div key={s.name} className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5">
                <span className="text-slate-300">{s.name}</span>
                <span className={s.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {s.ok ? '● 정상' : '▲ 경고'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {spec && (
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
            <span className="text-slate-400">소재지</span>
            <span className="text-right font-semibold text-white">{spec.address}</span>
            <span className="text-slate-400">연계 ESS</span>
            <span className="text-right font-semibold text-white">
              {ESS_SPEC.capacityMwh} MWh / {ESS_SPEC.powerMw} MW
            </span>
          </div>
        )}

        <div className="mt-3 text-center text-[9px] text-slate-500">
          표시값 고정 — 실시간 연동 후 실측값
        </div>
      </div>

      <style>{`
        .sf-stage3{animation:sf-stage3-in .5s ease-out;}
        @keyframes sf-stage3-in{from{opacity:0}to{opacity:1}}
      `}</style>
    </div>
  );
}
