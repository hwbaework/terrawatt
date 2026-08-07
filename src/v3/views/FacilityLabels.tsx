import { useEffect, useRef, useState } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { MODELED_FACILITIES } from '../data/facilities';
import { MODEL_SPECS } from '../data/specs';
import { worldToScreen } from '../map/vworldEngine';

/* 건물 위에 뜨는 이름표 — 이걸 누르면 시설 정보가 열린다.

   3D 모델을 직접 클릭하는 방법(Cesium picking)도 걸어뒀지만, 엔진이 모델 id를 어디에 담는지가
   버전마다 달라 확실하지 않다. 이름표는 **평범한 HTML 버튼**이라 반드시 눌린다.
   덤으로 "여기가 내 건물"이라는 표시도 된다.

   위치는 매 프레임 3D 좌표를 화면 좌표로 바꿔서 따라가게 한다. */

/** 이름표를 건물 지붕보다 조금 위에 띄운다 (모델 높이를 알면 그 위로) */
function labelHeightM(facilityId: string): number {
  const h = MODEL_SPECS[facilityId]?.dimensionsM?.[1];
  return (h ?? 20) + 12;
}

export function FacilityLabels({ onSelect }: { onSelect: (facilityId: string) => void }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let raf = 0;

    const tick = () => {
      for (const f of MODELED_FACILITIES) {
        const el = box.querySelector<HTMLElement>(`[data-fid="${f.id}"]`);
        if (!el) continue;
        const p = worldToScreen(f.lng, f.lat, labelHeightM(f.id));
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
      {MODELED_FACILITIES.map((f) => (
        <button
          key={f.id}
          data-fid={f.id}
          type="button"
          onClick={() => onSelect(f.id)}
          title={`${f.name} 정보 보기`}
          style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}
          className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20
                     bg-slate-950/85 px-3 py-1.5 text-[11px] font-bold text-slate-100 shadow-lg backdrop-blur
                     transition-colors hover:border-white/40 hover:bg-slate-900"
        >
          <MIcon name="factory" size={13} className="text-amber-400" />
          {f.name}
          <MIcon name="chevron_right" size={13} className="text-slate-500" />
        </button>
      ))}
    </div>
  );
}
