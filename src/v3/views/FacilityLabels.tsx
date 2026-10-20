import { useEffect, useRef, useState } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { FACILITIES } from '../data/facilities';
import { PLANNED_ASSETS } from '../data/plannedAssets';
import { MODEL_SPECS } from '../data/specs';
import { HOME, VIEWER_ROLE } from '../home';
import { cameraHeight, worldToScreen } from '../map/vworldEngine';

/* 지도 위 이름표.

   발전소 이름표는 **멀리서 볼 때만** 뜬다(2026-09-08 사용자 확정).
   가까이서 한일튜브를 보는 화면에서는 알약 이름표·호버 카드가 방해라서 걷어냈는데(2026-09-07),
   산단 전체를 내려다보는 화면에서는 반대로 이름표가 없으면 어느 건물이 발전소인지 알 수 없다.
   그래서 카메라 높이로 갈랐다 — 산단 뷰에서는 이름표로 고르고, 들어가면 사라진다.

   예정 자산(수소·ORC·ESS·V2G)은 실물이 없어 높이와 무관하게 늘 띄운다.
   점선 테두리 + 흐린 톤 = 확정 위치가 아니라는 표시.

   위치는 매 프레임 3D 좌표를 화면 좌표로 바꿔서 따라가게 한다. */

/** 이 높이(m)보다 멀어지면 발전소 이름표를 띄운다 — 산단이 한눈에 들어오기 시작하는 지점 */
const LABEL_FROM_M = 1_500;

/** 이름표를 건물 지붕보다 조금 위에 띄운다 (모델 높이를 알면 그 위로) */
function labelHeightM(facilityId: string): number {
  const h = MODEL_SPECS[facilityId]?.dimensionsM?.[1];
  return (h ?? 12) + 12;
}

/* 권한(2026-09-08 사용자 지적) — 사업주에게는 자기 발전소만 보인다.
   남의 발전소는 이름표조차 띄우면 안 된다(발전량은 영업정보). 전환은 home.ts 의 VIEWER_ROLE */
const VISIBLE_FACILITIES =
  VIEWER_ROLE === 'admin' ? FACILITIES : FACILITIES.filter((f) => f.id === HOME.facilityId);

const POINTS = [
  ...VISIBLE_FACILITIES.map((f) => ({ id: f.id, lng: f.lng, lat: f.lat, heightM: labelHeightM(f.id) })),
  ...PLANNED_ASSETS.map((a) => ({ id: a.id, lng: a.lng, lat: a.lat, heightM: 24 })),
];

export function FacilityLabels({
  onSelect,
  onSelectAsset,
}: {
  /** 발전소 이름표를 누르면 시설 id를 알려준다 (멀리서 볼 때만 눌린다) */
  onSelect: (facilityId: string) => void;
  /** 예정 자산 이름표를 누르면 자산 id를 알려준다 */
  onSelectAsset: (assetId: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  /** 카메라가 멀리 있나 — 발전소 이름표를 띄울지 결정 */
  const [far, setFar] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let raf = 0;

    const tick = () => {
      const h = cameraHeight();
      setFar(h !== null && h > LABEL_FROM_M);

      for (const p0 of POINTS) {
        const el = box.querySelector<HTMLElement>(`[data-fid="${p0.id}"]`);
        if (!el) continue;
        const p = worldToScreen(p0.lng, p0.lat, p0.heightM);
        if (!p) {
          el.style.visibility = 'hidden'; // 지구 반대편이거나 화면 밖
          continue;
        }
        el.style.visibility = 'visible';
        // translate(-50%, -100%) = 점의 바로 위 가운데에 붙인다
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
        setReady(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute inset-0 z-10"
      style={{ opacity: ready ? 1 : 0, transition: 'opacity .3s' }}
    >
      {/* 발전소 이름표 — 멀리서 볼 때만. 누르면 그 발전소로 들어간다 */}
      {VISIBLE_FACILITIES.map((f) => (
        <button
          key={f.id}
          data-fid={f.id}
          type="button"
          onClick={() => onSelect(f.id)}
          title={f.locationNote ? `${f.name} — ${f.locationNote}` : f.name}
          style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20
                      bg-slate-950/85 px-3 py-1.5 text-[11px] font-bold text-slate-100 shadow-lg backdrop-blur
                      transition-opacity duration-200 hover:border-white/40 hover:bg-slate-900
                      ${far ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <MIcon name="factory" size={13} className="text-amber-400" />
          {f.name}
          {/* 부지가 확정되지 않은 발전소는 그렇다고 밝힌다 */}
          {f.locationNote && <span className="text-[9px] font-bold text-amber-300/70">위치 임시</span>}
          <MIcon name="chevron_right" size={13} className="text-slate-500" />
        </button>
      ))}

      {/* 예정 자산 — 점선·흐린 톤. 좌표가 임시라는 뜻으로 이름 뒤에 (예정)을 붙인다 */}
      {PLANNED_ASSETS.map((a) => (
        <button
          key={a.id}
          data-fid={a.id}
          type="button"
          onClick={() => onSelectAsset(a.id)}
          title={`${a.name} — ${a.locationNote}`}
          style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}
          className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-amber-300/40
                     bg-slate-950/70 px-3 py-1.5 text-[11px] font-bold text-slate-300 shadow-lg backdrop-blur
                     transition-colors hover:border-amber-300/70 hover:bg-slate-900"
        >
          <MIcon name={a.icon} size={13} className="text-amber-300/80" />
          {a.name}
          <span className="text-[9px] font-bold text-amber-300/70">예정</span>
          <MIcon name="chevron_right" size={13} className="text-slate-500" />
        </button>
      ))}
    </div>
  );
}
