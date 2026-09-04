import { HOME } from '../home';

/* 침수 시뮬레이션(CASE03) — 브이월드 3D 지형(DEM) 위에 물 평면을 깔아 침수 범위를 보여준다.

   원리: 반투명 물 사각형을 "부지 지면 고도 + 수위" 높이에 깐다.
   지형 가림(depthTestAgainstTerrain)이 켜져 있어서, 그보다 높은 땅은 물 위로 솟고
   낮은 땅은 잠긴다 — **잠기는 범위는 브이월드 실측 지형이 계산해 주는 셈**이다.
   물 색은 수위와 함께 서서히 진해진다(처음엔 완전 투명).

   대피 안내선: **수심 0.5m를 넘는 순간에 만들어지고, 내려가면 없어진다**
   (보이기 조건만 걸면 환경에 따라 미리 보이는 문제가 있어, 아예 생성/삭제로 확실하게).
   모양 = 땅에 붙는 노란 점선 + 흘러가는 점들, 길이 = 높은 지대까지의 **중간 지점**까지.

   정직한 한계(욕조 모델): 물길·유속·배수는 계산하지 않는다. */

/** 물 사각형 반경(도) — 한일튜브 근처만 (약 ±400m) */
const EXTENT_DEG = 0.004;

/** 대피 안내선이 나타나는 수심(m) — 무릎(성인 보행 위험), "이제 움직여야 한다"는 시점 */
export const ROUTE_AT_M = 0.5;

/** 안내선 길이 = 높은 지대까지 거리의 이 비율 ("산 중간 정도까지") */
const ROUTE_HALF = 0.5;

/** 흘러가는 점의 속도(m/초) */
const DOT_SPEED = 45;

/** 이 수심에서 물 색이 최대 진하기에 도달한다 */
const FULL_TINT_AT_M = 0.5;
const MAX_ALPHA = 0.45;

interface Cartesian3Ctor {
  fromDegrees(lng: number, lat: number, h: number): unknown;
  fromDegreesArrayHeights(a: number[]): unknown;
}

interface CesiumFlood {
  Rectangle: { fromDegrees(w: number, s: number, e: number, n: number): unknown };
  Color: { fromCssColorString(s: string): { withAlpha(a: number): unknown } };
  CallbackProperty: new (fn: () => number | boolean | unknown, isConstant: boolean) => unknown;
  Cartographic: { fromDegrees(lng: number, lat: number): unknown };
  Cartesian3: Cartesian3Ctor;
  PolylineDashMaterialProperty?: new (o: { color: unknown; dashLength?: number }) => unknown;
  /** 점을 지형 표면에 붙이는 기준 */
  HeightReference?: { CLAMP_TO_GROUND: number };
  /** 색을 콜백으로 바꿀 수 있는 재질 — 수위 따라 투명도를 올리는 데 쓴다 */
  ColorMaterialProperty?: new (color: unknown) => unknown;
}

let entity: unknown = null; // 물 평면
let routeEntity: unknown = null; // 대피 방향 안내선(점선)
let routeDots: unknown[] = []; // 안내선 위를 흘러가는 점들
let bestDir: { lng: number; lat: number; h: number } | null = null; // 주변 최고 지점(방향)
let levelM = 0; // 수위 (부지 지면 기준 m)
let baseAltM = 0; // 부지 지면의 해발 고도
let ticker = 0; // 점 애니메이션 동안 계속 다시 그리게 하는 시계

const repaint = () => window.ws3d?.viewer?.scene?.requestRender?.();

/* 이 엔진은 "변화가 있을 때만 그리는" 모드라, 점이 흐르는 동안은 주기적으로 다시 그려야 한다 */
function updateTicker(): void {
  const active = routeEntity != null;
  if (active && !ticker) ticker = window.setInterval(repaint, 66);
  if (!active && ticker) {
    window.clearInterval(ticker);
    ticker = 0;
  }
}

const heightAt = (lng: number, lat: number): number | undefined => {
  const C = window.Cesium as unknown as CesiumFlood | undefined;
  const globe = window.ws3d?.viewer?.scene?.globe;
  if (!C || !globe?.getHeight) return undefined;
  try {
    return globe.getHeight(C.Cartographic.fromDegrees(lng, lat));
  } catch {
    return undefined;
  }
};

/** 한일튜브 지점의 지형 고도(해발 m). 지형 타일이 아직이면 undefined */
export function groundAlt(): number | undefined {
  return heightAt(HOME.lng, HOME.lat);
}

/** 물 평면을 만든다(한 번만). baseAlt = 부지 지면 해발 고도 */
export function showFlood(baseAlt: number): void {
  baseAltM = baseAlt;
  const C = window.Cesium as unknown as CesiumFlood | undefined;
  const v = window.ws3d?.viewer;
  if (!C || !v?.entities || entity) return;
  const blue = C.Color.fromCssColorString('#3b82f6');
  // 수위 0 = 완전 투명 → FULL_TINT_AT_M 에서 최대 진하기. "없다가 서서히 차오르는" 느낌의 핵심
  const tint = new C.CallbackProperty(
    () => blue.withAlpha(MAX_ALPHA * Math.min(1, levelM / FULL_TINT_AT_M)),
    false,
  );
  entity = v.entities.add({
    show: new C.CallbackProperty(() => levelM > 0.01, false),
    rectangle: {
      coordinates: C.Rectangle.fromDegrees(
        HOME.lng - EXTENT_DEG,
        HOME.lat - EXTENT_DEG,
        HOME.lng + EXTENT_DEG,
        HOME.lat + EXTENT_DEG,
      ),
      material: C.ColorMaterialProperty ? new C.ColorMaterialProperty(tint) : blue.withAlpha(MAX_ALPHA),
      height: new C.CallbackProperty(() => baseAltM + levelM, false),
    },
  });
  repaint();
}

/** 16방위 × 반경 150·300·450m 지형 고도를 읽어 가장 높은 곳을 찾는다 */
function findBest(): { lng: number; lat: number; h: number } | null {
  let best: { lng: number; lat: number; h: number } | null = null;
  for (const r of [150, 300, 450]) {
    for (let b = 0; b < 360; b += 22.5) {
      const rad = (b * Math.PI) / 180;
      const lat = HOME.lat + (r * Math.cos(rad)) / 110574;
      const lng = HOME.lng + (r * Math.sin(rad)) / (111320 * Math.cos((HOME.lat * Math.PI) / 180));
      const h = heightAt(lng, lat);
      if (h != null && (!best || h > best.h)) best = { lng, lat, h };
    }
  }
  return best;
}

/** 안내선을 만들 수 있는가 — 지형이 읽히고, 부지보다 1m 이상 높은 곳이 있는가.
    (안내 문구 표시용. 실제 선은 수심이 0.5m를 넘는 순간 만들어진다) */
export function probeRoute(): boolean {
  if (!bestDir) bestDir = findBest();
  return bestDir != null && bestDir.h >= baseAltM + 1;
}

/** 안내선 생성 — 수심 0.5m를 넘는 순간에만 불린다 */
function createRoute(): void {
  const C = window.Cesium as unknown as CesiumFlood | undefined;
  const v = window.ws3d?.viewer;
  if (!C || !v?.entities || routeEntity || !bestDir) return;

  /* 길이 = 높은 지대까지의 중간 지점 ("산 중간 정도까지") */
  const tipLng = HOME.lng + (bestDir.lng - HOME.lng) * ROUTE_HALF;
  const tipLat = HOME.lat + (bestDir.lat - HOME.lat) * ROUTE_HALF;
  const lenM = Math.hypot(
    (tipLng - HOME.lng) * 111320 * Math.cos((HOME.lat * Math.PI) / 180),
    (tipLat - HOME.lat) * 110574,
  );
  const loopMs = Math.max(1500, (lenM / DOT_SPEED) * 1000);

  const yellow = C.Color.fromCssColorString('#facc15');
  const dark = C.Color.fromCssColorString('#0a0f1e').withAlpha(0.85);
  try {
    routeEntity = v.entities.add({
      polyline: {
        positions: C.Cartesian3.fromDegreesArrayHeights([HOME.lng, HOME.lat, 0, tipLng, tipLat, 0]),
        width: 6,
        clampToGround: true, // 지형 표면에 붙인다
        material: C.PolylineDashMaterialProperty
          ? new C.PolylineDashMaterialProperty({ color: yellow.withAlpha(0.95), dashLength: 16 })
          : yellow.withAlpha(0.85),
      },
    });
    /* 흘러가는 점 3개 — 땅에 붙어 안내선을 따라 이동한다 */
    routeDots = [0, 1 / 3, 2 / 3].map((phase) =>
      v.entities!.add({
        position: new C.CallbackProperty(() => {
          const t = ((Date.now() + phase * loopMs) % loopMs) / loopMs;
          return C.Cartesian3.fromDegrees(HOME.lng + (tipLng - HOME.lng) * t, HOME.lat + (tipLat - HOME.lat) * t, 0);
        }, false),
        point: {
          pixelSize: 7,
          color: yellow.withAlpha(0.95),
          outlineColor: dark,
          outlineWidth: 2,
          ...(C.HeightReference ? { heightReference: C.HeightReference.CLAMP_TO_GROUND } : {}),
        },
      }),
    );
  } catch {
    removeRoute();
    return;
  }
  updateTicker();
  repaint();
}

/** 안내선 제거 — 수심이 0.5m 아래로 내려가면 */
function removeRoute(): void {
  const v = window.ws3d?.viewer;
  if (routeEntity && v?.entities) v.entities.remove(routeEntity);
  for (const d of routeDots) v?.entities?.remove(d);
  routeEntity = null;
  routeDots = [];
  updateTicker();
}

/** 수위(부지 지면 기준 m)를 바꾼다 — 물·안내선이 즉시 따라온다 */
export function setFloodLevel(m: number): void {
  levelM = m;
  // 안내선은 0.5m를 넘는 순간 생기고, 내려가면 없어진다 (생성/삭제라 미리 보일 수 없음)
  if (m >= ROUTE_AT_M && !routeEntity && probeRoute()) createRoute();
  if (m < ROUTE_AT_M && routeEntity) removeRoute();
  repaint();
}

/** 부지 지면 고도를 나중에라도 알게 되면 갱신한다 */
export function setBaseAlt(m: number): void {
  baseAltM = m;
  repaint();
}

/** 물과 안내선을 걷고 정리한다 (침수 화면을 닫을 때) */
export function hideFlood(): void {
  const v = window.ws3d?.viewer;
  if (entity && v?.entities) v.entities.remove(entity);
  removeRoute();
  entity = null;
  bestDir = null;
  levelM = 0;
  repaint();
}
