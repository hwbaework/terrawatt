import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/* 지도 위 3D 건물 (Mapbox 커스텀 레이어 + three.js) — v0.1 createModelThreeLayer 패턴 이식.
   glb를 로드해 지정 위치에 세운다. 모델 크기가 제각각이라 **바운딩박스로 목표 크기에 자동 맞춤**. */

const TARGET_SIZE_M = 40; // 건물 최대 변을 약 40m로 맞춤 (필요 시 조정)

export function createBuildingLayer(
  lng: number,
  lat: number,
  url: string,
  opts?: { rotationDeg?: number; targetSizeM?: number },
): mapboxgl.CustomLayerInterface {
  const origin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
  const t = { x: origin.x, y: origin.y, z: origin.z, scale: origin.meterInMercatorCoordinateUnits() };

  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(40, 70, 80);
  scene.add(sun);

  let renderer: THREE.WebGLRenderer | null = null;
  let map2: mapboxgl.Map | null = null;

  return {
    id: 'v2-building',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      map2 = map;
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
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          model.scale.setScalar((opts?.targetSizeM ?? TARGET_SIZE_M) / maxDim);

          // 2) 회전 (필요 시 정면 맞춤)
          if (opts?.rotationDeg) model.rotation.y = (opts.rotationDeg * Math.PI) / 180;

          // 3) 바닥이 지면에 오도록 + 수평 중심 정렬 (스케일 후 재측정)
          const box2 = new THREE.Box3().setFromObject(model);
          const center = new THREE.Vector3();
          box2.getCenter(center);
          model.position.x -= center.x;
          model.position.z -= center.z;
          model.position.y -= box2.min.y; // 최저점을 지면(y=0)에

          scene.add(model);

          if (import.meta.env.DEV) {
            console.info('[v2-building] loaded. 원본 최대변', maxDim.toFixed(1), '→ scale', model.scale.x.toFixed(4));
          }
          map2?.triggerRepaint();
        },
        undefined,
        (err) => console.warn('[v2-building] glb load fail', err),
      );
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
