import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/* 지도 위 3D 건물 (Mapbox 커스텀 레이어 + three.js) — v0.1 createModelThreeLayer 패턴 이식.
   glb를 로드해 지정 위치에 세운다. 모델 크기가 제각각이라 **바운딩박스로 목표 크기에 자동 맞춤**. */

const TARGET_SIZE_M = 40; // 건물 최대 변을 약 40m로 맞춤 (필요 시 조정)

/* ── 배치 조절(TweakPanel용) — 살아있는 건물 레이어를 id로 찾아 밀고/돌린다 ── */
export interface BuildingHandle {
  id: string;
  /** 동쪽(+)/서쪽(-), 북쪽(+)/남쪽(-)으로 미터 단위 이동 */
  move(eastM: number, northM: number): void;
  /** 시계방향(+) 회전, 도 단위 */
  rotate(dDeg: number): void;
  /** 크기 배율 조절 (1.1 = 10% 크게, 0.9 = 10% 작게) */
  resize(factor: number): void;
  state(): { lng: number; lat: number; rotationDeg: number; sizeM: number };
}

const handles = new Map<string, BuildingHandle>();
export function getBuildingHandle(id: string): BuildingHandle | undefined {
  return handles.get(id);
}

export function createBuildingLayer(
  lng: number,
  lat: number,
  url: string,
  opts?: { id?: string; rotationDeg?: number; targetSizeM?: number; natural?: boolean },
): mapboxgl.CustomLayerInterface {
  let curLng = lng;
  let curLat = lat;
  let curRotDeg = opts?.rotationDeg ?? 0;
  const t = { x: 0, y: 0, z: 0, scale: 0 };
  const updateOrigin = () => {
    const origin = mapboxgl.MercatorCoordinate.fromLngLat([curLng, curLat], 0);
    t.x = origin.x;
    t.y = origin.y;
    t.z = origin.z;
    t.scale = origin.meterInMercatorCoordinateUnits();
  };
  updateOrigin();

  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(40, 70, 80);
  scene.add(sun);

  let renderer: THREE.WebGLRenderer | null = null;
  let map2: mapboxgl.Map | null = null;
  let modelRef: THREE.Object3D | null = null;
  let baseMaxDim = 1; // 원본 최대변(스케일 전) — 현재 크기 = baseMaxDim × scale

  const layerId = opts?.id ?? 'v2-building';

  // 바닥이 지면에 오도록 + 수평 중심 정렬 (스케일/회전 바뀔 때마다 다시)
  const alignModel = (model: THREE.Object3D) => {
    model.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
  };

  return {
    id: layerId,
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      map2 = map;

      // 배치 조절 핸들 등록 — TweakPanel이 이걸로 밀고/돌린다
      handles.set(layerId, {
        id: layerId,
        move(eastM, northM) {
          curLng += eastM / (111320 * Math.cos((curLat * Math.PI) / 180));
          curLat += northM / 110574;
          updateOrigin();
          map2?.triggerRepaint();
        },
        rotate(dDeg) {
          curRotDeg += dDeg;
          if (modelRef) {
            modelRef.rotation.y = (curRotDeg * Math.PI) / 180;
            alignModel(modelRef);
          }
          map2?.triggerRepaint();
        },
        resize(factor) {
          if (!modelRef) return;
          modelRef.scale.multiplyScalar(factor);
          alignModel(modelRef);
          map2?.triggerRepaint();
        },
        state: () => ({
          lng: curLng,
          lat: curLat,
          rotationDeg: curRotDeg,
          sizeM: baseMaxDim * (modelRef?.scale.x ?? 0),
        }),
      });
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;

      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;

          // 1) 원본 크기 측정 → 목표 크기로 스케일 (모델 단위가 m/cm 제각각이라 자동 맞춤)
          //    natural=true면 실물 미터 단위로 만든 모델이므로 스케일 안 건드림
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          baseMaxDim = maxDim;
          if (!opts?.natural) model.scale.setScalar((opts?.targetSizeM ?? TARGET_SIZE_M) / maxDim);

          // 2) 회전 (필요 시 정면 맞춤)
          if (curRotDeg) model.rotation.y = (curRotDeg * Math.PI) / 180;
          modelRef = model;

          // 3) 바닥이 지면에 오도록 + 수평 중심 정렬 (스케일 후 재측정)
          alignModel(model);

          scene.add(model);

          if (import.meta.env.DEV) {
            console.info(`[${opts?.id ?? 'v2-building'}] loaded. 원본 최대변`, maxDim.toFixed(1), '→ scale', model.scale.x.toFixed(4));
          }
          map2?.triggerRepaint();
        },
        undefined,
        (err) => console.warn(`[${opts?.id ?? 'v2-building'}] glb load fail`, err),
      );
    },
    onRemove() {
      handles.delete(layerId);
      map2 = null;
      renderer = null;
      modelRef = null;
    },
    render(_gl, matrix) {
      if (!renderer || !map2) return;
      // 멀어지면(줌<15) 건물 안 그림 — 무거운 3D가 광역 뷰 성능·시각 문제를 일으키지 않게
      if (map2.getZoom() < 15) return;
      // Y-up 모델을 지도 좌표계로 세우는 표준 변환 (rotX 90° + y축 반전 스케일)
      const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const m = new THREE.Matrix4().fromArray(matrix as unknown as number[]);
      const l = new THREE.Matrix4()
        .makeTranslation(t.x, t.y, t.z)
        .scale(new THREE.Vector3(t.scale, -t.scale, t.scale))
        .multiply(rotX);
      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}
