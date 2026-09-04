import { HOME } from '../home';

/* 화재 시뮬레이션(CASE01) — 상황 표시.

   3D 지도에는 두 가지만 표시한다:
     · 발화 지점 마커 (맥박 치듯 커졌다 작아지는 주황-빨강 점)
     · 경계 구역 (부지 주변 반투명 붉은 원)
   ⚠️ 이 표시는 **관제용 연출**이다 — 불이 번지는 물리를 계산하는 게 아니다.
      위치도 부지 기준이다(설비 하나하나의 실내 위치는 현장 도면이 있어야 안다).
   영향(발전 정지·손실)은 화면 쪽에서 실측 설비 구성으로 계산한다. */

/** 경계 구역 반경(m) — ⚠️건물(targetSizeM 115)보다 커야 한다.
    45m로 했더니 원이 통째로 건물 밑에 깔려 아무것도 안 보였음(2026-08-11 실측) */
const ZONE_RADIUS_M = 100;

interface CesiumFire {
  Color: { fromCssColorString(s: string): { withAlpha(a: number): unknown } };
  CallbackProperty: new (fn: () => number | unknown, isConstant: boolean) => unknown;
  Cartesian3: { fromDegrees(lng: number, lat: number, h: number): unknown };
  HeightReference?: { CLAMP_TO_GROUND: number };
}

let marker: unknown = null;
let zone: unknown = null;
let ticker = 0;

const repaint = () => window.ws3d?.viewer?.scene?.requestRender?.();

/** 발화 표시를 켠다 (마커 + 경계 구역) */
export function showFire(): void {
  const C = window.Cesium as unknown as CesiumFire | undefined;
  const v = window.ws3d?.viewer;
  if (!C || !v?.entities || marker) return;

  const pos = C.Cartesian3.fromDegrees(HOME.lng, HOME.lat, 0);
  const red = C.Color.fromCssColorString('#ef4444');
  const orange = C.Color.fromCssColorString('#f97316');

  // 경계 구역 — 땅에 깔리는 반투명 붉은 원
  zone = v.entities.add({
    position: pos,
    ellipse: {
      semiMajorAxis: ZONE_RADIUS_M,
      semiMinorAxis: ZONE_RADIUS_M,
      // 위성사진이 배경이라 너무 옅으면 안 보인다 (침수 물은 0.45)
      material: red.withAlpha(0.22),
    },
  });

  // 발화 지점 — 맥박 치는 점
  marker = v.entities.add({
    position: pos,
    point: {
      // 커졌다 작아졌다 — 긴박함 표시
      pixelSize: new C.CallbackProperty(() => 12 + 5 * (0.5 + 0.5 * Math.sin(Date.now() / 220)), false),
      color: orange.withAlpha(0.95),
      outlineColor: red.withAlpha(0.9),
      outlineWidth: 3,
      // 건물 모델 안에 갇혀 안 보이는 문제 — 깊이 검사를 꺼서 건물을 뚫고 항상 보이게
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      ...(C.HeightReference ? { heightReference: C.HeightReference.CLAMP_TO_GROUND } : {}),
    },
  });

  // 맥박 애니메이션 동안 계속 다시 그린다 (requestRenderMode 대응)
  if (!ticker) ticker = window.setInterval(repaint, 66);
  repaint();
}

/** 발화 표시를 걷는다 */
export function hideFire(): void {
  const v = window.ws3d?.viewer;
  if (marker && v?.entities) v.entities.remove(marker);
  if (zone && v?.entities) v.entities.remove(zone);
  marker = null;
  zone = null;
  if (ticker) {
    window.clearInterval(ticker);
    ticker = 0;
  }
  repaint();
}
