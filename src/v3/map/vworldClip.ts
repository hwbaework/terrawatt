/* 브이월드가 세워둔 건물 중, **우리 모델이 들어설 자리만** 도려낸다.

   왜 필요한가: 브이월드 3D에는 전국 건물이 이미 들어있다(울산 부곡동도 있다).
   그 위에 우리 실측 모델을 세우면 **같은 건물이 두 채 겹쳐 보인다.**
   주변 공장들은 그대로 두고 싶으니 타일셋 전체를 끄지 않고, 우리 부지만 잘라낸다.

   방법: Cesium의 clipping plane 4장으로 사각 기둥을 만들어 그 안쪽을 지운다.
   (특정 건물을 id로 골라 숨기는 방법도 있지만, 건물마다 id를 미리 알아내야 해서
    좌표만으로 되는 이쪽이 관리하기 쉽다) */

interface CesiumClip {
  Cartesian3: { new (x: number, y: number, z: number): unknown; fromDegrees(lng: number, lat: number, h: number): unknown };
  Matrix4: { IDENTITY: unknown; inverse(m: unknown, out: unknown): unknown; multiply(a: unknown, b: unknown, out: unknown): unknown; new (): unknown };
  Transforms: { eastNorthUpToFixedFrame(origin: unknown): unknown };
  ClippingPlane: new (normal: unknown, distance: number) => unknown;
  ClippingPlaneCollection: new (o: {
    planes: unknown[];
    unionClippingRegions: boolean;
    modelMatrix?: unknown;
    edgeWidth?: number;
  }) => unknown;
}

interface Tileset {
  clippingPlanes?: unknown;
  clippingPlanesOriginMatrix?: unknown;
  root?: { transform?: unknown };
  resource?: { url?: string };
  _url?: string;
}

/** 브이월드의 **건물** 타일셋을 찾는다.
    POI(지명) 타일셋은 /services/poi/ 아래, 건물·모델은 /services/map4/ 아래에 있다. */
function findBuildingTilesets(): Tileset[] {
  const prims = window.ws3d?.viewer?.scene?.primitives as
    | { length: number; get(i: number): unknown }
    | undefined;
  if (!prims) return [];
  const found: Tileset[] = [];
  for (let i = 0; i < prims.length; i++) {
    const p = prims.get(i) as Tileset;
    const url = (p?.resource?.url ?? p?._url ?? '').toString();
    if (url.includes('/services/map4/')) found.push(p);
  }
  return found;
}

/** 이 지점을 중심으로 한 변 `sizeM` 짜리 사각형 안의 브이월드 건물을 지운다.
    성공하면 지운 타일셋 수를 돌려준다. */
export function clipVworldBuildingsAt(lng: number, lat: number, sizeM: number): number {
  const C = window.Cesium as unknown as CesiumClip | undefined;
  if (!C?.ClippingPlaneCollection) return 0;
  const tilesets = findBuildingTilesets();
  if (tilesets.length === 0) return 0;

  const half = sizeM / 2;
  // 바깥을 향한 법선 + 음수 거리 = "이 면보다 안쪽"을 지움.
  // 네 장을 교집합으로 묶으면 사각 기둥 **안쪽만** 지워진다.
  const makePlanes = () => [
    new C.ClippingPlane(new C.Cartesian3(1, 0, 0), -half),
    new C.ClippingPlane(new C.Cartesian3(-1, 0, 0), -half),
    new C.ClippingPlane(new C.Cartesian3(0, 1, 0), -half),
    new C.ClippingPlane(new C.Cartesian3(0, -1, 0), -half),
  ];

  // 우리 건물 자리에 세운 좌표계(동/북/위) — 잘라낼 사각형의 기준
  const origin = C.Cartesian3.fromDegrees(lng, lat, 0);
  const enu = C.Transforms.eastNorthUpToFixedFrame(origin);

  let done = 0;
  for (const t of tilesets) {
    try {
      // 타일셋 자체 기준으로 환산 (타일셋마다 원점이 다르다)
      const originMatrix = t.clippingPlanesOriginMatrix ?? t.root?.transform ?? C.Matrix4.IDENTITY;
      const inv = C.Matrix4.inverse(originMatrix, new C.Matrix4());
      const modelMatrix = C.Matrix4.multiply(inv, enu, new C.Matrix4());
      t.clippingPlanes = new C.ClippingPlaneCollection({
        planes: makePlanes(),
        unionClippingRegions: false, // 교집합 = 사각형 안쪽만
        modelMatrix,
        edgeWidth: 0,
      });
      done++;
    } catch (e) {
      console.warn('[v3 clip] 브이월드 건물 잘라내기 실패', e);
    }
  }
  return done;
}
