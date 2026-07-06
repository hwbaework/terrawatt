import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as SunCalc from 'suncalc';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Switch } from './components/ui/switch';
import { Slider } from './components/ui/slider';
import {
  BatchedRenderer,
  ParticleSystem,
  ConeEmitter,
  IntervalValue,
  ConstantValue,
  ConstantColor,
  ColorOverLife,
  Gradient,
  SizeOverLife,
  PiecewiseBezier,
  Bezier,
  RenderMode,
  Vector3 as QVector3,
  Vector4 as QVector4,
} from 'three.quarks';

if (import.meta.env.VITE_MAPBOX_TOKEN) {
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
}

/* 발전소 목록 — 데모용 가상 사이트. 좌표는 [경도(lng), 위도(lat)] */
type Plant = {
  id: string;
  name: string;
  type: string;
  address: string;
  lng: number;
  lat: number;
};
const BUGOK_STATION: Plant = {
  id: 'bugok-station',
  name: '부곡 에너지 스테이션',
  type: '태양광 · ESS 자가발전',
  address: '울산 남구 부곡동 일대',
  lng: 129.33904,
  lat: 35.49792,
};
const PLANTS: Plant[] = [BUGOK_STATION];

/* ── 송전/배전망 목업 노드 (발전소 주변 가상 좌표) ── */
type GridNode = { id: string; name: string; kind: 'substation' | 'load'; lng: number; lat: number };
const SUBSTATION: GridNode = { id: 'sub-1', name: '부곡변전소', kind: 'substation', lng: 129.3312, lat: 35.5028 };
const LOADS: GridNode[] = [
  { id: 'load-1', name: '인근 공장 A', kind: 'load', lng: 129.3455, lat: 35.4995 },
  { id: 'load-2', name: '물류창고 B', kind: 'load', lng: 129.3428, lat: 35.4948 },
];

/* 송전(변전소→발전소) + 배전(발전소→수용가) 경로를 GeoJSON LineString으로.
   properties.role: 'transmission' | 'distribution' — 색/굵기 구분용 */
function gridLinesGeoJSON(): GeoJSON.FeatureCollection {
  const h: [number, number] = [BUGOK_STATION.lng, BUGOK_STATION.lat];
  const line = (
    from: [number, number],
    to: [number, number],
    role: 'transmission' | 'distribution',
  ): GeoJSON.Feature => ({
    type: 'Feature',
    properties: { role },
    geometry: { type: 'LineString', coordinates: [from, to] },
  });
  return {
    type: 'FeatureCollection',
    features: [
      line([SUBSTATION.lng, SUBSTATION.lat], h, 'transmission'),
      ...LOADS.map((l) => line(h, [l.lng, l.lat], 'distribution')),
    ],
  };
}

/* 노드(변전소/수용가) 포인트 GeoJSON */
function gridNodesGeoJSON(): GeoJSON.FeatureCollection {
  const nodes = [SUBSTATION, ...LOADS];
  return {
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature',
      properties: { id: n.id, name: n.name, kind: n.kind },
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
    })),
  };
}

/* 두 좌표 사이 근사 거리(위도 보정 유클리드) — 정렬/비교용이라 근사면 충분 */
function approxDist(a: [number, number], b: [number, number]): number {
  const cos = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * cos, a[1] - b[1]);
}

/* 발전소 → 공장 경로를 인근 송전탑을 타고 그리는 그리디 라우팅.
   매 스텝: 목표(공장)에 더 가까워지는 송전탑 중 현재 위치에서 가장 가까운 탑으로 이동.
   더 가까운 탑이 없거나 목표가 다음 탑보다 가까우면 목표로 바로 연결한다. */
function routeViaTowers(
  from: [number, number],
  to: [number, number],
  towers: [number, number][],
  maxHops = 40,
): [number, number][] {
  const path: [number, number][] = [from];
  let current = from;
  const used = new Set<number>();
  for (let i = 0; i < maxHops; i++) {
    const distToTarget = approxDist(current, to);
    let best = -1;
    let bestD = Infinity;
    for (let t = 0; t < towers.length; t++) {
      if (used.has(t)) continue;
      const tw = towers[t];
      if (approxDist(tw, to) >= distToTarget) continue; // 목표에 더 가까워지는 탑만
      const d = approxDist(current, tw);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best < 0 || bestD >= distToTarget) break; // 진행할 탑 없음 또는 목표가 더 가까움
    used.add(best);
    current = towers[best];
    path.push(current);
  }
  path.push(to);
  return path;
}

/* 실측 송전선 지오메트리로 만든 라우팅 그래프.
   배전선(발전소→공장)이 실제 전력선 "회랑"을 타고 흐르며 노란 송전선 위에 겹치도록.
   노드 = 선 정점(약 11m 격자로 근접 병합), 엣지 = 선 위 이웃 정점 + 30m 이내 근접 정점(갭 브리징) */
type PowerGraph = { nodes: Map<string, [number, number]>; adj: Map<string, Map<string, number>> };

const GRAPH_Q = 1e-4; // ≈ 11m 격자
const gkey = (p: number[]) => `${Math.round(p[0] / GRAPH_Q)}_${Math.round(p[1] / GRAPH_Q)}`;

function buildPowerGraph(lines: number[][][]): PowerGraph {
  const nodes = new Map<string, [number, number]>();
  const adj = new Map<string, Map<string, number>>();
  const addNode = (p: number[]): string => {
    const k = gkey(p);
    if (!nodes.has(k)) {
      nodes.set(k, [p[0], p[1]]);
      adj.set(k, new Map());
    }
    return k;
  };
  const link = (ka: string, kb: string, d: number) => {
    const m = adj.get(ka);
    if (m && !(m.has(kb) && (m.get(kb) as number) <= d)) m.set(kb, d);
  };
  const addEdge = (a: number[], b: number[]) => {
    const ka = addNode(a);
    const kb = addNode(b);
    if (ka === kb) return;
    const d = approxDist([a[0], a[1]], [b[0], b[1]]);
    link(ka, kb, d);
    link(kb, ka, d);
  };
  for (const ln of lines) for (let i = 1; i < ln.length; i++) addEdge(ln[i - 1], ln[i]);

  // 갭 브리징 — 끊긴 선 끝점을 약 30m 이내면 이어줌 (OSM 추출 경계의 미세 단절 보정)
  const bridge = 30 / 111_320;
  const keys = [...nodes.keys()];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = nodes.get(keys[i]) as [number, number];
      const b = nodes.get(keys[j]) as [number, number];
      const d = approxDist(a, b);
      if (d > 0 && d < bridge) {
        link(keys[i], keys[j], d);
        link(keys[j], keys[i], d);
      }
    }
  }
  return { nodes, adj };
}

/* 발전소→공장 경로를 그래프(실측 송전선) 위 최단경로로. 회랑에서 떨어진 발전소·공장은 스퍼로 연결.
   그래프가 단절돼 경로가 없으면 null (호출부에서 송전탑 그리디로 폴백). */
function routeAlongGraph(
  graph: PowerGraph,
  from: [number, number],
  to: [number, number],
): [number, number][] | null {
  const { nodes, adj } = graph;
  if (nodes.size === 0) return null;
  const nearest = (p: [number, number]): string | null => {
    let bk: string | null = null;
    let bd = Infinity;
    for (const [k, q] of nodes) {
      const d = approxDist(p, q);
      if (d < bd) {
        bd = d;
        bk = k;
      }
    }
    return bk;
  };
  const sk = nearest(from);
  const tk = nearest(to);
  if (!sk || !tk) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const vis = new Set<string>();
  dist.set(sk, 0);
  for (;;) {
    let u: string | null = null;
    let ud = Infinity;
    for (const [k, dv] of dist) if (!vis.has(k) && dv < ud) { ud = dv; u = k; }
    if (u === null || u === tk) break;
    vis.add(u);
    for (const [v, w] of adj.get(u) as Map<string, number>) {
      const nd = ud + w;
      if (!(dist.has(v) && (dist.get(v) as number) <= nd)) {
        dist.set(v, nd);
        prev.set(v, u);
      }
    }
  }
  if (!dist.has(tk)) return null;

  const core: [number, number][] = [];
  let c: string | undefined = tk;
  while (c !== undefined) {
    core.unshift(nodes.get(c) as [number, number]);
    if (c === sk) break;
    c = prev.get(c);
  }
  const out: [number, number][] = [];
  if (approxDist(from, core[0]) > 1e-7) out.push(from); // 발전소 스퍼
  out.push(...core);
  const last = core[core.length - 1];
  if (approxDist(to, last) > 1e-7) out.push(to); // 공장 스퍼
  return out;
}

/* 나란한 2회선(double-circuit) 중복 제거 — 양끝이 서로 THRESH 이내인 line 피처는 하나만 남긴다.
   송전탑·변전소 등 line이 아닌 피처는 그대로 통과. (실측 2회선을 한 줄로 단순화) */
function dedupeParallelLines(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const THRESH = 45 / 111_320; // ≈45m (도 단위)
  const near = (a: number[], b: number[]) => approxDist([a[0], a[1]], [b[0], b[1]]) < THRESH;
  const keptEnds: [number[], number[]][] = [];
  const lines: GeoJSON.Feature[] = [];
  const others: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    if (f.properties?.kind === 'line' && f.geometry.type === 'LineString' && f.geometry.coordinates.length >= 2) {
      const c = f.geometry.coordinates;
      const s = c[0];
      const e = c[c.length - 1];
      const dup = keptEnds.some(
        ([ks, ke]) => (near(s, ks) && near(e, ke)) || (near(s, ke) && near(e, ks)),
      );
      if (dup) continue; // 이미 같은 회랑을 남겼으면 병렬 회선은 버림
      keptEnds.push([s, e]);
      lines.push(f);
    } else {
      others.push(f);
    }
  }
  return { type: 'FeatureCollection', features: [...lines, ...others] };
}

/* 지도 초기 중심 = 첫 번째 발전소 */
const HOME = BUGOK_STATION;

/* 부곡 태양광 정격용량 (mock, kWp) — 나중에 실측 계약값으로 교체 */
const BUGOK_CAPACITY_KWP = 500;

/* 태양 고도 → 일사량 → 발전량 (mock 계산 모델).
   대기권 밖 태양상수 1361 W/m² × sin(고도) × 대기감쇠(맑음 0.75) → 지표 일사량.
   맑은 정오 남향 최대 ~1000 W/m². 정격 대비 (일사량/1000)이 발전률. */
function pvSnapshot(altitudeDeg: number, capacityKwp = BUGOK_CAPACITY_KWP) {
  if (altitudeDeg <= 0) {
    return { irradiance: 0, powerKw: 0, ratePct: 0 };
  }
  const rad = (altitudeDeg * Math.PI) / 180;
  const irradiance = 1361 * Math.sin(rad) * 0.75; // W/m²
  const ratio = Math.min(1, irradiance / 1000);
  return {
    irradiance: Math.round(irradiance),
    powerKw: capacityKwp * ratio,
    ratePct: ratio * 100,
  };
}

/* 클릭 지점 둘레 정사각형 건물 부지 (한 변 sizeM 미터) — 건물 세우기 모드용 */
function buildingFootprint(lng: number, lat: number, sizeM = 20): number[][] {
  const dLat = sizeM / 2 / 111_320;
  const dLng = sizeM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
}
/* 두 모서리 → 축 정렬 사각형 링 (드래그로 부지 그리기) */
function rectRing(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number[][] {
  const minLng = Math.min(a.lng, b.lng);
  const maxLng = Math.max(a.lng, b.lng);
  const minLat = Math.min(a.lat, b.lat);
  const maxLat = Math.max(a.lat, b.lat);
  return [
    [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
  ];
}
/* 중심+반지름(m) → 원형 링 (원통형 건물/탱크) */
function circleRing(lng: number, lat: number, radiusM: number, steps = 48): number[][] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}
type BuildShape = 'rect' | 'circle';
type UserBuilding = { ring: number[][]; height: number };

/* 태양 계산 기준점(발전소 위치) */
const SUN_REF = { lat: HOME.lat, lng: HOME.lng };

/* zoom 11→13 사이에서 0→value로 페이드 인 */
function zoomReveal(value: number): mapboxgl.ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 11, 0, 13, value] as mapboxgl.ExpressionSpecification;
}

/* Mapbox 커스텀 레이어에 Three.js GLTF 모델(애니메이션 포함)을 얹어 부곡에 렌더.
   지도와 같은 카메라(투영행렬)로 그려져 이음새 없이 통합됨.
   모델: LittlestTokyo.glb (three.js 공식 예제, DRACO 압축) — GLTF+키프레임 애니 기술 검증용 */
/* 커스텀 레이어 + 외부 제어 API (토글 UI에서 호출) */
type ThreeLayerHandle = mapboxgl.CustomLayerInterface & {
  setFireVisible: (on: boolean) => void;
  setTramVisible: (on: boolean) => void;
  setPanelAngle: (azimuthDeg: number, tiltDeg: number) => void;
};
function createModelThreeLayer(lng: number, lat: number): ThreeLayerHandle {
  const origin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
  const t = { x: origin.x, y: origin.y, z: origin.z, scale: origin.meterInMercatorCoordinateUnits() };

  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(40, 70, 80);
  scene.add(sun);

  // 화재 효과 텍스처 — Kenney Particle Pack (CC0, 전문가 제작 512px 스프라이트)
  const texLoader = new THREE.TextureLoader();
  const fireTex = texLoader.load('/textures/flame_04.png');
  const smokeTex = texLoader.load('/textures/smoke_07.png');

  // three.quarks 전문 파티클 — 창문에서 뿜어져 나오는 불길 + 연기
  const batchRenderer = new BatchedRenderer();
  scene.add(batchRenderer);
  // 분출 방향: 바깥(+x) + 위. ConeEmitter는 +Z로 뿜으므로 쿼터니언으로 조준
  const aim = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0.55, 1, 0).normalize(),
  );

  // 불길 — 노랑→빨강→투명으로 타오름
  const flame = new ParticleSystem({
    duration: 1,
    looping: true,
    startLife: new IntervalValue(0.5, 1.1),
    startSpeed: new IntervalValue(7, 14),
    startSize: new IntervalValue(3.5, 7),
    startColor: new ConstantColor(new QVector4(1, 0.88, 0.45, 1)),
    emissionOverTime: new ConstantValue(140),
    shape: new ConeEmitter({ radius: 2, angle: 0.4 }),
    material: new THREE.MeshBasicMaterial({
      map: fireTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    renderMode: RenderMode.BillBoard,
  });
  flame.addBehavior(
    new ColorOverLife(
      new Gradient(
        [[new QVector3(1, 0.9, 0.5), 0], [new QVector3(1, 0.4, 0.05), 0.5], [new QVector3(0.85, 0.1, 0), 1]],
        [[1, 0], [0.9, 0.5], [0, 1]], // 투명도: 밝게 태어나 끝에서 사라짐
      ),
    ),
  );
  flame.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.7, 1, 0.75, 0.25), 0]])));
  batchRenderer.addSystem(flame);
  flame.emitter.quaternion.copy(aim);

  // 연기 — 불 위로 길게, 커지면서 옅어짐
  const smoke = new ParticleSystem({
    duration: 1,
    looping: true,
    startLife: new IntervalValue(1.8, 3),
    startSpeed: new IntervalValue(4, 8),
    startSize: new IntervalValue(6, 11),
    startColor: new ConstantColor(new QVector4(0.22, 0.22, 0.22, 0.55)),
    emissionOverTime: new ConstantValue(40),
    shape: new ConeEmitter({ radius: 2, angle: 0.3 }),
    material: new THREE.MeshBasicMaterial({
      map: smokeTex,
      blending: THREE.NormalBlending,
      transparent: true,
      depthWrite: false,
    }),
    renderMode: RenderMode.BillBoard,
  });
  smoke.addBehavior(
    new ColorOverLife(
      new Gradient(
        [[new QVector3(0.28, 0.28, 0.28), 0], [new QVector3(0.12, 0.12, 0.12), 1]],
        [[0.5, 0], [0.35, 0.4], [0, 1]], // 피어오르며 옅어짐
      ),
    ),
  );
  smoke.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 0.8, 1, 1.3), 0]])));
  batchRenderer.addSystem(smoke);
  smoke.emitter.quaternion.copy(aim);

  // 창문 위치에 불·연기 + 깜빡이는 불빛
  const fire = new THREE.Group();
  fire.add(flame.emitter);
  fire.add(smoke.emitter);
  const fireLight = new THREE.PointLight(0xff7b1a, 500, 90, 1.8);
  fireLight.position.set(3, 0, 0);
  fire.add(fireLight);
  fire.position.set(25, 28, 0); // 건물 동쪽 벽 중층 창문 (벽면 바로 바깥)
  scene.add(fire);
  // ── 태양광 패널 (수동 각도 조절식) — 건물 옥상에 설치 ──
  const solarBase = new THREE.Group();
  solarBase.position.set(0, 50, 0); // 건물 옥상 중앙
  scene.add(solarBase);
  // 짧은 지지대 (옥상 위 낮은 프레임)
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.4, 2, 12),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.4 }),
  );
  pole.position.y = 1;
  solarBase.add(pole);
  // 패널 피벗 (여기 회전으로 각도 조정)
  const solarPivot = new THREE.Group();
  solarPivot.position.y = 2;
  solarBase.add(solarPivot);
  // 패널 판 (짙은 파랑 셀)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.3, 6),
    new THREE.MeshStandardMaterial({
      color: 0x0f2a52,
      metalness: 0.55,
      roughness: 0.25,
      emissive: 0x081a33,
      emissiveIntensity: 0.35,
    }),
  );
  solarPivot.add(panel);
  // 셀 격자 무늬 (라인)
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1e3a5f });
  for (let i = -4; i <= 4; i += 2) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(i, 0.16, -2.9),
      new THREE.Vector3(i, 0.16, 2.9),
    ]);
    solarPivot.add(new THREE.Line(g, gridMat));
  }
  for (let j = -2.8; j <= 2.8; j += 1.4) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-4.9, 0.16, j),
      new THREE.Vector3(4.9, 0.16, j),
    ]);
    solarPivot.add(new THREE.Line(g, gridMat));
  }

  // 양축(2-axis) 태양광 트래커 — 슬라이더 두 개로 방위+기울기 조절 (대칭 -90~+90)
  //   방위(azDeg): -90=동 · 0=남(기준) · +90=서 (Y축 회전 = 수직축)
  //   기울기(tiltDeg): -90=뒤로 · 0=수평 · +90=앞으로 (X축 회전)
  const applyAngles = (azDeg: number, tiltDeg: number) => {
    solarPivot.rotation.set(0, 0, 0);
    solarPivot.rotation.y = (azDeg * Math.PI) / 180;
    solarPivot.rotation.x = -(tiltDeg * Math.PI) / 180;
  };
  // 초기: 남향(0°) · 30° 앞으로 기울임 (한국 고정형 표준)
  applyAngles(0, 30);

  const updateFire = (dt: number) => {
    batchRenderer.update(dt); // 파티클 시뮬레이션 — stop() 후 잔여 입자 제거를 위해 항상 필요
    if (fireOn) fireLight.intensity = 420 + Math.random() * 260; // 일렁이는 밝기(켜졌을 때만)
  };


  let renderer: THREE.WebGLRenderer | null = null;
  let map2: mapboxgl.Map | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let tram: THREE.Object3D | null = null; // 기차 토글용 참조 (모델 로드 후 세팅)
  let fireOn = true; // 외부 토글 상태 — updateFire가 참조
  const clock = new THREE.Clock();

  return {
    id: 'three-model',
    type: 'custom',
    renderingMode: '3d',
    // 외부 제어 API — 토글 UI에서 호출
    setFireVisible(on: boolean) {
      fireOn = on;
      fire.visible = on; // 조명 즉시 감춤
      // 파티클은 batchRenderer가 별도 관리 → stop()으로 살아있는 입자(연기 포함)까지 즉시 제거
      if (on) {
        flame.play();
        smoke.play();
      } else {
        flame.stop();
        smoke.stop();
      }
      map2?.triggerRepaint();
    },
    setTramVisible(on: boolean) {
      if (tram) {
        tram.visible = on;
        map2?.triggerRepaint();
      }
    },
    setPanelAngle(azimuthDeg: number, tiltDeg: number) {
      applyAngles(azimuthDeg, tiltDeg);
      map2?.triggerRepaint();
    },
    onAdd(map, gl) {
      map2 = map;
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;

      // DRACO 압축 GLTF 로드 (예제 webgl_animation_keyframes와 동일한 로더 구성)
      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      loader.load(
        '/models/LittlestTokyo.glb',
        (gltf) => {
          const model = gltf.scene;
          // 모델 원본 ~500유닛 → 0.1배 = 지도상 약 50m 규모 (Y-up 그대로, render의 rotX가 세워줌)
          model.scale.setScalar(0.1);
          model.position.set(0, 25, 0); // 바닥이 지면에 오게 살짝 올림 (모델 중심이 원점이라)

          // 모델 = 이름 붙은 부품들의 조립품. F12 콘솔에서 부품 목록 확인 가능
          if (import.meta.env.DEV) {
            const names: string[] = [];
            model.traverse((o) => { if (o.name) names.push(o.name); });
            console.log('[three-model] 부품 목록:', names);
          }
          // 기차(Object675) 참조 저장 — 토글용
          model.traverse((o) => { if (o.name === 'Object675') tram = o; });

          // 최대한 "집처럼" — 간판/장식/캐릭터/잡물 통째 숨김.
          // 주의: 이 모델은 `Object078` / `Object078_Plastic_Soft_0` 형태로 부모-자식이 flat 나열됨.
          // 실제 그려지는 mesh는 자식(`_재질_0`)이라 **prefix 매칭**으로 자식까지 다 잡아야 함.
          // Object649=건물 본체, Object674=outline(실루엣), Object675=트램 → 유지.
          const hidePrefixes = [
            // 옥상 광고판 12개 (Plane 시리즈 = 전부 간판)
            'Plane001', 'Plane003',
            'Plane103', 'Plane104', 'Plane105', 'Plane106', 'Plane107',
            'Plane108', 'Plane109', 'Plane110', 'Plane111', 'Plane112',
            // 판다 간판/캐릭터/부품
            'Object078',
            'body', 'leaf', 'hand1', 'hand2', 'foot1', 'foot2',
            'ear_05', 'ear2_06',
            // 전신주 전선 (일본 골목 특징)
            'wire1', 'wire2', 'wire3', 'wire4', 'wire5', 'wire7',
            // 옥상 반복 장식/캐릭터
            'Object706', 'Object707', 'Object708', 'Object709',
            'Object704', // 옥상 고양이(Plastic_Soft)
            'Object705', // 옥상 반복 장식 (Material_5516)
            // 간판 지지대(Plane과 짝지어 나온 것들)
            'Object687', 'Object688', 'Object697', 'Object698', 'Object699',
            // 골목 잡물 — 자동차·오토바이 등
            'Object608', 'Object680', 'Object681', 'Object224',
            // 나무 간판/문패 후보 (normal 재질) — 무사시노엔 나무 간판·소품 추정
            'Object682', 'Object332', 'Object081', 'Object531', 'Object532', 'Object689',
            // 판다·한자 스티커/간판 (알파 재질 서브메시 — Object649는 건물 본체이므로 서브메시만 콕 집어 제거)
            'Object649_alpha_0',
            'Object649_alpha_glass_0',
            'Object649_Material #5511_0',
            'Object649_Material #5512_0',
            // 옆에 있는 작은 판다들 (알파 오브젝트 4개)
            'Object619', 'Object620', 'Object621', 'Object622',
            // 나무
            'treezzzzz',
          ];
          const shouldHide = (name: string) =>
            hidePrefixes.some((p) => name === p || name.startsWith(`${p}_`));
          model.traverse((o) => { if (shouldHide(o.name)) o.visible = false; });

          scene.add(model);
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
          map2?.triggerRepaint();
        },
        undefined,
        (err) => console.warn('[three-model] glb load fail', err),
      );
    },
    render(_gl, matrix) {
      if (!renderer || !map2) return;
      // 가까이(줌 14+)에서만 애니메이션 재생 + 연속 렌더 (멀리선 정지 → 지도 idle 허용)
      const delta = clock.getDelta();
      if (map2.getZoom() >= 14) {
        mixer?.update(delta);
        updateFire(delta); // 항상 호출 — stop() 이후 잔여 파티클이 사라지려면 batchRenderer.update가 계속 돌아야 함
        map2.triggerRepaint();
      }
      const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const m = new THREE.Matrix4().fromArray(matrix);
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

/* 특정 시각(오늘 기준 hour)의 Date 객체 */
function dateAtHour(hour: number): Date {
  const d = new Date();
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  d.setHours(h, m, 0, 0);
  return d;
}

/* 태양 고도(도)로 lightPreset 결정 */
function presetFromAltitude(altitudeDeg: number): 'dawn' | 'day' | 'dusk' | 'night' {
  if (altitudeDeg < -6) return 'night'; // 박명 이전
  if (altitudeDeg < 3) return 'dawn'; // 일출/일몰 근처 → dawn 톤으로 통일
  return 'day';
}

/* 행정 뎁스: 나라(한국) › 시 › 구/군 › 동. 나라는 최상단 고정, 아래는 실동작 셀렉트 */

/* 시/도 목록 (드롭다운용) — 경계 GeoJSON의 name과 일치 */
const PROVINCES = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

/* 구/군·동 경계 데이터가 준비된 시/도 → 파일 슬러그. 여기 있는 시/도만 하위 드릴다운 가능.
   파일: public/geo/{slug}-districts.json (구, {name,code}) / {slug}-dong.json (동, {name,code,gu}) */
const REGION_SLUG: Record<string, string> = {
  울산광역시: 'ulsan',
  서울특별시: 'seoul',
};

/* GeoJSON 좌표에서 bbox [minLng, minLat, maxLng, maxLat] 계산 */
function featureBBox(geom: GeoJSON.Geometry): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const scan = (ring: number[][]) => {
    for (const pt of ring) {
      const x = pt[0] ?? 0;
      const y = pt[1] ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  };
  if (geom.type === 'Polygon') geom.coordinates.forEach(scan);
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((p) => p.forEach(scan));
  return [minX, minY, maxX, maxY];
}

/* ───────── 행정 뎁스 (progressive disclosure) ───────── */
type Depth = 'country' | 'city' | 'district' | 'dong';

/* 줌 → 행정 뎁스 기준값 */
function depthFromZoom(z: number): Depth {
  if (z < 9) return 'country';
  if (z < 11.5) return 'city';
  if (z < 13.5) return 'district';
  return 'dong';
}
/* 나라/시(광역) 레벨 여부 — 이 레벨에선 날씨 표시 + 전력망 범례/기본 라벨 숨김 */
const isWideLevel = (d: Depth) => d === 'country' || d === 'city';

/* ───────── 나라 레벨 날씨 (mock — 나중에 기상청 API허브로 교체) ───────── */
type Sky = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow';
const SKY_ICON: Record<Sky, string> = {
  clear: '☀️', partly: '⛅', cloudy: '☁️', rain: '🌧️', snow: '🌨️',
};

/* 주요 도시 17곳 날씨 (mock) */
type CityWx = { name: string; lng: number; lat: number; sky: Sky; tmin: number; tmax: number };
const CITY_WEATHER: CityWx[] = [
  { name: '서울', lng: 126.98, lat: 37.57, sky: 'partly', tmin: 23, tmax: 29 },
  { name: '인천', lng: 126.7, lat: 37.46, sky: 'partly', tmin: 22, tmax: 26 },
  { name: '춘천', lng: 127.73, lat: 37.87, sky: 'cloudy', tmin: 21, tmax: 29 },
  { name: '강릉', lng: 128.9, lat: 37.75, sky: 'clear', tmin: 25, tmax: 31 },
  { name: '수원', lng: 127.03, lat: 37.26, sky: 'rain', tmin: 22, tmax: 29 },
  { name: '홍성', lng: 126.66, lat: 36.6, sky: 'rain', tmin: 23, tmax: 29 },
  { name: '세종', lng: 127.29, lat: 36.48, sky: 'cloudy', tmin: 23, tmax: 30 },
  { name: '청주', lng: 127.49, lat: 36.64, sky: 'rain', tmin: 24, tmax: 31 },
  { name: '대전', lng: 127.38, lat: 36.35, sky: 'cloudy', tmin: 23, tmax: 31 },
  { name: '안동', lng: 128.73, lat: 36.57, sky: 'partly', tmin: 22, tmax: 31 },
  { name: '전주', lng: 127.15, lat: 35.82, sky: 'cloudy', tmin: 23, tmax: 32 },
  { name: '대구', lng: 128.6, lat: 35.87, sky: 'clear', tmin: 23, tmax: 34 },
  { name: '포항', lng: 129.36, lat: 36.02, sky: 'clear', tmin: 24, tmax: 33 },
  { name: '울산', lng: 129.31, lat: 35.54, sky: 'clear', tmin: 23, tmax: 31 },
  { name: '광주', lng: 126.85, lat: 35.16, sky: 'cloudy', tmin: 23, tmax: 32 },
  { name: '창원', lng: 128.68, lat: 35.23, sky: 'partly', tmin: 23, tmax: 31 },
  { name: '부산', lng: 129.08, lat: 35.18, sky: 'clear', tmin: 23, tmax: 31 },
];

/* 주간예보 (mock, 오늘부터 7일) — 하늘/최고/최저 */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKLY_SKY: Sky[] = ['partly', 'rain', 'cloudy', 'rain', 'clear', 'partly', 'clear'];
const WEEKLY_TMAX = [31, 29, 29, 28, 28, 29, 30];
const WEEKLY_TMIN = [23, 23, 23, 22, 22, 23, 24];

/* 1단계 날씨 뷰 종류 (강수는 다음 단계에서 추가) */
type WxView = 'temp' | 'wind' | 'precip';

/* 시/도별 순간풍속 (mock, m/s) — 바람 뷰 지역 음영. key는 skorea-provinces.json name과 일치 */
const PROVINCE_WIND: Record<string, number> = {
  서울특별시: 12, 인천광역시: 16, 경기도: 14, 강원도: 22,
  충청북도: 13, 충청남도: 18, 대전광역시: 14, 세종특별자치시: 14,
  전라북도: 20, 전라남도: 24, 광주광역시: 21, 경상북도: 19,
  대구광역시: 15, 경상남도: 23, 부산광역시: 26, 울산광역시: 25,
  제주특별자치도: 27,
};
/* 풍속 단계별 색 (연→진 청록, 기상청 순간풍속 톤). step 경계: 15 / 20 / 25 m/s */
const WIND_BANDS = [
  { c: '#bfe3dd', t: '15m/s 미만' },
  { c: '#7cc6bc', t: '15m/s 이상' },
  { c: '#3f9e94', t: '20m/s 이상' },
  { c: '#256b63', t: '25m/s 이상' },
] as const;
const WIND_FILL_STEP: mapboxgl.ExpressionSpecification = [
  'step', ['get', 'windSpd'], WIND_BANDS[0].c, 15, WIND_BANDS[1].c, 20, WIND_BANDS[2].c, 25, WIND_BANDS[3].c,
] as mapboxgl.ExpressionSpecification;

/* 시/도별 풍향 (mock, 도° — 화살표가 향하는 방위. 북=0, 시계방향) */
const PROVINCE_WIND_DIR: Record<string, number> = {
  서울특별시: 225, 인천광역시: 230, 경기도: 220, 강원도: 200,
  충청북도: 240, 충청남도: 250, 대전광역시: 245, 세종특별자치시: 245,
  전라북도: 260, 전라남도: 270, 광주광역시: 265, 경상북도: 210,
  대구광역시: 220, 경상남도: 280, 부산광역시: 285, 울산광역시: 260,
  제주특별자치도: 300,
};

/* 바람 화살표 아이콘(위쪽=북 기준) 생성 — 흰 화살표 + 진한 테두리로 어느 색 위에서도 보이게 */
function makeArrowImage(size = 26): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const cx = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, 2); // 꼭짓점(위=북)
  ctx.lineTo(size - 5, size - 5);
  ctx.lineTo(cx, size - 9);
  ctx.lineTo(5, size - 5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/* 시/도별 강수량 (mock, mm) */
const PROVINCE_PRECIP: Record<string, number> = {
  서울특별시: 60, 인천광역시: 40, 경기도: 55, 강원도: 15,
  충청북도: 30, 충청남도: 70, 대전광역시: 50, 세종특별자치시: 45,
  전라북도: 90, 전라남도: 110, 광주광역시: 95, 경상북도: 25,
  대구광역시: 20, 경상남도: 80, 부산광역시: 70, 울산광역시: 60,
  제주특별자치도: 120,
};
/* 강수량 단계별 색 (연→진 파랑). step 경계: 5 / 30 / 80 mm */
const PRECIP_BANDS = [
  { c: '#dbeafe', t: '5mm 미만' },
  { c: '#93c5fd', t: '5~30mm' },
  { c: '#3b82f6', t: '30~80mm' },
  { c: '#1e40af', t: '80mm 이상' },
] as const;
const PRECIP_FILL_STEP: mapboxgl.ExpressionSpecification = [
  'step', ['get', 'precip'], PRECIP_BANDS[0].c, 5, PRECIP_BANDS[1].c, 30, PRECIP_BANDS[2].c, 80, PRECIP_BANDS[3].c,
] as mapboxgl.ExpressionSpecification;

/* 도시 날씨 마커 엘리먼트 (아이콘 위 + 지명 + 최저/최고 기온 아래) */
function weatherMarkerEl(c: CityWx): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:none;';
  el.innerHTML = `
    <div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));">${SKY_ICON[c.sky]}</div>
    <div style="font-size:11px;font-weight:700;color:#0f172a;white-space:nowrap;text-shadow:0 0 3px #fff,0 1px 2px #fff;">${c.name}</div>
    <div style="font-size:11px;font-weight:800;white-space:nowrap;text-shadow:0 0 3px #fff,0 1px 2px #fff;">
      <span style="color:#2563eb;">${c.tmin}</span><span style="color:#94a3b8;">/</span><span style="color:#dc2626;">${c.tmax}°</span>
    </div>`;
  return el;
}

/* ── 구/군 단위 mock 날씨 (실데이터 전) — 이름 기반 결정적 값 ── */
function districtMock(name: string, i: number): { sky: Sky; temp: number; windSpd: number; windDir: number; precip: number } {
  const h = Array.from(name).reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return {
    sky: (['clear', 'partly', 'cloudy', 'rain'] as Sky[])[(h + i) % 4],
    temp: 26 + ((h + i) % 6), // 26~31℃
    windSpd: 1 + ((h * 3 + i) % 12), // 1~12 m/s
    windDir: (h * 7 + i * 31) % 360,
    precip: h % 5 === 0 ? 20 + (h % 60) : (h + i) % 12, // 대부분 적고 가끔 많음
  };
}

/* 폴리곤 대표점(중심) — 마커 위치용. 외곽 좌표 평균(구 단위는 충분) */
function centroidOf(geom: GeoJSON.Geometry): [number, number] {
  let sx = 0, sy = 0, n = 0;
  const add = (ring: number[][]) => {
    for (const p of ring) { sx += p[0]; sy += p[1]; n++; }
  };
  if (geom.type === 'Polygon') geom.coordinates.forEach(add);
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((poly) => poly.forEach(add));
  return n ? [sx / n, sy / n] : [0, 0];
}

/* 점이 링 안에 있는지 (ray casting) */
function pointInRing(pt: number[], ring: number[][]): boolean {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* 점이 폴리곤(구멍 고려) 안에 있는지 — 지도 중심의 지역 판정용 */
function pointInPolygon(pt: number[], geom: GeoJSON.Geometry): boolean {
  const inPoly = (poly: number[][][]) => {
    if (!pointInRing(pt, poly[0])) return false; // 외곽
    for (let k = 1; k < poly.length; k++) if (pointInRing(pt, poly[k])) return false; // 구멍
    return true;
  };
  if (geom.type === 'Polygon') return inPoly(geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(inPoly);
  return false;
}

/* 구 기온 마커 (아이콘 + 구명 + 현재기온) */
function districtMarkerEl(name: string, sky: Sky, temp: number): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:none;';
  el.innerHTML = `
    <div style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));">${SKY_ICON[sky]}</div>
    <div style="font-size:11px;font-weight:700;color:#0f172a;white-space:nowrap;text-shadow:0 0 3px #fff,0 1px 2px #fff;">${name}</div>
    <div style="font-size:11px;font-weight:800;color:#dc2626;white-space:nowrap;text-shadow:0 0 3px #fff,0 1px 2px #fff;">${temp}°</div>`;
  return el;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [weather, setWeather] = useState<'clear' | 'rain' | 'snow'>('clear');
  const [selected, setSelected] = useState<Plant | null>(null);
  const [depth, setDepth] = useState<Depth>('dong'); // 줌 기반 행정 뎁스 (초기 줌 15.5=동)
  const depthRef = useRef<Depth>('dong');
  const countryWxRef = useRef<mapboxgl.Marker[]>([]); // 나라 레벨 도시 날씨 마커
  const plantMarkersRef = useRef<mapboxgl.Marker[]>([]); // 발전소 위치 핀 (2단계부터 표시)
  const [wxView, setWxView] = useState<WxView>('temp'); // 1단계 날씨 뷰: 기온/바람/강수
  const [region, setRegion] = useState(''); // 선택된 시/도
  const [district, setDistrict] = useState(''); // 선택된 구/군 (울산)
  const [dong, setDong] = useState(''); // 선택된 읍/면/동
  const [districtList, setDistrictList] = useState<string[]>([]); // 현재 시/도의 구/군 목록
  const [dongList, setDongList] = useState<string[]>([]); // 현재 구의 동 목록
  const provincesRef = useRef<GeoJSON.FeatureCollection | null>(null); // 시/도 경계 GeoJSON 캐시
  const geoCacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map()); // URL별 GeoJSON 캐시
  const regionRef = useRef(''); // 현재 시/도 (moveend 자동감지에서 최신값 참조)
  const syncRegionRef = useRef<() => void>(() => {}); // moveend에서 호출할 최신 자동동기화 콜백
  const declutterRef = useRef<boolean | null>(null); // 라벨 on/off 직전 상태 (중복 토글=깜빡임 방지)
  const threeRef = useRef<ThreeLayerHandle | null>(null); // Three.js 레이어 제어 (화재/기차 토글)
  const [fireOn, setFireOn] = useState(true); // 4단계 화재 시뮬레이션 (기본 ON)
  const [tramOn, setTramOn] = useState(true); // 4단계 기차 애니메이션 (기본 ON)
  const [panelAzimuth, setPanelAzimuth] = useState(0); // 방위(-90=동·0=남·+90=서)
  const [panelTilt, setPanelTilt] = useState(30); // 기울기(-90=뒤로·0=수평·+90=앞으로), 한국 표준 30°
  const [buildMode, setBuildMode] = useState(false); // 건물 세우기 모드 (4단계)
  const buildModeRef = useRef(false); // 지도 클릭 핸들러가 최신값 참조
  const [buildHeight, setBuildHeight] = useState(25); // 새 건물 높이 (m)
  const buildHeightRef = useRef(25);
  const [buildShape, setBuildShape] = useState<BuildShape>('rect'); // 부지 모양 (사각/원형)
  const buildShapeRef = useRef<BuildShape>('rect');
  const [buildings, setBuildings] = useState<UserBuilding[]>([]); // 사용자가 세운 건물들
  const outlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hour, setHour] = useState(() => {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapboxgl.accessToken) {
      setStatus('error');
      setErrMsg('VITE_MAPBOX_TOKEN 미설정 (.env 확인)');
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      center: [HOME.lng, HOME.lat],
      zoom: 15.5,
      pitch: 60,
      bearing: -20,
      antialias: true,
      fadeDuration: 0, // 라벨 충돌 페이드 끔 — 상시 리페인트 시 지명이 깜빡이는 것 방지
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    // 줌 → 행정 뎁스 추적 (progressive disclosure 구동)
    const onZoom = () => {
      const d = depthFromZoom(map.getZoom());
      if (d !== depthRef.current) {
        depthRef.current = d;
        setDepth(d);
      }
    };
    map.on('zoom', onZoom);
    // 스크롤/이동이 멎으면 지도 중심의 지역을 자동 감지해 표시 동기화 (카메라 안 건드림)
    const onMoveEnd = () => syncRegionRef.current();
    map.on('moveend', onMoveEnd);
    // 건물 세우기 모드 (4단계에서만) — 사각형/원형:
    //   누름 → 드래그 미리보기 → 놓으면 생성 (짧은 클릭 = 기본 크기)
    let buildStart: { lngLat: mapboxgl.LngLat; point: mapboxgl.Point } | null = null;
    const previewSrc = () => map.getSource('build-preview') as mapboxgl.GeoJSONSource | undefined;
    const setPreviewRing = (ring: number[][]) =>
      previewSrc()?.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
      });
    const clearPreview = () => previewSrc()?.setData({ type: 'FeatureCollection', features: [] });
    // 드래그 반경(m) — 원형용
    const radiusM = (a: mapboxgl.LngLat, b: mapboxgl.LngLat) =>
      approxDist([a.lng, a.lat], [b.lng, b.lat]) * 111_320;

    const onBuildDown = (e: mapboxgl.MapMouseEvent) => {
      if (!buildModeRef.current || depthRef.current !== 'dong') return;
      buildStart = { lngLat: e.lngLat, point: e.point };
    };
    const onBuildMove = (e: mapboxgl.MapMouseEvent) => {
      if (!buildStart) return;
      if (buildShapeRef.current === 'circle') {
        setPreviewRing(circleRing(buildStart.lngLat.lng, buildStart.lngLat.lat, Math.max(2, radiusM(buildStart.lngLat, e.lngLat))));
      } else {
        setPreviewRing(rectRing(buildStart.lngLat, e.lngLat));
      }
    };
    const onBuildUp = (e: mapboxgl.MapMouseEvent) => {
      if (!buildStart) return;
      const start = buildStart;
      buildStart = null;
      clearPreview();
      if (!buildModeRef.current || depthRef.current !== 'dong') return;
      const dragPx = Math.hypot(e.point.x - start.point.x, e.point.y - start.point.y);
      let ring: number[][];
      if (buildShapeRef.current === 'circle') {
        ring = circleRing(
          start.lngLat.lng,
          start.lngLat.lat,
          dragPx < 6 ? 10 : Math.max(2, radiusM(start.lngLat, e.lngLat)), // 클릭 = 반지름 10m
        );
      } else {
        ring = dragPx < 6
          ? buildingFootprint(e.lngLat.lng, e.lngLat.lat) // 클릭 = 기본 20m 부지
          : rectRing(start.lngLat, e.lngLat);
      }
      setBuildings((prev) => [...prev, { ring, height: buildHeightRef.current }]);
    };
    map.on('mousedown', onBuildDown);
    map.on('mousemove', onBuildMove);
    map.on('mouseup', onBuildUp);

    let flowRaf = 0; // 송전망 흐름 애니메이션 프레임 id

    const safeResize = () => {
      if (mapRef.current === map) map.resize();
    };

    map.on('load', () => {
      setStatus('ready');
      safeResize();
      requestAnimationFrame(safeResize);

      // 발전소 핀 마커 — 초록 물방울 핀 + 이름 라벨. 나라(1단계)에선 숨김, 시(2단계)부터 표시
      const hideAtCountry = depthRef.current === 'country';
      const plantMarkers: mapboxgl.Marker[] = [];
      for (const p of PLANTS) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;';
        wrap.innerHTML = `
          <svg width="30" height="42" viewBox="0 0 24 34" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.5));">
            <path d="M12 0C5.9 0 1 4.9 1 11c0 8 11 22 11 22s11-14 11-22C23 4.9 18.1 0 12 0z"
                  fill="#22c55e" stroke="#ffffff" stroke-width="1.6"/>
            <circle cx="12" cy="11" r="4.2" fill="#ffffff"/>
          </svg>
          <span style="font-size:12px;font-weight:700;color:#f1f5f9;white-space:nowrap;text-shadow:0 1px 3px #0a0f1c,0 0 4px #0a0f1c;">${p.name}</span>
        `;
        wrap.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectPlant(p);
        });
        if (hideAtCountry) wrap.style.display = 'none';
        plantMarkers.push(new mapboxgl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map));
      }
      plantMarkersRef.current = plantMarkers;
    });

    // 컨테이너 크기가 바뀌면 캔버스 동기화 (Mapbox는 자동 resize 안 함)
    const ro = new ResizeObserver(safeResize);
    ro.observe(containerRef.current);
    window.addEventListener('resize', safeResize);
    // 레이아웃 안정화 후 여러 번 강제 resize (초기 높이 오측정 대비)
    const timers = [80, 200, 500, 1000].map((ms) => setTimeout(safeResize, ms));
    map.on('style.load', () => {
      try {
        map.setConfigProperty('basemap', 'show3dObjects', true);
        map.setLanguage('ko'); // 지도 라벨 한글화 (Mapbox 내장 i18n)
      } catch (err) {
        console.warn('[mapbox config]', err);
      }

      // 부곡 = Three.js GLTF 모델 (커스텀 레이어) — 애니메이션 포함 3D 모델이 지도에 이음새 없이 통합.
      // (기존 초록 비컨·fill-extrusion 패널 mock은 이 모델로 대체됨. 클릭/선택은 핀 마커가 담당)
      if (!map.getLayer('three-model')) {
        const layer = createModelThreeLayer(BUGOK_STATION.lng, BUGOK_STATION.lat);
        map.addLayer(layer);
        threeRef.current = layer; // 토글 UI가 이 handle로 화재/기차 제어
      }

      // 사용자 배치 건물 — "건물 세우기" 모드에서 클릭/드래그로 세우는 박스 (fill-extrusion)
      if (!map.getSource('user-buildings')) {
        map.addSource('user-buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'user-buildings-3d',
          type: 'fill-extrusion',
          source: 'user-buildings',
          paint: {
            'fill-extrusion-color': '#38bdf8',
            'fill-extrusion-base': 0,
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 0.85,
          },
        });
        // 드래그 중 부지 미리보기 (반투명 면 + 외곽선)
        map.addSource('build-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'build-preview-fill',
          type: 'fill',
          source: 'build-preview',
          paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.25 },
        });
        map.addLayer({
          id: 'build-preview-line',
          type: 'line',
          source: 'build-preview',
          paint: { 'line-color': '#7dd3fc', 'line-width': 2, 'line-dasharray': [2, 1.5] },
        });
      }

      // ── 송전/배전망 ── (줌 13부터 표시 = 건물이 보이기 시작하는 시점)
      if (!map.getSource('grid-lines')) {
        map.addSource('grid-lines', { type: 'geojson', data: gridLinesGeoJSON() });
        map.addSource('grid-nodes', { type: 'geojson', data: gridNodesGeoJSON() });

        // 실측 경로로 교체 — 발전소↔변전소(154kV 실제 선로)는 인입선, 변전소→공장은 배전.
        // 전력 전달 경로 전체를 파란색으로 통일하고, 공장은 변전소를 경유해 공급받게 함.
        Promise.all([
          fetch('/geo/plant-feed.json').then((r) => r.json()),
          fetch('/geo/ulsan-power.json').then((r) => r.json()),
        ])
          .then(([feed, power]: [
            { substation: { name: string; lng: number; lat: number }; feed: GeoJSON.Feature },
            GeoJSON.FeatureCollection,
          ]) => {
            if (mapRef.current !== map) return;
            // 송전탑 좌표 (그래프 라우팅 실패 시 폴백용)
            const towers: [number, number][] = power.features
              .filter((f) => f.properties?.kind === 'tower' && f.geometry.type === 'Point')
              .map((f) => (f.geometry as GeoJSON.Point).coordinates as [number, number]);
            // 실측 송전선 회랑을 그래프로 — 배전선이 그 위를 최단경로로 따라가 노란 송전선에 겹침
            const corridorLines: number[][][] = power.features
              .filter((f) => f.properties?.kind === 'line' && f.geometry.type === 'LineString')
              .map((f) => (f.geometry as GeoJSON.LineString).coordinates);
            if (feed.feed.geometry.type === 'LineString') corridorLines.push(feed.feed.geometry.coordinates);
            const graph = buildPowerGraph(corridorLines);
            // 공장은 발전소 직결이 아니라 변전소를 경유해 공급받음 (표준 계통 흐름)
            const sub: [number, number] = [feed.substation.lng, feed.substation.lat];
            const distLines: GeoJSON.Feature[] = LOADS.map((l) => {
              const dest: [number, number] = [l.lng, l.lat];
              const coords = routeAlongGraph(graph, sub, dest) ?? routeViaTowers(sub, dest, towers);
              return {
                type: 'Feature',
                properties: { role: 'distribution' },
                geometry: { type: 'LineString', coordinates: coords },
              };
            });
            (map.getSource('grid-lines') as mapboxgl.GeoJSONSource)?.setData({
              type: 'FeatureCollection',
              features: [feed.feed, ...distLines],
            });
            const nodes: GeoJSON.Feature[] = [
              {
                type: 'Feature',
                properties: { id: 'sub-real', name: feed.substation.name, kind: 'substation' },
                geometry: { type: 'Point', coordinates: [feed.substation.lng, feed.substation.lat] },
              },
              ...LOADS.map((l): GeoJSON.Feature => ({
                type: 'Feature',
                properties: { id: l.id, name: l.name, kind: l.kind },
                geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
              })),
            ];
            (map.getSource('grid-nodes') as mapboxgl.GeoJSONSource)?.setData({
              type: 'FeatureCollection',
              features: nodes,
            });
          })
          .catch((err) => console.warn('[feed] load fail', err));

        // 1) 베이스 라인 — 발전소 전력 경로 전체 파란색 (인입선=굵게 / 배전선=얇게)
        map.addLayer({
          id: 'grid-base',
          type: 'line',
          source: 'grid-lines',
          minzoom: 13,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#2563eb',
            'line-width': ['match', ['get', 'role'], 'transmission', 5, 3.5],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 14, 0.65],
          },
        });

        // 2) 흐름 라인 — 위에 얹는 밝은 점선(대시), 오프셋 애니메이션으로 "흐름" 표현
        map.addLayer({
          id: 'grid-flow',
          type: 'line',
          source: 'grid-lines',
          minzoom: 13,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#93c5fd',
            'line-width': ['match', ['get', 'role'], 'transmission', 4, 2.5],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 14, 1],
          },
        });

        // 3) 노드 점 — 변전소(주황 큰 점) / 수용가(파랑 작은 점)
        map.addLayer({
          id: 'grid-nodes-dot',
          type: 'circle',
          source: 'grid-nodes',
          minzoom: 13,
          paint: {
            'circle-color': ['match', ['get', 'kind'], 'substation', '#f59e0b', '#2563eb'],
            'circle-radius': ['match', ['get', 'kind'], 'substation', 8, 5],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 14, 1],
            'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 14, 1],
          },
        });

        // 4) 노드 라벨
        map.addLayer({
          id: 'grid-nodes-label',
          type: 'symbol',
          source: 'grid-nodes',
          minzoom: 14,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
          },
          paint: { 'text-color': '#e2e8f0', 'text-halo-color': '#0a0f1c', 'text-halo-width': 1.5 },
        });

        // 흐름 애니메이션 — 대시 배열을 순환시켜 선 위 빛이 흐르는 효과
        const dashSeq: number[][] = [
          [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1],
          [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5],
          [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
        ];
        let step = 0;
        let last = 0;
        const animateFlow = (t: number) => {
          flowRaf = requestAnimationFrame(animateFlow);
          if (t - last < 60) return; // ~16fps로 제한
          // 그리드가 보이는 줌(13+)에서만 갱신 — 안 보일 때 상시 리페인트하면 라벨이 깜빡임
          if (map.getZoom() < 13) return;
          last = t;
          step = (step + 1) % dashSeq.length;
          if (map.getLayer('grid-flow')) {
            map.setPaintProperty('grid-flow', 'line-dasharray', dashSeq[step]);
          }
        };
        flowRaf = requestAnimationFrame(animateFlow);
      }

      // ── 실제 송전 인프라 (OSM 실측: 송전선·송전탑·변전소) ──
      // 줌 뎁스별 표시: 선 z11.5+, 변전소 z12+, 송전탑 z13+
      if (!map.getSource('power-infra')) {
        // 빈 소스로 시작 → 로드 후 2회선 병렬 중복을 합쳐서 주입
        map.addSource('power-infra', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        fetch('/geo/ulsan-power.json')
          .then((r) => r.json())
          .then((fc: GeoJSON.FeatureCollection) => {
            if (mapRef.current !== map) return;
            (map.getSource('power-infra') as mapboxgl.GeoJSONSource)?.setData(dedupeParallelLines(fc));
          })
          .catch((err) => console.warn('[power-infra] load fail', err));

        // 송전선 — 전압 구분 없이 단일 "송전선" 스타일로 통합 (v0 시각 단순화)
        map.addLayer({
          id: 'power-lines',
          type: 'line',
          source: 'power-infra',
          filter: ['==', ['get', 'kind'], 'line'],
          minzoom: 11.5,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#fbbf24',
            'line-width': 2,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 13, 0.75],
          },
        });

        // 송전탑 — 가까운 줌에서만 (회색 점)
        map.addLayer({
          id: 'power-towers',
          type: 'circle',
          source: 'power-infra',
          filter: ['==', ['get', 'kind'], 'tower'],
          minzoom: 13,
          paint: {
            'circle-color': '#cbd5e1',
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 5],
            'circle-stroke-color': '#334155',
            'circle-stroke-width': 1.2,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.9],
            'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.9],
          },
        });

        // 변전소 — 보라 영역 + 실명 라벨
        map.addLayer({
          id: 'power-subs-fill',
          type: 'fill',
          source: 'power-infra',
          filter: ['==', ['get', 'kind'], 'substation'],
          minzoom: 12,
          paint: { 'fill-color': '#a78bfa', 'fill-opacity': 0.25 },
        });
        map.addLayer({
          id: 'power-subs-label',
          type: 'symbol',
          source: 'power-infra',
          filter: ['==', ['get', 'kind'], 'substation'],
          minzoom: 12.5,
          layout: { 'text-field': ['get', 'name'], 'text-size': 11 },
          paint: { 'text-color': '#c4b5fd', 'text-halo-color': '#0a0f1c', 'text-halo-width': 1.5 },
        });
      }

      // 행정구역 윤곽선 — 빈 소스로 시작, 선택 시 setData로 채우고 잠깐 표시
      if (!map.getSource('region-outline')) {
        map.addSource('region-outline', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        // 글로우(넓고 흐린 노란 선) — 아래 깔아서 잘 보이게
        map.addLayer({
          id: 'region-outline-glow',
          type: 'line',
          source: 'region-outline',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#fde047',
            'line-width': 10,
            'line-opacity': 0,
            'line-opacity-transition': { duration: 600 },
            'line-blur': 6,
          },
        });
        // 선명한 노란 윤곽선
        map.addLayer({
          id: 'region-outline-line',
          type: 'line',
          source: 'region-outline',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#facc15',
            'line-width': 4,
            'line-opacity': 0,
            'line-opacity-transition': { duration: 600 },
          },
        });
      }

      // 나라 레벨 바람 뷰 — 시/도 지역 음영(풍속) + 화살표(풍향) + 수치 라벨
      if (!map.hasImage('wind-arrow')) map.addImage('wind-arrow', makeArrowImage());
      if (!map.getSource('kr-wind')) {
        map.addSource('kr-wind', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'kr-wind-fill',
          type: 'fill',
          source: 'kr-wind',
          layout: { visibility: 'none' },
          paint: { 'fill-color': WIND_FILL_STEP, 'fill-opacity': 0.62 },
        });
        // 시/도별 풍향 화살표(회전) + 풍속 수치 라벨(아래)
        map.addLayer({
          id: 'kr-wind-label',
          type: 'symbol',
          source: 'kr-wind',
          layout: {
            visibility: 'none',
            'icon-image': 'wind-arrow',
            'icon-rotate': ['get', 'windDir'],
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'text-field': ['concat', ['to-string', ['get', 'windSpd']], ' m/s'],
            'text-size': 12,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        });
      }

      // 나라 레벨 강수 뷰 — 시/도 지역 음영(강수량 단계별 파랑) + 수치 라벨
      if (!map.getSource('kr-precip')) {
        map.addSource('kr-precip', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'kr-precip-fill',
          type: 'fill',
          source: 'kr-precip',
          layout: { visibility: 'none' },
          paint: { 'fill-color': PRECIP_FILL_STEP, 'fill-opacity': 0.6 },
        });
        map.addLayer({
          id: 'kr-precip-label',
          type: 'symbol',
          source: 'kr-precip',
          layout: {
            visibility: 'none',
            'text-field': ['concat', ['to-string', ['get', 'precip']], 'mm'],
            'text-size': 13,
          },
          paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        });
      }

      // 나라 레벨 은은한 시/도 경계 — 1단계에서 지역 구분용 (채색 없이 얇은 선만)
      if (!map.getSource('kr-outline')) {
        map.addSource('kr-outline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'kr-outline-line',
          type: 'line',
          source: 'kr-outline',
          layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
          paint: { 'line-color': '#94a3b8', 'line-width': 1.1, 'line-opacity': 0.5 },
        });
      }
    });
    map.on('error', (e) => {
      const msg = (e as { error?: Error }).error?.message ?? String(e);
      console.warn('[mapbox]', msg);
      // 지도가 이미 로드된 후의 런타임 에러(조명/비 파라미터 등)는 치명적이지 않으므로
      // 화면을 날리지 않고 로그만. 초기 로드 실패만 error 상태로.
      if (!map.loaded()) {
        setErrMsg(msg);
        setStatus('error');
      }
    });

    return () => {
      timers.forEach(clearTimeout);
      if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current);
      cancelAnimationFrame(flowRaf);
      map.off('zoom', onZoom);
      map.off('moveend', onMoveEnd);
      map.off('mousedown', onBuildDown);
      map.off('mousemove', onBuildMove);
      map.off('mouseup', onBuildUp);
      window.removeEventListener('resize', safeResize);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 시각 → 태양 위치 → 조명·프리셋 갱신 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;

    // 이 suncalc(2.0.0)는 altitude/azimuth를 '도(degree)' 단위로 반환하며
    // azimuth는 북쪽 기준 시계방향 → Mapbox direction 규약과 그대로 일치 (변환 불필요)
    const pos = SunCalc.getPosition(dateAtHour(hour), SUN_REF.lat, SUN_REF.lng);
    const altitudeDeg = pos.altitude; // -90~90
    const azimuthDeg = ((pos.azimuth % 360) + 360) % 360; // 0~360

    // Mapbox directional light direction = [방위각 0~360, 극각 0~90]
    //   극각(polar): 0°=천정(머리 위), 90°=지평선 → polar = 90 - 고도
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const azimuth = clamp(azimuthDeg, 0, 360);
    const polar = clamp(90 - altitudeDeg, 0, 90);

    // 태양 고도로 밝기 계수 (0~1) — 도를 라디안으로 변환 후 sin
    const daylight = Math.max(0, Math.sin((altitudeDeg * Math.PI) / 180));

    try {
      map.setConfigProperty('basemap', 'lightPreset', presetFromAltitude(altitudeDeg));

      map.setLights([
        {
          id: 'sun',
          type: 'directional',
          properties: {
            direction: [azimuth, polar],
            color: altitudeDeg < 8 ? '#ffd9a0' : '#ffffff', // 저고도엔 노을빛
            intensity: 0.2 + daylight * 0.6,
            'cast-shadows': true,
          },
        },
        {
          id: 'ambient',
          type: 'ambient',
          properties: {
            color: '#ffffff',
            intensity: 0.25 + daylight * 0.25,
          },
        },
      ]);
    } catch (err) {
      console.warn('[sun light]', err);
    }

  }, [hour, status]);

  /* 태양광 패널 각도(양축) → 3D 씬 반영 */
  useEffect(() => {
    if (status === 'ready') threeRef.current?.setPanelAngle(panelAzimuth, panelTilt);
  }, [panelAzimuth, panelTilt, status]);

  /* 건물 세우기: 배치 목록 → 지도 소스 반영 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    (map.getSource('user-buildings') as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: buildings.map((b) => ({
        type: 'Feature',
        properties: { height: b.height },
        geometry: { type: 'Polygon', coordinates: [b.ring] },
      })),
    });
  }, [buildings, status]);

  /* 건물 세우기 모드 → 핸들러 ref + 커서 + 지도 끌기 잠금(드래그=부지 그리기가 되도록) */
  useEffect(() => {
    buildModeRef.current = buildMode;
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = buildMode ? 'crosshair' : '';
    if (buildMode) {
      map.dragPan.disable();
    } else {
      map.dragPan.enable();
      (map.getSource('build-preview') as mapboxgl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [buildMode]);
  /* 모양 변경 → ref 동기화 */
  useEffect(() => {
    buildShapeRef.current = buildShape;
  }, [buildShape]);
  useEffect(() => {
    buildHeightRef.current = buildHeight;
  }, [buildHeight]);
  /* 4단계를 벗어나면 건물 세우기 모드 자동 해제 */
  useEffect(() => {
    if (depth !== 'dong') setBuildMode(false);
  }, [depth]);

  /* 날씨(맑음/비/눈) 몰입 효과 — 상세(3·4단계)에서만. 광역(1·2)에선 항상 해제 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    const immersive = !isWideLevel(depth); // 비/눈은 산단 몰입 레벨에서만

    // 비
    if (immersive && weather === 'rain') {
      map.setRain({
        density: zoomReveal(0.5),
        intensity: 1.0,
        color: '#a8adbc',
        opacity: 0.7,
        vignette: zoomReveal(1.0),
        'vignette-color': '#464646',
        direction: [0, 80],
        'droplet-size': [2.6, 18.2],
        'distortion-strength': 0.7,
        'center-thinning': 0,
      });
    } else {
      map.setRain(null);
    }

    // 눈
    if (immersive && weather === 'snow') {
      map.setSnow({
        density: zoomReveal(0.85),
        intensity: 1.0,
        'center-thinning': 0.1,
        direction: [0, 50],
        opacity: 1.0,
        color: '#ffffff',
        'flake-size': 0.71,
        vignette: zoomReveal(0.3),
        'vignette-color': '#ffffff',
      });
    } else {
      map.setSnow(null);
    }
  }, [weather, depth, status]);

  /* 도시 날씨 마커 생성 (아이콘+지명+기온) — 1회 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    const markers = CITY_WEATHER.map((c) =>
      new mapboxgl.Marker({ element: weatherMarkerEl(c), anchor: 'center' }).setLngLat([c.lng, c.lat]).addTo(map),
    );
    countryWxRef.current = markers;
    for (const m of markers) m.getElement().style.display = 'none'; // 초기 숨김 — 아래 뎁스 효과가 표시 결정
    return () => {
      // 스코프 전환으로 교체됐을 수 있으니 현재 마커 기준으로 정리
      for (const m of countryWxRef.current) m.remove();
      countryWxRef.current = [];
    };
  }, [status]);

  /* 지역 오버레이 데이터 로드 (바람/강수 음영 + 은은한 경계) — 지도 로드 시 미리 채움 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    let alive = true;
    fetch('/geo/skorea-provinces.json')
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        if (!alive || mapRef.current !== map) return;
        provincesRef.current = fc;
        const withProps = (props: Record<string, Record<string, number>>): GeoJSON.FeatureCollection => ({
          type: 'FeatureCollection',
          features: fc.features.map((f) => {
            const name = String(f.properties?.name);
            const extra: Record<string, number> = {};
            for (const [key, table] of Object.entries(props)) extra[key] = table[name] ?? 0;
            return { ...f, properties: { ...f.properties, ...extra } };
          }),
        });
        (map.getSource('kr-outline') as mapboxgl.GeoJSONSource | undefined)?.setData(fc);
        (map.getSource('kr-wind') as mapboxgl.GeoJSONSource | undefined)?.setData(
          withProps({ windSpd: PROVINCE_WIND, windDir: PROVINCE_WIND_DIR }),
        );
        (map.getSource('kr-precip') as mapboxgl.GeoJSONSource | undefined)?.setData(withProps({ precip: PROVINCE_PRECIP }));
      })
      .catch((err) => console.warn('[kr overlay] load fail', err));
    return () => {
      alive = false;
    };
  }, [status]);

  /* 뎁스·뷰 변화 → progressive disclosure
     1단계 나라: 전국 날씨(기온 마커 or 바람 음영) + 은은한 경계 + 기본 라벨 끔 (위치 숨김)
     2단계 시~: 날씨 걷히고 등록된 발전소 위치 등장 + 기본 라벨 복원 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    const wide = isWideLevel(depth); // 나라(1) + 시(2) = 날씨 레벨
    const showTemp = wide && wxView === 'temp';
    const showWind = wide && wxView === 'wind';
    const showPrecip = wide && wxView === 'precip';
    // 기온 뷰 = 도시 마커 / 바람·강수 뷰 = 지역 음영 (1·2단계)
    for (const m of countryWxRef.current) m.getElement().style.display = showTemp ? '' : 'none';
    const setVis = (ids: string[], on: boolean) => {
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    };
    setVis(['kr-wind-fill', 'kr-wind-label'], showWind);
    setVis(['kr-precip-fill', 'kr-precip-label'], showPrecip);
    // 은은한 시/도 경계 = 날씨 레벨(1·2)
    if (map.getLayer('kr-outline-line')) {
      map.setLayoutProperty('kr-outline-line', 'visibility', wide ? 'visible' : 'none');
    }
    // 발전소 위치 핀 = 시(2단계)부터 표시, 나라(1단계)에선 숨김
    for (const m of plantMarkersRef.current) m.getElement().style.display = depth === 'country' ? 'none' : '';
    // 기본 라벨 on/off는 광역↔상세가 "실제로 바뀔 때만" — 매번 재호출하면 라벨이 깜빡임
    if (declutterRef.current !== wide) {
      declutterRef.current = wide;
      try {
        map.setConfigProperty('basemap', 'showPlaceLabels', !wide);
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', !wide);
        map.setConfigProperty('basemap', 'showRoadLabels', !wide);
        map.setConfigProperty('basemap', 'showTransitLabels', !wide);
      } catch (err) {
        console.warn('[declutter]', err);
      }
    }
  }, [depth, wxView, status]);

  /* region 상태 → regionRef 동기화 (드롭다운 선택도 moveend 자동감지가 인지하도록) */
  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  /* 화재/기차 토글 → Three.js 레이어에 반영 (4단계 UI에서만 조작 가능) */
  useEffect(() => {
    if (status === 'ready') threeRef.current?.setFireVisible(fireOn);
  }, [fireOn, status]);
  useEffect(() => {
    if (status === 'ready') threeRef.current?.setTramVisible(tramOn);
  }, [tramOn, status]);

  /* 발전소 선택 = 카메라 이동 + 상세 표시 */
  const selectPlant = (p: Plant) => {
    setSelected(p);
    mapRef.current?.flyTo({
      center: [p.lng, p.lat],
      zoom: 16.5,
      pitch: 62,
      bearing: -20,
      duration: 2200,
      essential: true,
    });
  };

  /* 목록으로 = 선택 해제 + 전체 뷰로 살짝 줌아웃 */
  const backToList = () => {
    setSelected(null);
    mapRef.current?.flyTo({
      center: [HOME.lng, HOME.lat],
      zoom: 14,
      pitch: 55,
      bearing: -20,
      duration: 1800,
      essential: true,
    });
  };

  /* GeoJSON 지연 로드 + URL별 캐시 (경로별 1회) */
  const loadGeo = async (url: string): Promise<GeoJSON.FeatureCollection | null> => {
    const cached = geoCacheRef.current.get(url);
    if (cached) return cached;
    try {
      const res = await fetch(url);
      const fc = (await res.json()) as GeoJSON.FeatureCollection;
      geoCacheRef.current.set(url, fc);
      return fc;
    } catch (err) {
      console.warn('[region] geojson load fail:', url, err);
      return null;
    }
  };

  /* 윤곽선 잠깐 표시 + 카메라 이동. close=true면 동 레벨 3D 근접 뷰(건물까지 가깝게) */
  const flashFeatures = (feats: GeoJSON.Feature[], close = false) => {
    const map = mapRef.current;
    if (!map || feats.length === 0) return;
    if (close) {
      // 동 선택 → 3D 근접(건물 보이는 몰입 뷰). 윤곽선 없이 중심으로 날아감
      map.flyTo({ center: centroidOf(feats[0].geometry), zoom: 15.8, pitch: 60, bearing: -18, duration: 1800, essential: true });
      return;
    }
    const src = map.getSource('region-outline') as mapboxgl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: feats });
    map.setPaintProperty('region-outline-line', 'line-opacity', 1);
    map.setPaintProperty('region-outline-glow', 'line-opacity', 0.6);

    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    for (const f of feats) {
      const [a, b, c, d] = featureBBox(f.geometry);
      if (a < minX) minX = a;
      if (b < minY) minY = b;
      if (c > maxX) maxX = c;
      if (d > maxY) maxY = d;
    }
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, pitch: 0, bearing: 0, duration: 1600 });

    if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current);
    outlineTimerRef.current = setTimeout(() => {
      mapRef.current?.setPaintProperty('region-outline-line', 'line-opacity', 0);
      mapRef.current?.setPaintProperty('region-outline-glow', 'line-opacity', 0);
    }, 3500);
  };

  /* 단일 피처 윤곽선 (close=true면 3D 근접 뷰) */
  const flashFeature = (feat: GeoJSON.Feature, close = false) => flashFeatures([feat], close);

  /* 날씨 표시 단위 전환.
     districtsFC 주면 그 시/도의 "구별" 날씨(구 폴리곤 색음영 + 구별 기온 마커),
     null이면 "전국 시/도별"로 복원. 바람/강수는 kr-wind/kr-precip 소스 데이터만 교체(레이어 재사용). */
  const setWeatherScope = (districtsFC: GeoJSON.FeatureCollection | null) => {
    const map = mapRef.current;
    if (!map) return;
    const windSrc = map.getSource('kr-wind') as mapboxgl.GeoJSONSource | undefined;
    const precipSrc = map.getSource('kr-precip') as mapboxgl.GeoJSONSource | undefined;
    const showTemp = isWideLevel(depthRef.current) && wxView === 'temp';
    // 기존 기온 마커 제거
    for (const m of countryWxRef.current) m.remove();

    if (districtsFC?.features?.length) {
      // 구별
      const rows = districtsFC.features.map((f, i) => ({ f, name: String(f.properties?.name), mk: districtMock(String(f.properties?.name), i) }));
      windSrc?.setData({
        type: 'FeatureCollection',
        features: rows.map(({ f, mk }) => ({ ...f, properties: { ...f.properties, windSpd: mk.windSpd, windDir: mk.windDir } })),
      });
      precipSrc?.setData({
        type: 'FeatureCollection',
        features: rows.map(({ f, mk }) => ({ ...f, properties: { ...f.properties, precip: mk.precip } })),
      });
      countryWxRef.current = rows.map(({ f, name, mk }) => {
        const marker = new mapboxgl.Marker({ element: districtMarkerEl(name, mk.sky, mk.temp), anchor: 'center' })
          .setLngLat(centroidOf(f.geometry))
          .addTo(map);
        marker.getElement().style.display = showTemp ? '' : 'none';
        return marker;
      });
    } else {
      // 전국 시/도별 복원
      const prov = provincesRef.current;
      if (prov) {
        windSrc?.setData({
          type: 'FeatureCollection',
          features: prov.features.map((f) => ({
            ...f,
            properties: { ...f.properties, windSpd: PROVINCE_WIND[String(f.properties?.name)] ?? 0, windDir: PROVINCE_WIND_DIR[String(f.properties?.name)] ?? 0 },
          })),
        });
        precipSrc?.setData({
          type: 'FeatureCollection',
          features: prov.features.map((f) => ({ ...f, properties: { ...f.properties, precip: PROVINCE_PRECIP[String(f.properties?.name)] ?? 0 } })),
        });
      }
      countryWxRef.current = CITY_WEATHER.map((cw) => {
        const marker = new mapboxgl.Marker({ element: weatherMarkerEl(cw), anchor: 'center' }).setLngLat([cw.lng, cw.lat]).addTo(map);
        marker.getElement().style.display = showTemp ? '' : 'none';
        return marker;
      });
    }
  };

  /* 나라(한국) = 은은한 시/도 경계 + 전국 뷰 + 하위 선택 초기화 */
  const showKorea = async () => {
    setRegion('');
    setDistrict('');
    setDong('');
    setDongList([]);
    const map = mapRef.current;
    if (!map) return;
    // 이전 단일선택 하이라이트(노란 번쩍임) 제거
    if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current);
    (map.getSource('region-outline') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
    map.setPaintProperty('region-outline-line', 'line-opacity', 0);
    map.setPaintProperty('region-outline-glow', 'line-opacity', 0);

    setDistrictList([]);
    setWeatherScope(null); // 전국 시/도별 날씨로 복원
    // 전국 뷰로 (시/도 경계·바람·강수 데이터는 로드 시 미리 채워둠)
    const fc = provincesRef.current ?? (await loadGeo('/geo/skorea-provinces.json'));
    if (fc?.features?.length) {
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const f of fc.features) {
        const [a, b, c, d] = featureBBox(f.geometry);
        if (a < minX) minX = a;
        if (b < minY) minY = b;
        if (c > maxX) maxX = c;
        if (d > maxY) maxY = d;
      }
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, pitch: 0, bearing: 0, duration: 1600 });
    } else {
      map.flyTo({ center: [127.8, 36.2], zoom: 6, pitch: 0, bearing: 0, duration: 1600, essential: true });
    }
  };

  /* 시/도 선택 = 해당 구역 이동 + 윤곽선 + (데이터 있으면) 구/군 목록 준비 */
  const showRegion = async (name: string) => {
    setRegion(name);
    setDistrict('');
    setDong('');
    setDongList([]);
    setDistrictList([]);
    if (!name) {
      showKorea();
      return;
    }
    const fc = provincesRef.current ?? (await loadGeo('/geo/skorea-provinces.json'));
    const feat = fc?.features.find((f) => f.properties?.name === name);
    if (feat) flashFeature(feat);

    // 하위(구/군) 경계 데이터가 있는 시/도면 구 목록 + 구별 날씨로 전환
    const slug = REGION_SLUG[name];
    if (slug) {
      const districts = await loadGeo(`/geo/${slug}-districts.json`);
      setDistrictList(
        (districts?.features ?? [])
          .map((f) => String(f.properties?.name))
          .sort((a, b) => a.localeCompare(b, 'ko')),
      );
      setWeatherScope(districts ?? null); // 서울·울산 → 구별 날씨
    } else {
      setWeatherScope(null); // 구 데이터 없는 시/도 → 전국 시/도별 유지
    }
  };

  /* 구/군 선택 = 해당 구역 이동 + 그 구의 동 목록 준비 */
  const showDistrict = async (name: string) => {
    setDistrict(name);
    setDong('');
    const slug = REGION_SLUG[region] ?? '';
    if (!name || !slug) {
      // 구 해제 → 시/도 전체로
      setDongList([]);
      if (region) showRegion(region);
      return;
    }
    const fc = await loadGeo(`/geo/${slug}-districts.json`);
    const feat = fc?.features.find((f) => f.properties?.name === name);
    if (feat) flashFeature(feat);

    const dongs = await loadGeo(`/geo/${slug}-dong.json`);
    setDongList(
      (dongs?.features ?? [])
        .filter((f) => f.properties?.gu === name)
        .map((f) => String(f.properties?.name))
        .sort((a, b) => a.localeCompare(b, 'ko')),
    );
  };

  /* 읍/면/동 선택 (선택된 구 안에서) */
  const showDong = async (name: string) => {
    setDong(name);
    const slug = REGION_SLUG[region] ?? '';
    if (!name || !slug) {
      showDistrict(district);
      return;
    }
    const fc = await loadGeo(`/geo/${slug}-dong.json`);
    const feat = fc?.features.find((f) => f.properties?.name === name && f.properties?.gu === district);
    if (feat) flashFeature(feat, true); // 동 → 3D 근접 뷰
  };

  /* 지도 뷰(스크롤)에 맞춰 지역 자동 전환 — 카메라는 그대로, 표시(구별 날씨 등)만 동기화 */
  const applyRegionNoCamera = async (name: string) => {
    regionRef.current = name;
    setRegion(name);
    setDistrict('');
    setDong('');
    setDongList([]);
    const slug = REGION_SLUG[name];
    if (slug) {
      const districts = await loadGeo(`/geo/${slug}-districts.json`);
      setDistrictList((districts?.features ?? []).map((f) => String(f.properties?.name)).sort((a, b) => a.localeCompare(b, 'ko')));
      setWeatherScope(districts ?? null);
    } else {
      setDistrictList([]);
      setWeatherScope(null);
    }
  };

  /* moveend 콜백 — 지도 중심의 시/도를 감지해 자동 전환 (2단계↑). 1단계(줌아웃)면 전국으로 */
  const syncRegionToView = () => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    if (depthFromZoom(map.getZoom()) === 'country') {
      if (regionRef.current !== '') applyRegionNoCamera(''); // 전국 복원
      return;
    }
    const prov = provincesRef.current;
    if (!prov) return;
    const c = map.getCenter();
    const feat = prov.features.find((f) => pointInPolygon([c.lng, c.lat], f.geometry));
    const name = feat ? String(feat.properties?.name) : '';
    if (name && name !== regionRef.current) applyRegionNoCamera(name);
  };
  // moveend 핸들러는 1회 등록되므로, 항상 최신 콜백을 ref로 참조
  syncRegionRef.current = syncRegionToView;

  /* 표시용 태양 정보 (suncalc는 이미 도 단위) */
  const sunPos = SunCalc.getPosition(dateAtHour(hour), SUN_REF.lat, SUN_REF.lng);
  const sunAltDeg = sunPos.altitude;
  const times = SunCalc.getTimes(new Date(), SUN_REF.lat, SUN_REF.lng);
  const fmt = (d: Date | null) =>
    d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '--:--';
  const hh = String(Math.floor(hour)).padStart(2, '0');
  const mm = String(Math.round((hour - Math.floor(hour)) * 60)).padStart(2, '0');

  // 주간예보 7일 (오늘부터) — 요일/날짜는 오늘 기준 계산, 값은 mock
  const weekly = WEEKLY_SKY.map((sky, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { dow: DOW[d.getDay()], date: d.getDate(), sky, tmax: WEEKLY_TMAX[i], tmin: WEEKLY_TMIN[i] };
  });

  return (
    <div className="fixed inset-0 h-screen w-screen">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" style={{ height: '100dvh', width: '100vw' }} />

      {status === 'ready' && (
        <>
          {/* 화재 경보 — 전체 화면. 4단계 + 화재 스위치 ON일 때. 세련된 반투명 톤 */}
          {depth === 'dong' && fireOn && (
            <>
              {/* 화면 테두리 은은한 붉은 발광 (부드럽게 pulse). 인터랙션은 통과 */}
              <div
                className="pointer-events-none fixed inset-0 z-30"
                style={{
                  boxShadow: 'inset 0 0 180px 60px rgba(248, 113, 113, 0.28)',
                  animation: 'terrawatt-alert-glow 2.4s ease-in-out infinite',
                }}
              />
              <style>{`@keyframes terrawatt-alert-glow {
                0%, 100% { opacity: 0.7; }
                50% { opacity: 1; }
              }`}</style>
              {/* 상단 전체 가로 알림 — 반투명 유리 위 정보성 텍스트 */}
              <div
                className="fixed left-0 right-0 top-0 z-40 flex items-center justify-center gap-3 border-b border-red-400/40 py-3 text-white backdrop-blur-md"
                style={{
                  background: 'linear-gradient(180deg, rgba(190, 32, 32, 0.55) 0%, rgba(190, 32, 32, 0.25) 100%)',
                }}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/80 text-lg"
                  style={{ animation: 'terrawatt-alert-glow 1.4s ease-in-out infinite' }}
                >
                  ⚠
                </span>
                <div className="flex flex-col items-start leading-tight sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-semibold uppercase tracking-[0.15em] text-red-200 sm:text-xs">
                    Fire Alert
                  </span>
                  <span className="text-base font-bold sm:text-lg">
                    화재 발생 · 부곡 에너지 스테이션
                  </span>
                  <span className="text-xs font-medium text-red-100/80">진화 대응 중</span>
                </div>
              </div>
            </>
          )}

          {/* 상단 중앙: 행정 뎁스 선택 (나라 › 시 › 구/군 › 동) */}
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-2 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 text-sm text-white">
              <button
                type="button"
                onClick={showKorea}
                title="나라 — 전국 보기"
                className="rounded-md bg-white/10 px-2 py-1 font-semibold text-white transition-colors hover:bg-white/20"
              >
                🇰🇷 한국
              </button>
              <span className="text-slate-500">›</span>
              <select
                value={region}
                onChange={(e) => showRegion(e.target.value)}
                className="rounded-md bg-white/10 px-2 py-1 text-white outline-none [&>option]:text-black"
              >
                <option value="">전체 보기</option>
                {PROVINCES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              {districtList.length > 0 && (
                <>
                  <span className="text-slate-500">›</span>
                  <select
                    value={district}
                    onChange={(e) => showDistrict(e.target.value)}
                    className="rounded-md bg-white/10 px-2 py-1 text-white outline-none [&>option]:text-black"
                  >
                    <option value="">구/군 선택</option>
                    {districtList.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {district && dongList.length > 0 && (
                <>
                  <span className="text-slate-500">›</span>
                  <select
                    value={dong}
                    onChange={(e) => showDong(e.target.value)}
                    className="rounded-md bg-white/10 px-2 py-1 text-white outline-none [&>option]:text-black"
                  >
                    <option value="">동 선택</option>
                    {dongList.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {/* 상단 중앙: 검색창 — 동(4단계)부터. 지금은 UI만(기능 준비중) */}
          {depth === 'dong' && (
            <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 shadow-xl backdrop-blur">
                <span className="text-slate-300">🔍</span>
                <input
                  type="text"
                  placeholder="건물·회사·주소 검색 (준비중)"
                  className="w-64 bg-transparent text-sm text-white placeholder-slate-400 outline-none"
                />
              </div>
            </div>
          )}

          {/* 좌상단: 브랜드 + 목록 ↔ 상세 */}
          <div className="absolute left-4 top-4 z-10 w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
            <div className="mb-3 border-b border-white/10 pb-2">
              <div className="text-sm font-extrabold tracking-wide text-white">⚡ TerraWatt</div>
              <div className="mt-0.5 text-[10px] text-slate-400">3D Energy Grid Explorer</div>
            </div>
            {selected ? (
              /* 상세 뷰 */
              <div>
                <button
                  type="button"
                  onClick={backToList}
                  className="mb-3 flex items-center gap-1 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
                >
                  ← 목록으로
                </button>
                <button
                  type="button"
                  onClick={() => selectPlant(selected)}
                  className="flex w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-white/10"
                  title="이 위치로 다시 이동"
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-green-500 shadow-[0_0_10px_2px_#22c55e99]" />
                  <div>
                    <div className="text-base font-bold text-white">{selected.name}</div>
                    <div className="text-xs text-blue-300">{selected.type}</div>
                  </div>
                </button>
                <div className="mt-3 space-y-1 text-xs text-slate-300">
                  <div>🏭 {selected.address}</div>
                  <div>
                    🧭 {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                  </div>
                </div>

                {/* 실시간 발전 상태 — 현재 상태 + 액션 조언 (raw 수치는 최소화) */}
                {(() => {
                  const snap = pvSnapshot(sunAltDeg);
                  let status: { icon: string; label: string; tone: string; advice: string };
                  if (sunAltDeg <= 0) {
                    status = { icon: '🌙', label: '대기 중', tone: 'text-slate-400',
                      advice: `일출 ${fmt(times.sunrise)} 예정 · 시스템 대기 상태` };
                  } else if (snap.ratePct >= 75) {
                    status = { icon: '☀', label: '최적 발전 중', tone: 'text-amber-300',
                      advice: '정상 가동 · 별도 조치 불필요' };
                  } else if (snap.ratePct >= 40) {
                    status = { icon: '🌤', label: '정상 발전 중', tone: 'text-yellow-300',
                      advice: '패널 청소 시 발전 효율 +5~10%' };
                  } else if (snap.ratePct >= 10) {
                    status = { icon: '☁', label: '저출력 발전', tone: 'text-sky-300',
                      advice: '흐리거나 저고도 · 배터리(ESS) 방전 권장' };
                  } else {
                    status = { icon: '🌅', label: '발전 준비', tone: 'text-orange-300',
                      advice: '태양 상승 대기 · 곧 발전 시작' };
                  }
                  return (
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className={`flex items-center gap-2 text-sm font-bold ${status.tone}`}>
                        <span className="text-lg">{status.icon}</span>
                        <span>{status.label}</span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-extrabold text-white">{snap.powerKw.toFixed(1)}</span>
                        <span className="text-xs text-slate-400">kW 발전</span>
                        <span className="ml-auto font-mono text-xs text-slate-400">
                          {snap.ratePct.toFixed(0)}% / 500 kW
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, snap.ratePct)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-start gap-1 text-[11px] text-slate-300">
                        <span className="text-slate-500">💡</span>
                        <span>{status.advice}</span>
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => selectPlant(selected)}
                  className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  🎯 이 위치로 이동
                </button>
              </div>
            ) : (
              /* 목록 뷰 */
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-300">발전소 바로가기</div>
                <div className="flex flex-col gap-1">
                  {PLANTS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPlant(p)}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white transition-colors hover:bg-white/10"
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full border-2 border-white bg-green-500 shadow-[0_0_8px_2px_#22c55e88]" />
                      <span className="flex flex-col">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-[11px] text-slate-400">{p.address}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 우상단: 1단계=날씨 뷰 토글(기온/바람/강수) · 상세=비/눈 효과 + 태양 정보 */}
          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
            {isWideLevel(depth) ? (
              <>
                {/* 1·2단계(광역): 날씨 뷰 토글 + 현재 뷰 범례 (비/눈·태양은 상세에서) */}
                <div className="flex gap-1 rounded-lg bg-black/50 p-1 shadow-lg backdrop-blur">
                  {([
                    { key: 'temp', label: '🌡 기온' },
                    { key: 'wind', label: '💨 바람' },
                    { key: 'precip', label: '🌧 강수' },
                  ] as const).map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => setWxView(v.key)}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                        wxView === v.key ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                {(wxView === 'wind' || wxView === 'precip') && (
                  <div className="rounded-xl bg-black/70 px-4 py-3 text-left shadow-xl backdrop-blur">
                    <div className="mb-2 text-xs font-bold tracking-wide text-white">
                      {wxView === 'wind' ? '💨 순간풍속' : '🌧 강수량'}
                    </div>
                    <div className="flex flex-col gap-1 text-[11px] text-slate-200">
                      {(wxView === 'wind' ? WIND_BANDS : PRECIP_BANDS).map((s) => (
                        <div key={s.t} className="flex items-center gap-2">
                          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: s.c, opacity: 0.9 }} />
                          <span>{s.t}</span>
                        </div>
                      ))}
                      {wxView === 'wind' && (
                        <div className="mt-1 flex items-center gap-2 border-t border-white/10 pt-1">
                          <svg width="14" height="14" viewBox="0 0 14 14">
                            <path d="M7 1 L11 12 L7 9.5 L3 12 Z" fill="#fff" stroke="#0f172a" strokeWidth="1.2" />
                          </svg>
                          <span>화살표 = 풍향</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* 상세 레벨: 비/눈 몰입 효과 (태양고도는 하단 시간 패널로 이동) */
              <div className="flex gap-1 rounded-lg bg-black/50 p-1 shadow-lg backdrop-blur">
                {([
                  { key: 'clear', label: '☀️ 맑음' },
                  { key: 'rain', label: '🌧 비' },
                  { key: 'snow', label: '❄️ 눈' },
                ] as const).map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => setWeather(w.key)}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                      weather === w.key ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}

            {/* 4단계 전용: 설비 시뮬레이션 토글 (DR·화재 경보 시연). 비/눈 버튼 바로 아래에 붙음 */}
            {depth === 'dong' && (
              <div className="rounded-xl bg-black/70 px-4 py-3 text-left shadow-xl backdrop-blur">
                <div className="mb-2 text-xs font-bold tracking-wide text-white">🎛 설비 시뮬레이션</div>
                <div className="flex flex-col gap-2 text-[12px] text-slate-200">
                  <label className="flex cursor-pointer items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">🔥 화재 경보</span>
                    <Switch
                      checked={fireOn}
                      onCheckedChange={setFireOn}
                      className="data-[state=checked]:bg-red-500"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">🚋 기차 운행</span>
                    <Switch
                      checked={tramOn}
                      onCheckedChange={setTramOn}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </label>
                  {/* 태양광 패널 양축 조절 (대칭 -90~+90) — 실제 dual-axis 트래커와 동일 */}
                  <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">☀ 방위</span>
                      <span className="font-mono text-[11px] text-amber-300">{panelAzimuth}°</span>
                    </div>
                    <Slider
                      min={-90}
                      max={90}
                      step={1}
                      value={[panelAzimuth]}
                      onValueChange={(v) => setPanelAzimuth(v[0])}
                    />
                    <div className="flex justify-between text-[9px] text-slate-500">
                      <span>동 -90</span>
                      <span>남 0</span>
                      <span>서 +90</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">📐 기울기</span>
                      <span className="font-mono text-[11px] text-amber-300">{panelTilt}°</span>
                    </div>
                    <Slider
                      min={-90}
                      max={90}
                      step={1}
                      value={[panelTilt]}
                      onValueChange={(v) => setPanelTilt(v[0])}
                    />
                    <div className="flex justify-between text-[9px] text-slate-500">
                      <span>뒤로 -90</span>
                      <span>수평 0</span>
                      <span>앞으로 +90</span>
                    </div>
                  </div>

                  {/* 건물 세우기 — 켜고 지도를 클릭하면 그 자리에 박스 건물 */}
                  <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                    <label className="flex cursor-pointer items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5">🏗 건물 세우기</span>
                      <Switch
                        checked={buildMode}
                        onCheckedChange={setBuildMode}
                        className="data-[state=checked]:bg-sky-500"
                      />
                    </label>
                    {buildMode && (
                      <>
                        {/* 부지 모양 선택 */}
                        <div className="flex gap-1">
                          {([
                            { k: 'rect', label: '⬛ 사각' },
                            { k: 'circle', label: '⚫ 원형' },
                          ] as const).map((s) => (
                            <button
                              key={s.k}
                              type="button"
                              onClick={() => setBuildShape(s.k)}
                              className={`flex-1 rounded px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                                buildShape === s.k
                                  ? 'bg-sky-500 text-white'
                                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <div className="text-[10px] text-sky-300">
                          {buildShape === 'rect'
                            ? '드래그 = 크기 그리기 · 클릭 = 기본 20m'
                            : '드래그 = 반지름 · 클릭 = 기본 10m'}
                          <br />
                          <span className="text-slate-500">(모드 중 지도 이동 잠김 — 스크롤 줌은 가능)</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>높이</span>
                          <span className="font-mono text-[11px] text-sky-300">{buildHeight}m</span>
                        </div>
                        <Slider
                          min={10}
                          max={100}
                          step={5}
                          value={[buildHeight]}
                          onValueChange={(v) => setBuildHeight(v[0])}
                        />
                        {buildings.length > 0 && (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-400">{buildings.length}동 배치됨</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setBuildings((p) => p.slice(0, -1))}
                                className="rounded bg-white/10 px-2 py-0.5 transition-colors hover:bg-white/20"
                              >
                                ↩ 취소
                              </button>
                              <button
                                type="button"
                                onClick={() => setBuildings([])}
                                className="rounded bg-white/10 px-2 py-0.5 transition-colors hover:bg-white/20"
                              >
                                🗑 전체
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 좌하단: 주간예보 — 2단계(시/도 선택)에서만. 지역별로 달라서 1단계(전국)엔 안 넣음 */}
          {depth === 'city' && (
            <div className="absolute bottom-8 left-4 z-10 rounded-xl bg-black/70 px-3 py-3 shadow-xl backdrop-blur">
              <div className="mb-2 text-xs font-bold tracking-wide text-white">
                📅 {region ? `${region} ` : ''}주간예보
              </div>
              <div className="flex gap-1">
                {weekly.map((d, i) => (
                  <div
                    key={i}
                    className={`flex w-11 flex-col items-center gap-0.5 rounded-md py-1 ${i === 0 ? 'bg-white/10' : ''}`}
                  >
                    <div
                      className={`text-[11px] font-bold ${
                        d.dow === '일' ? 'text-red-400' : d.dow === '토' ? 'text-sky-400' : 'text-slate-200'
                      }`}
                    >
                      {d.dow}
                    </div>
                    <div className="text-[10px] text-slate-400">{d.date}</div>
                    <div className="text-xl leading-none">{SKY_ICON[d.sky]}</div>
                    <div className="text-[11px] font-extrabold text-amber-400">{d.tmax}°</div>
                    <div className="text-[11px] font-bold text-sky-300">{d.tmin}°</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 좌하단: 전력망 범례 — 구·군·동(상세) 레벨에서만 표시 (나라·시 광역에선 숨김) */}
          {!isWideLevel(depth) && (
          <div className="absolute bottom-8 left-4 z-10 rounded-xl bg-black/70 px-4 py-3 shadow-xl backdrop-blur">
            <div className="mb-2 text-xs font-bold tracking-wide text-white">⚡ 전력망 범례</div>
            <div className="flex flex-col gap-1.5 text-[11px] text-slate-200">
              {([
                { color: '#fbbf24', w: 2, dash: false, label: '송전선 (실측)' },
                { color: '#2563eb', w: 3.5, dash: false, label: '발전소 전력 경로 (발전소↔변전소↔공장)' },
              ] as const).map((it) => (
                <div key={it.label} className="flex items-center gap-2">
                  <svg width="30" height="10" className="shrink-0">
                    <line
                      x1="1"
                      y1="5"
                      x2="29"
                      y2="5"
                      stroke={it.color}
                      strokeWidth={it.w}
                      strokeLinecap="round"
                      strokeDasharray={it.dash ? '4 3' : undefined}
                    />
                  </svg>
                  <span>{it.label}</span>
                </div>
              ))}
              <div className="my-1 border-t border-white/10" />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: '#f59e0b' }} />
                  변전소
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: 'rgba(167,139,250,0.35)' }} />
                  변전소 구역
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full border" style={{ background: '#cbd5e1', borderColor: '#334155' }} />
                  송전탑
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: '#2563eb' }} />
                  공장
                </span>
              </div>
            </div>
          </div>
          )}

          {/* 하단: 시간 슬라이더(+태양고도) — 광역(1·2단계)에선 시간 맥락이 없어 숨김, 상세(3·4)부터 */}
          {!isWideLevel(depth) && (
          <div className="absolute bottom-8 left-1/2 z-10 w-[min(90vw,560px)] -translate-x-1/2 rounded-xl bg-black/70 px-5 py-4 shadow-xl backdrop-blur">
            <div className="mb-1 flex items-center justify-between text-sm text-white">
              <span className="flex items-center gap-2">🕐 시각</span>
              <span className="font-mono text-lg font-bold">
                {hh}:{mm}
              </span>
            </div>
            {/* 태양고도·일출·일몰 (시간과 한 곳에) */}
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-300">
              <span>☀️ 태양 고도 {sunAltDeg.toFixed(1)}° · {sunAltDeg < 0 ? '🌙 야간' : '주간'}</span>
              <span>일출 {fmt(times.sunrise)} · 일몰 {fmt(times.sunset)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>00시</span>
              <span>06시</span>
              <span>12시</span>
              <span>18시</span>
              <span>24시</span>
            </div>
          </div>
          )}
        </>
      )}

      {status === 'loading' && (
        <div className="pointer-events-none absolute left-4 top-4 rounded bg-black/60 px-3 py-2 text-sm text-white">
          지도 로딩 중...
        </div>
      )}
      {status === 'error' && (
        <div className="absolute left-4 top-4 max-w-lg rounded bg-red-900/80 px-3 py-2 text-sm text-white">
          <div className="font-semibold">지도 로드 실패</div>
          <div className="mt-1 whitespace-pre-wrap break-all">{errMsg}</div>
        </div>
      )}
    </div>
  );
}
