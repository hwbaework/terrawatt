import { HOME } from '../home';

/* 지진 시뮬레이션(CASE02) — 상황 표시.

   3D 지도에는 두 가지만 표시한다:
     · 진앙 마커 (앰버 점 — 건물에 가려지지 않게 깊이 검사 해제)
     · 부지에서 퍼져나가는 동심원 3개 (지진파 느낌 — 커지면서 옅어지고 다시 시작)

   설비/구역 마커(주의·위험)는 뺐다(2026-08-31 사용자 확정) — 어느 구역이 문제인지 알려줄
   데이터가 없는데 구역마다 점을 찍는 건 단정이다. 지도는 "지진이 났다"는 사실만 말한다.
   흔들림 연출도 구현하지 않는다(사용자 확정). 결과(점검·교체)는 화면(QuakeScreen) 카드가 말한다. */

/** 동심원이 퍼지는 최대 반경(m) — 건물(115m)보다 커야 보인다 (화재 때 배운 것) */
const MAX_RADIUS_M = 320;
/** 한 원이 퍼지는 데 걸리는 시간(ms) */
const PERIOD_MS = 2400;
/** 동심원 개수 (위상차를 두고 반복) */
const RING_COUNT = 3;

interface CesiumQuake {
  Color: { fromCssColorString(s: string): { withAlpha(a: number): unknown } };
  CallbackProperty: new (fn: () => number | unknown, isConstant: boolean) => unknown;
  ColorMaterialProperty: new (color: unknown) => unknown;
  Cartesian3: { fromDegrees(lng: number, lat: number, h: number): unknown };
  HeightReference?: { CLAMP_TO_GROUND: number };
}

let marker: unknown = null;
let rings: unknown[] = [];
let ticker = 0;

const repaint = () => window.ws3d?.viewer?.scene?.requestRender?.();

/** 지진 표시를 켠다 (진앙 마커 + 퍼지는 동심원) */
export function showQuake(): void {
  const C = window.Cesium as unknown as CesiumQuake | undefined;
  const v = window.ws3d?.viewer;
  if (!C || !v?.entities || marker) return;

  const pos = C.Cartesian3.fromDegrees(HOME.lng, HOME.lat, 0);
  const amber = C.Color.fromCssColorString('#f59e0b');
  const start = Date.now();

  // 동심원 — 반경은 커지고 진하기는 옅어지며 반복 (물결처럼)
  for (let i = 0; i < RING_COUNT; i++) {
    const phase = (PERIOD_MS / RING_COUNT) * i;
    const progress = () => (((Date.now() - start + phase) % PERIOD_MS) / PERIOD_MS);
    const radius = new C.CallbackProperty(() => Math.max(1, MAX_RADIUS_M * progress()), false);
    rings.push(
      v.entities.add({
        position: pos,
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: new C.ColorMaterialProperty(
            new C.CallbackProperty(() => amber.withAlpha(0.28 * (1 - progress())), false),
          ),
        },
      }),
    );
  }

  // 진앙 마커 — 건물을 뚫고 항상 보이게
  marker = v.entities.add({
    position: pos,
    point: {
      pixelSize: 11,
      color: amber.withAlpha(0.95),
      outlineColor: C.Color.fromCssColorString('#b45309').withAlpha(0.9),
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      ...(C.HeightReference ? { heightReference: C.HeightReference.CLAMP_TO_GROUND } : {}),
    },
  });

  // 동심원 애니메이션 동안 계속 다시 그린다 (requestRenderMode 대응)
  if (!ticker) ticker = window.setInterval(repaint, 66);
  repaint();
}

/** 지진 표시를 걷는다 */
export function hideQuake(): void {
  const v = window.ws3d?.viewer;
  if (v?.entities) {
    if (marker) v.entities.remove(marker);
    for (const r of rings) v.entities.remove(r);
  }
  marker = null;
  rings = [];
  if (ticker) {
    window.clearInterval(ticker);
    ticker = 0;
  }
  repaint();
}
