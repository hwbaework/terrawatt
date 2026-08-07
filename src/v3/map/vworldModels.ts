/* 브이월드 3D 화면에 우리 glb 모델(한일튜브·ESS)을 세운다.

   크기는 **배율(scale)로 직접** 지정한다 — 이 엔진은 바운딩박스 자동 맞춤이 없다.

   실제 API(엔진 코드에서 확인):
     new vw.geom.ModelZ(id, url, coordz, options).create()
       → ws3d.viewer.objectManager.create3DModel(url, OgcPoint, true, options, id)
     options 는 Cesium Model 옵션 계열 — scale, headingPitchRoll, minimumPixelSize 등 */

import { MODELED_FACILITIES, type Facility } from '../data/facilities';
import { metersToLat, metersToLng, registerHandle, unregisterHandle } from './handles';

/* window.ws3d / window.Cesium 타입 선언은 vworldEngine.ts 한 곳에 모여 있다 */
interface VwModelZ {
  create(): unknown;
  setCoordz(c: unknown): void;
  setOptions(o: unknown): void;
}

/** 세워둔 모델들 — 화면을 다시 만들 때 중복 생성되지 않게 기억해 둔다 */
const placed = new Set<string>();

const DEG = Math.PI / 180; // Cesium 계열은 각도를 라디안으로 받는다

function placeOne(f: Facility): boolean {
  const vw = window.vw as unknown as {
    geom: { ModelZ: new (id: string, url: string, coordz: unknown, options: unknown) => VwModelZ };
    CoordZ: new (lng: number, lat: number, z: number) => unknown;
  };
  const ws3d = window.ws3d;
  if (!vw?.geom?.ModelZ || !ws3d?.common?.HeadingPitchRoll || !f.model) return false;

  const id = `v3-${f.id}`;
  if (placed.has(id)) return true;

  const m = f.model;
  // 지금 배치 상태 — 조절 패널이 바꾸면 여기 값을 고치고 다시 그린다
  let lng = f.lng;
  let lat = f.lat;
  // 브이월드 전용 회전값이 있으면 그걸, 없으면 공용 값을 쓴다 (두 엔진의 회전 기준이 다름)
  let rotDeg = m.rotation3dDeg ?? m.rotationDeg ?? 0;
  let scale = m.scale3d ?? 1;

  const buildOptions = () => ({
    scale,
    // 정면 방향 — 배경 타일 화면에서 맞춘 각도를 그대로 쓴다(부호가 반대면 여기서 뒤집으면 됨)
    headingPitchRoll: new ws3d.common.HeadingPitchRoll(rotDeg * DEG, 0, 0),
    // 멀리서도 점처럼은 보이게 — 0이면 멀어질 때 사라진다
    minimumPixelSize: 0,
  });

  const model = new vw.geom.ModelZ(
    id,
    m.url,
    new vw.CoordZ(lng, lat, m.elevationM ?? 0),
    buildOptions(),
  );
  model.create();
  placed.add(id);

  /* 다시 그리기 — create()가 같은 id의 기존 모델을 지우고 새로 만들어 준다(엔진 코드 확인함) */
  const redraw = () => {
    model.setCoordz(new vw.CoordZ(lng, lat, m.elevationM ?? 0));
    model.setOptions(buildOptions());
    model.create();
  };

  registerHandle(f.id, {
    move(eastM, northM) {
      lng += metersToLng(eastM, lat);
      lat += metersToLat(northM);
      redraw();
    },
    rotate(dDeg) {
      rotDeg += dDeg;
      redraw();
    },
    resize(factor) {
      scale *= factor;
      redraw();
    },
    // 크기는 배율이므로, 원래 목표 크기(m)에 배율을 곱해 대략의 미터로 보여준다
    state: () => ({ lng, lat, rotationDeg: rotDeg, sizeM: (m.targetSizeM ?? 40) * scale }),
  });
  return true;
}

/** 시설 목록표의 모델들을 브이월드 3D 화면에 세운다. 세운 개수를 돌려준다. */
export function placeFacilityModels(): number {
  let n = 0;
  for (const f of MODELED_FACILITIES) {
    try {
      if (placeOne(f)) n++;
    } catch (e) {
      console.warn(`[v3 vworld model] ${f.id} 세우기 실패`, e);
    }
  }
  return n;
}

/** 화면을 떠날 때 정리 — 다시 들어오면 새로 세운다 */
export function clearFacilityModels(): void {
  const om = window.ws3d?.viewer?.objectManager;
  for (const id of placed) {
    try {
      om?.removeGeometryById?.(id);
      unregisterHandle(id.replace(/^v3-/, ''));
    } catch {
      /* 엔진이 이미 정리했으면 무시 */
    }
  }
  placed.clear();
}
