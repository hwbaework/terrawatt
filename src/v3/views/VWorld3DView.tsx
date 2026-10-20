import { useEffect, useRef, useState } from 'react';
import {
  applyCameraLimits,
  cameraHeight,
  isMapStarted,
  lookAtPlace,
  startVworldMap,
  waitForEngine,
  type EngineStatus,
  type VwMap,
} from '../map/vworldEngine';
import { clearFacilityModels, placeFacilityModels } from '../map/vworldModels';
import { clipVworldBuildingsAt } from '../map/vworldClip';
import { FacilityLabels } from './FacilityLabels';
import { HOME } from '../home';

/* 브이월드 3D 화면 — 전국 건물 모델과 지형이 이미 들어있는 브이월드 자체 엔진(Cesium 기반).

   로더 스크립트는 index.html 에 정적으로 박혀 있다(리액트에서 끼워넣으면 동작 안 함).
   여기서는 "이미 로드된 엔진"이 준비되면 지도를 시작하는 일만 한다.

   ⚠️ 이 엔진은 **한 페이지에서 한 번만** 시작할 수 있다(아래 isMapStarted 주석 참고).
      그래서 v0.3은 둘을 전환하는 방식으로 쓴다. */

/** 우리 건물 자리에서 브이월드 건물을 지울 사각형 한 변(m).
    한일튜브 실측이 79×126m 이라 넉넉히 잡되, 옆 공장까지 지우지 않을 만큼만. */
const CLIP_SIZE_M = 170;

export function VWorld3DView({
  bindHome,
  onSelect,
  onSelectAsset,
}: {
  bindHome: (fn: () => void) => void;
  /** 발전소 이름표(멀리서 볼 때만 보임)를 클릭하면 시설 id를 알려준다 */
  onSelect: (facilityId: string) => void;
  /** 예정 자산(수소·ORC·ESS·V2G) 이름표를 클릭하면 자산 id를 알려준다 */
  onSelectAsset: (assetId: string) => void;
}) {
  const mapRef = useRef<VwMap | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ state: 'loading' });
  const [placedCount, setPlacedCount] = useState(0); // 세워진 내 건물 수 (확인용 표시)

  useEffect(() => {
    let cancelled = false;
    void waitForEngine().then((s) => {
      if (cancelled) return;
      if (s.state !== 'ready') {
        setStatus(s);
        return;
      }
      const homeCam = {
        lng: HOME.lng,
        lat: HOME.camLat, // 건물 좌표가 아니라 **조준점**(남쪽 45m) — 건물 덩어리가 화면 정중앙에 오게
        altitude: HOME.altitude,
        tiltDeg: HOME.tiltDeg,
      };
      // "내 건물로" = 카메라만 옮긴다. 엔진 재시작은 불가능(아래 참고).
      bindHome(() => void lookAtPlace(homeCam));

      // ⚠️ 브이월드 엔진은 **한 페이지에서 한 번만** 시작할 수 있다.
      //    두 번째 start()는 "Cannot redefine property: viewer" 로 터진다.
      //    (배경 타일 ↔ 3D 를 오갈 때 실제로 발생했음)
      //    그래서 이미 시작돼 있으면 카메라만 옮기고 끝낸다.
      if (isMapStarted()) {
        setStatus({ state: 'ready' });
        flyHomeUntilStuck();
        placeWhenReady();
        clipWhenReady();
        return;
      }
      try {
        mapRef.current = startVworldMap('vmap', homeCam);
        setStatus({ state: 'ready' });
        flyHomeUntilStuck();
        placeWhenReady();
        clipWhenReady();
      } catch (e) {
        setStatus({ state: 'error', reason: '엔진 시작 실패', detail: (e as Error).message });
      }

      /* 카메라를 내 건물 위로 데려다 놓는다.

         브이월드 쪽 사정이 까다롭다:
           · `setInitPosition` 은 카메라를 실제로 옮기지 않는다 (실측: 1,700km 상공에 머묾)
           · 우리가 옮겨놔도 **엔진이 나중에 자기 기본 위치로 되돌려 놓는다** (시점이 일정하지 않음)

         그래서 한 번 옮기고 끝내지 않고, 시작 후 잠깐 동안 **지켜보다가 되돌려지면 다시 데려온다**.
         "되돌려짐"의 판별은 고도로 한다 — 엔진 기본 위치는 1,700km 라서, 100km 밖으로 나가 있으면
         사용자가 그렇게 만든 게 아니라 엔진이 되돌린 것이다. (사용자 조작은 방해하지 않음) */
      function flyHomeUntilStuck() {
        const RESET_HEIGHT_M = 100_000; // 이보다 높으면 엔진이 되돌려 놓은 것
        const WATCH_MS = 25_000; // 시작 직후 이 시간 동안만 지켜본다
        const started = Date.now();
        lookAtPlace(homeCam);
        applyCameraLimits(HOME.maxDistanceM);
        const t = window.setInterval(() => {
          if (cancelled || Date.now() - started > WATCH_MS) return window.clearInterval(t);
          // 엔진이 카메라를 되돌리면서 제한도 함께 풀어버리므로 매번 다시 건다
          applyCameraLimits(HOME.maxDistanceM);
          const h = cameraHeight();
          if (h !== null && h > RESET_HEIGHT_M) lookAtPlace(homeCam);
        }, 500);
      }
    });

    /* 내 건물(한일튜브·ESS) 세우기 — start() 직후엔 엔진 내부(objectManager)가 아직 준비 전일 수
       있어서, 세워질 때까지 잠깐 재시도한다. */
    function placeWhenReady() {
      let tries = 0;
      const t = window.setInterval(() => {
        if (cancelled) return window.clearInterval(t);
        const n = placeFacilityModels();
        if (n > 0 || ++tries > 20) {
          window.clearInterval(t);
          setPlacedCount(n);
          // 3D 건물 클릭은 제거(2026-09-07 사용자 확정) — 시설 정보는 좌상단 카드·오른쪽 아이콘 바로만 연다
        }
      }, 300);
    }

    /* 브이월드에도 같은 자리에 건물이 있어서 우리 모델과 겹친다.
       타일셋이 늦게 올라오므로 잘릴 때까지 잠깐 재시도한다. */
    function clipWhenReady() {
      let tries = 0;
      const t = window.setInterval(() => {
        if (cancelled) return window.clearInterval(t);
        const n = clipVworldBuildingsAt(HOME.lng, HOME.lat, CLIP_SIZE_M);
        if (n > 0 || ++tries > 40) window.clearInterval(t);
      }, 500);
    }

    return () => {
      cancelled = true;
      clearFacilityModels();
    };
  }, [bindHome]);

  return (
    <>
      {/* 브이월드 엔진이 그리는 자리 */}
      <div id="vmap" style={{ height: '100dvh', width: '100vw' }} />

      {/* 지도 위 이름표 — 발전소는 멀리서 볼 때만, 예정 자산은 항상 */}
      {status.state === 'ready' && placedCount > 0 && (
        <FacilityLabels onSelect={onSelect} onSelectAsset={onSelectAsset} />
      )}

      {status.state === 'loading' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 text-sm text-slate-400">
          브이월드 3D 엔진 준비 중…
        </div>
      )}

      {status.state === 'error' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="max-w-lg rounded-xl bg-red-500/10 px-6 py-5 text-red-200">
            <div className="text-sm font-bold">{status.reason}</div>
            <div className="mt-2 text-xs leading-relaxed text-red-300/90">{status.detail}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-lg bg-white/10 py-2 text-xs font-bold text-slate-100 transition-colors hover:bg-white/20"
            >
              다시 불러오기
            </button>
            <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
              대개 한 번 다시 불러오면 됩니다. 계속 같은 화면이면 광고·추적 차단 확장을 이 사이트에서만
              꺼보세요.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
