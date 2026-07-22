import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as SunCalc from 'suncalc';
import { Switch } from './components/ui/switch';
import { Slider } from './components/ui/slider';

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

/* 시뮬레이션 총 스텝 수 — 기간이 하루든 3개월이든 30스텝(30초)에 시각화 완료 */
const SIM_TOTAL_STEPS = 30;
/* 프리셋 기간(일) — 프리셋 버튼용 */
const SIM_DAY_PRESETS: { days: number; label: string }[] = [
  { days: 1, label: '하루' },
  { days: 3, label: '3일' },
  { days: 7, label: '1주' },
  { days: 30, label: '1개월' },
  { days: 60, label: '2개월' },
  { days: 90, label: '3개월' },
];

/* 옥상 태양광 규격 (mock) — 근거를 노출하기 위해 패널 단위로 계산.
   패널 1장 = 0.5 kWp / 설치 점유 2.5㎡(간격 포함) / 옥상 유효 설치율 75%.
   → 실효 밀도 0.75 ÷ 2.5 × 0.5 = 0.15 kWp/㎡ (기존 값과 동일). */
const PANEL_KWP = 0.5;
const PANEL_AREA_M2 = 2.5;
const ROOF_USABLE = 0.75;
function roofSolar(areaM2: number, altitudeDeg: number) {
  const panels = Math.floor((areaM2 * ROOF_USABLE) / PANEL_AREA_M2);
  const capacityKwp = panels * PANEL_KWP;
  return { panels, capacityKwp, powerKw: pvSnapshot(altitudeDeg, capacityKwp).powerKw };
}
/* 발전량(kW)만 필요할 때 (지도 색칠용) */
function roofSolarKw(areaM2: number, altitudeDeg: number): number {
  return roofSolar(areaM2, altitudeDeg).powerKw;
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
// 건물 하나 = 한 편집 세션에 그린 여러 조각(rings). 완료 시 하나로 확정.
type UserBuilding = { id: string; name: string; rings: number[][][]; height: number };

/* 링(위경도) → 근사 넓이(m²) — shoelace 공식 + 위경도→미터 변환 */
function ringAreaM2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0][1];
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerLat = 111_320;
  const xy = ring.map(([lng, lat]) => [lng * mPerLng, lat * mPerLat]);
  let a = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    a += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  }
  return Math.abs(a) / 2;
}
/* 짧은 고유 id — 클릭 시 어느 건물인지 식별 */
const makeBuildingId = () => `b-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
/* 링 중심점 [lng, lat] — 목록에서 이동·좌표 표시용 (마지막 중복점 제외 평균) */
function ringCenter(ring: number[][]): [number, number] {
  const pts = ring.slice(0, -1);
  const [sx, sy] = pts.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
  return [sx / pts.length, sy / pts.length];
}
/* 건물(여러 조각) 집계: 총 바닥면적, 전체 중심, 중심 기준 확대/축소 */
function buildingArea(rings: number[][][]): number {
  return rings.reduce((s, r) => s + ringAreaM2(r), 0);
}
function buildingCenter(rings: number[][][]): [number, number] {
  const cs = rings.map(ringCenter);
  const [sx, sy] = cs.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
  return [sx / cs.length, sy / cs.length];
}
function scaleRings(rings: number[][][], factor: number): number[][][] {
  const [cx, cy] = buildingCenter(rings);
  return rings.map((r) => r.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]));
}

/* 태양 계산 기준점(발전소 위치) */
const SUN_REF = { lat: HOME.lat, lng: HOME.lng };

/* zoom 11→13 사이에서 0→value로 페이드 인 */
function zoomReveal(value: number): mapboxgl.ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 11, 0, 13, value] as mapboxgl.ExpressionSpecification;
}


/* 부곡 3D 건물 — 지연 로딩판.
   줌 15 이상으로 들어갈 때 처음 한 번만 three.js·모델을 내려받는다.
   (멀리서 보는 동안엔 3D 엔진도 모델도 전혀 받지 않음 → 초기 로딩 부담 0) */
let buildingLoading = false;
async function addBuildingLayerLazy(map: mapboxgl.Map, lng: number, lat: number) {
  if (buildingLoading || map.getLayer('three-model')) return;
  buildingLoading = true;
  const [THREE, { GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
  ]);
  if (map.getLayer('three-model')) return;

  const origin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
  const t = { x: origin.x, y: origin.y, z: origin.z, scale: origin.meterInMercatorCoordinateUnits() };
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(40, 70, 80);
  scene.add(sun);
  let renderer: import('three').WebGLRenderer | null = null;
  let map2: mapboxgl.Map | null = null;

  map.addLayer({
    id: 'three-model',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map2 = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      loader.load('/models/hanil-tube-opt.glb', (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        model.scale.setScalar(115 / (Math.max(size.x, size.y, size.z) || 1)); // v0.2와 같은 115m
        const box2 = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box2.min.y;
        scene.add(model);
        map2?.triggerRepaint();
      });
    },
    render(_gl, matrix) {
      if (!renderer || !map2) return;
      if (map2.getZoom() < 15) return; // 멀어지면 그리지 않음(지도 idle 허용)
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
  } as mapboxgl.CustomLayerInterface);
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
  const [fireOn, setFireOn] = useState(false); // 4단계 화재 경보 시연 (기본 OFF — 화면 붉은 오버레이만)
  const [buildMode, setBuildMode] = useState(false); // 건물 세우기 모드 (4단계)
  const buildModeRef = useRef(false); // 지도 클릭 핸들러가 최신값 참조
  const [buildHeight, setBuildHeight] = useState(25); // 새 건물 높이 (m)
  const [buildShape, setBuildShape] = useState<BuildShape>('rect'); // 부지 모양 (사각/원형)
  const buildShapeRef = useRef<BuildShape>('rect');
  const [buildings, setBuildings] = useState<UserBuilding[]>([]); // 확정된 건물들
  const buildingsRef = useRef<UserBuilding[]>([]); // 지도 클릭 핸들러가 최신 buildings 참조
  const [buildName, setBuildName] = useState(''); // 편집 중 건물 이름 (비면 자동)
  const [draftRings, setDraftRings] = useState<number[][][]>([]); // 편집 중 그린 조각들 (완료 시 하나로 확정)
  const [draftRedo, setDraftRedo] = useState<number[][][]>([]); // 편집 중 되돌린 조각 (앞으로 되살리기)
  const [selectedUserBldg, setSelectedUserBldg] = useState<UserBuilding | null>(null); // 클릭한 건물 상세
  const [simOn, setSimOn] = useState(false); // 옥상 태양광 시뮬레이션 모드 진입
  const [simDays, setSimDays] = useState(1); // 시뮬 기간(일수) — 오늘부터 N일
  const [simPlaying, setSimPlaying] = useState(false); // 재생 중
  const [simCurrentStep, setSimCurrentStep] = useState(0); // 재생 스텝 (0 ~ SIM_TOTAL_STEPS-1)
  const [simSelected, setSimSelected] = useState<Set<string>>(new Set()); // 시뮬 대상으로 선택된 건물 id들
  const [sizePct, setSizePct] = useState(100); // 선택 건물 크기 배율 (%) — 상세에서 조절
  const sizeBaseRef = useRef<{ id: string; rings: number[][][] } | null>(null); // 배율 기준 원본(누적 방지)
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
      // 건물이 보일 만큼 들어오면 그때 3D 건물(엔진+모델) 로드 — 그 전엔 아무것도 안 받음
      if (map.getZoom() >= 15) addBuildingLayerLazy(map, BUGOK_STATION.lng, BUGOK_STATION.lat);
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
          dragPx < 6 ? 10 : Math.max(2, radiusM(start.lngLat, e.lngLat)),
        );
      } else {
        ring = dragPx < 6
          ? buildingFootprint(e.lngLat.lng, e.lngLat.lat)
          : rectRing(start.lngLat, e.lngLat);
      }
      // 조각을 draft에 추가 (아직 건물 아님 — 완료 시 하나로 확정)
      setDraftRings((prev) => [...prev, ring]);
      setDraftRedo([]);
    };
    map.on('mousedown', onBuildDown);
    map.on('mousemove', onBuildMove);
    map.on('mouseup', onBuildUp);

    // 건물 클릭 → 상세 표시 (배치 모드 OFF + 4단계일 때만). 배치 모드 중 클릭은 새 건물용
    const onBldgClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (buildModeRef.current || depthRef.current !== 'dong') return;
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (!id) return;
      const b = buildingsRef.current.find((x) => x.id === id);
      if (b) setSelectedUserBldg(b);
    };
    const onBldgEnter = () => {
      if (!buildModeRef.current) map.getCanvas().style.cursor = 'pointer';
    };
    const onBldgLeave = () => {
      if (!buildModeRef.current) map.getCanvas().style.cursor = '';
    };
    map.on('click', 'user-buildings-3d', onBldgClick);
    map.on('mouseenter', 'user-buildings-3d', onBldgEnter);
    map.on('mouseleave', 'user-buildings-3d', onBldgLeave);

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

      // 사용자 배치 건물 — "건물 세우기" 모드에서 클릭/드래그로 세우는 박스 (fill-extrusion)
      if (!map.getSource('user-buildings')) {
        map.addSource('user-buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'user-buildings-3d',
          type: 'fill-extrusion',
          source: 'user-buildings',
          paint: {
            // 선택된 건물=빨강 강조(우선), 아니면 power로 색칠(없으면 하늘색)
            'fill-extrusion-color': [
              'case',
              ['==', ['get', 'selected'], true],
              '#ef4444', // 선택 = 빨강
              [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'power'], -1],
                -1, '#38bdf8', // 시뮬 OFF → 기본 하늘색
                0, '#334155', // 순간 kW=0 (야간·저고도) → 회색
                15, '#fbbf24', // 앰버 (저출력)
                40, '#f97316', // 주황
                80, '#ea580c', // 진한 주황 (정오급)
              ],
            ],
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
        // 편집 중 조각(draft) — 완료 전이라 별색(청록)·반투명으로 "아직 확정 안 됨" 표시
        map.addSource('build-draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'build-draft-3d',
          type: 'fill-extrusion',
          source: 'build-draft',
          paint: {
            'fill-extrusion-color': '#22d3ee',
            'fill-extrusion-base': 0,
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 0.6,
          },
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
      map.off('click', 'user-buildings-3d', onBldgClick);
      map.off('mouseenter', 'user-buildings-3d', onBldgEnter);
      map.off('mouseleave', 'user-buildings-3d', onBldgLeave);
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

  /* 건물 세우기: 배치 목록 → 지도 소스 반영. 시뮬 ON이면 현재 스텝의 순간 kW로 색칠 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    const selId = selectedUserBldg?.id;
    // 현재 스텝의 실제 시각 = 오늘부터 (step × stepHours) 만큼 지난 시점
    const stepHours = (simDays * 24) / SIM_TOTAL_STEPS;
    const now = new Date();
    const nowAtPlayback = new Date(now.getTime() + simCurrentStep * stepHours * 3600_000);
    const altAtPlayback = simOn
      ? SunCalc.getPosition(nowAtPlayback, SUN_REF.lat, SUN_REF.lng).altitude
      : 0;
    (map.getSource('user-buildings') as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: buildings.map((b) => {
        const props: Record<string, unknown> = {
          height: b.height,
          id: b.id,
          name: b.name,
          selected: b.id === selId,
        };
        if (simOn && simSelected.has(b.id)) {
          props.power = roofSolarKw(buildingArea(b.rings), altAtPlayback);
        }
        return {
          type: 'Feature' as const,
          properties: props,
          geometry: { type: 'MultiPolygon' as const, coordinates: b.rings.map((r) => [r]) },
        };
      }),
    });
  }, [buildings, status, simOn, simCurrentStep, simDays, simSelected, selectedUserBldg?.id]);

  /* 편집 중 조각(draft) → 지도에 미리 표시 (완료 전) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    (map.getSource('build-draft') as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: draftRings.map((r) => ({
        type: 'Feature' as const,
        properties: { height: buildHeight },
        geometry: { type: 'Polygon' as const, coordinates: [r] },
      })),
    });
  }, [draftRings, buildHeight, status]);

  /* 완료 = 그린 조각들을 건물 하나로 확정 + 편집 종료 */
  const finishBuilding = () => {
    if (draftRings.length > 0) {
      const name = buildName.trim() || `건물 ${buildings.length + 1}`;
      setBuildings((prev) => [...prev, { id: makeBuildingId(), name, rings: draftRings, height: buildHeight }]);
      setBuildName('');
    }
    setDraftRings([]);
    setDraftRedo([]);
    setBuildMode(false);
  };

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
  /* 시뮬 재생: 1초 = 1스텝. 마지막 스텝 도달 시 자동 정지. 기간 상관없이 총 30초에 완료 */
  useEffect(() => {
    if (!simPlaying) return;
    const id = setInterval(() => {
      setSimCurrentStep((s) => {
        const next = s + 1;
        if (next >= SIM_TOTAL_STEPS - 1) {
          setSimPlaying(false);
          return SIM_TOTAL_STEPS - 1;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [simPlaying]);
  /* 시뮬 모드 진입 or 기간 변경 시 재생 위치 초기화 */
  useEffect(() => {
    setSimCurrentStep(0);
    setSimPlaying(false);
  }, [simOn, simDays]);
  /* 시뮬 대상 선택 동기화 — 진입 시 전체 선택, 새 건물은 자동 포함, 삭제된 건물은 제거 */
  useEffect(() => {
    if (!simOn) return;
    setSimSelected((prev) => {
      const validIds = new Set(buildings.map((b) => b.id));
      const next = new Set<string>();
      // 첫 진입(prev 비어 있음)이면 전체 선택
      if (prev.size === 0) {
        for (const b of buildings) next.add(b.id);
        return next;
      }
      // 기존에 선택된 것 중 아직 존재하는 것만 유지 + 새 건물 자동 포함
      for (const id of prev) if (validIds.has(id)) next.add(id);
      for (const b of buildings) if (!prev.has(b.id)) next.add(b.id);
      return next;
    });
  }, [simOn, buildings]);
  /* buildings 배열 → ref 동기화 (지도 클릭 핸들러가 최신 목록 참조) */
  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);
  /* 선택 건물이 바뀌면 크기 배율 100%로 리셋 + 기준 링 캡처 (배율 누적 방지) */
  useEffect(() => {
    setSizePct(100);
    sizeBaseRef.current = selectedUserBldg
      ? { id: selectedUserBldg.id, rings: selectedUserBldg.rings }
      : null;
    // id만 의존 — 스케일 중 rings가 바뀌어도 기준은 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserBldg?.id]);
  /* 4단계를 벗어나면 건물 세우기 모드·상세 카드 자동 해제 */
  useEffect(() => {
    if (depth !== 'dong') {
      setBuildMode(false);
      setSelectedUserBldg(null);
      setSimOn(false);
      setDraftRings([]);
      setDraftRedo([]);
    }
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

  /* 세운 건물로 이동 + 상세 선택 (발전소 이동과 동일한 카메라) */
  const goToBuilding = (b: UserBuilding) => {
    const [lng, lat] = buildingCenter(b.rings);
    setSelectedUserBldg(b);
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 17,
      pitch: 60,
      bearing: -20,
      duration: 1800,
      essential: true,
    });
  };
  /* 건물 속성 수정 (이름·높이) — id로 찾아 갱신, 상세 카드도 동기화 */
  const updateBuilding = (id: string, patch: Partial<UserBuilding>) => {
    setBuildings((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setSelectedUserBldg((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
  };
  /* 건물 삭제 */
  const deleteBuilding = (id: string) => {
    setBuildings((prev) => prev.filter((b) => b.id !== id));
    setSelectedUserBldg((cur) => (cur && cur.id === id ? null : cur));
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
                  // 두 겹의 그림자 (red-500 톤) — 은은한 붉은 발광
                  boxShadow:
                    'inset 0 0 200px 80px rgba(239, 68, 68, 0.32), inset 0 0 90px 30px rgba(239, 68, 68, 0.18)',
                  animation: 'terrawatt-alert-glow 2s ease-in-out infinite',
                }}
              />
              <style>{`@keyframes terrawatt-alert-glow {
                0%, 100% { opacity: 0.75; }
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
            ) : selectedUserBldg ? (
              /* 세운 건물 상세 — 수정(이름·높이) + 삭제 */
              (() => {
                const b = selectedUserBldg;
                const area = buildingArea(b.rings);
                const [cx, cy] = buildingCenter(b.rings);
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedUserBldg(null)}
                      className="mb-3 flex items-center gap-1 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
                    >
                      ← 목록으로
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-sm border-2 border-white bg-sky-500 shadow-[0_0_10px_2px_#38bdf899]" />
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                        내가 세운 건물
                      </div>
                    </div>
                    {/* 이름 수정 */}
                    <input
                      type="text"
                      value={b.name}
                      onChange={(e) => updateBuilding(b.id, { name: e.target.value })}
                      className="mt-1.5 w-full rounded bg-white/10 px-2 py-1.5 text-base font-bold text-white outline-none focus:bg-white/15"
                    />
                    <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
                      <div className="text-slate-400">🏢 바닥면적</div>
                      <div className="text-right font-mono text-white">{area.toFixed(0)} m²</div>
                      <div className="text-slate-400">📦 체적</div>
                      <div className="text-right font-mono text-white">{(area * b.height).toFixed(0)} m³</div>
                      <div className="text-slate-400">🧭 좌표</div>
                      <div className="text-right font-mono text-[10px] text-slate-300">
                        {cy.toFixed(4)}, {cx.toFixed(4)}
                      </div>
                    </div>
                    {/* 크기 수정 — 중심 기준 확대/축소 (기준 링에 배율 적용) */}
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-400">↔ 크기 수정</span>
                        <span className="font-mono text-sky-300">{sizePct}%</span>
                      </div>
                      <Slider
                        min={30}
                        max={300}
                        step={5}
                        value={[sizePct]}
                        onValueChange={(v) => {
                          const pct = v[0];
                          setSizePct(pct);
                          const base = sizeBaseRef.current;
                          if (base && base.id === b.id) {
                            updateBuilding(b.id, { rings: scaleRings(base.rings, pct / 100) });
                          }
                        }}
                      />
                    </div>
                    {/* 높이 수정 */}
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-400">📐 높이 수정</span>
                        <span className="font-mono text-sky-300">{b.height}m</span>
                      </div>
                      <Slider
                        min={10}
                        max={100}
                        step={5}
                        value={[b.height]}
                        onValueChange={(v) => updateBuilding(b.id, { height: v[0] })}
                      />
                    </div>
                    {/* 옥상 태양광 잠재량 — 패널 규격 근거까지 노출 */}
                    {(() => {
                      const rs = roofSolar(area, sunAltDeg);
                      return (
                        <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/5 p-2.5 text-xs">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="font-bold text-amber-300">☀ 옥상 태양광</span>
                            <span className="font-mono font-bold text-amber-200">
                              {rs.powerKw.toFixed(0)} kW
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-y-0.5 text-[11px]">
                            <span className="text-slate-400">패널</span>
                            <span className="text-right font-mono text-slate-200">{rs.panels}장</span>
                            <span className="text-slate-400">설치 용량</span>
                            <span className="text-right font-mono text-slate-200">{rs.capacityKwp.toFixed(1)} kWp</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => goToBuilding(b)}
                        className="flex-1 rounded-md bg-blue-600 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        🎯 이동
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBuilding(b.id)}
                        className="flex-1 rounded-md bg-red-500/80 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
                      >
                        🗑 삭제
                      </button>
                    </div>
                  </div>
                );
              })()
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

                {/* 건물 세우기 — 4단계에서만. 발전소 바로가기 바로 아래(건물 관리와 같은 패널) */}
                {depth === 'dong' && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    {!buildMode ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSimOn(false); // 그릴 땐 색 초기화(하늘색)
                          setDraftRings([]); // 새 편집 세션 시작
                          setDraftRedo([]);
                          setBuildMode(true);
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-sky-400"
                      >
                        🏗 건물 세우기
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2 text-[12px] text-slate-200">
                        {/* 편집 중 헤더 — 완료 버튼으로 모드에서 빠져나감 */}
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-sky-300">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                            건물 세우는 중
                          </span>
                          <button
                            type="button"
                            onClick={finishBuilding}
                            disabled={draftRings.length === 0}
                            className="rounded bg-sky-500 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400"
                          >
                            ✓ 완료
                          </button>
                        </div>
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
                          <span className="text-slate-400">여러 조각을 그린 뒤 ✓완료 = 건물 하나로 확정</span>
                          <br />
                          <span className="text-slate-500">(모드 중 지도 이동 잠김 — 스크롤 줌은 가능)</span>
                        </div>
                        {/* 이름 입력 — 비면 "건물 N" 자동 */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-slate-400">이름 (비우면 자동)</span>
                          <input
                            type="text"
                            value={buildName}
                            onChange={(e) => setBuildName(e.target.value)}
                            placeholder={`건물 ${buildings.length + 1}`}
                            className="rounded bg-white/10 px-2 py-1 text-[12px] text-white placeholder-slate-500 outline-none focus:bg-white/15"
                          />
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
                        {(draftRings.length > 0 || draftRedo.length > 0) && (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-400">
                              {draftRings.length}조각 그림
                              {draftRedo.length > 0 && (
                                <span className="ml-1 text-slate-500">· 되돌린 {draftRedo.length}</span>
                              )}
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={draftRings.length === 0}
                                onClick={() => {
                                  setDraftRings((prev) => {
                                    if (prev.length === 0) return prev;
                                    setDraftRedo((r) => [...r, prev[prev.length - 1]]);
                                    return prev.slice(0, -1);
                                  });
                                }}
                                title="뒤로 (마지막 조각 취소)"
                                className="flex h-6 w-6 items-center justify-center rounded bg-white/10 text-sm transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                ↩
                              </button>
                              <button
                                type="button"
                                disabled={draftRedo.length === 0}
                                onClick={() => {
                                  setDraftRedo((r) => {
                                    if (r.length === 0) return r;
                                    setDraftRings((prev) => [...prev, r[r.length - 1]]);
                                    return r.slice(0, -1);
                                  });
                                }}
                                title="앞으로 (되돌린 조각 되살리기)"
                                className="flex h-6 w-6 items-center justify-center rounded bg-white/10 text-sm transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                ↪
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDraftRings([]);
                                  setDraftRedo([]);
                                }}
                                title="그린 조각 전부 지우기"
                                className="flex h-6 w-6 items-center justify-center rounded bg-white/10 text-sm transition-colors hover:bg-white/20"
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 내가 세운 건물 — 시뮬레이션 재생 통합 (기간 = 오늘부터 N일) */}
                {buildings.length > 0 && (() => {
                  const pad = (n: number) => String(n).padStart(2, '0');
                  // 스텝 → 실제 시각. 스텝 크기 = (일수 × 24) / 총 스텝 시간
                  const stepHours = (simDays * 24) / SIM_TOTAL_STEPS;
                  const now = new Date();
                  const stepDate = (step: number) => new Date(now.getTime() + step * stepHours * 3600_000);
                  const currentDate = stepDate(simCurrentStep);
                  const endDate = stepDate(SIM_TOTAL_STEPS - 1);
                  const atStart = simCurrentStep === 0;
                  const atEnd = simCurrentStep >= SIM_TOTAL_STEPS - 1;
                  // 표시: 짧은 기간(≤3일)은 시각까지, 긴 기간은 날짜만
                  const fmtDate = (d: Date) =>
                    simDays <= 3
                      ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}시`
                      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  // 건물별 순간 kW (현재 스텝) + 누적 kWh (0~현재 스텝의 kW×stepHours 합)
                  const perBuilding = simOn
                    ? buildings.map((b) => {
                        const area = buildingArea(b.rings);
                        const altNow = SunCalc.getPosition(currentDate, SUN_REF.lat, SUN_REF.lng).altitude;
                        const kwNow = roofSolarKw(area, altNow);
                        let kwhSoFar = 0;
                        for (let i = 0; i <= simCurrentStep; i++) {
                          const alt = SunCalc.getPosition(stepDate(i), SUN_REF.lat, SUN_REF.lng).altitude;
                          kwhSoFar += roofSolarKw(area, alt) * stepHours;
                        }
                        return { id: b.id, name: b.name, area, kwNow, kwhSoFar, selected: simSelected.has(b.id) };
                      })
                    : [];
                  const selectedRows = perBuilding.filter((r) => r.selected);
                  const totalKwhSoFar = selectedRows.reduce((s, r) => s + r.kwhSoFar, 0);
                  const totalKwNow = selectedRows.reduce((s, r) => s + r.kwNow, 0);
                  const allSelected = simSelected.size === buildings.length && buildings.length > 0;
                  const toggleAll = () => {
                    if (allSelected) setSimSelected(new Set());
                    else setSimSelected(new Set(buildings.map((b) => b.id)));
                  };
                  const toggleOne = (id: string) => {
                    setSimSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  };

                  return (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">
                          🏗 내가 세운 건물 <span className="text-slate-500">{buildings.length}동</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSimOn((v) => !v)}
                          className={`rounded px-2 py-0.5 text-[11px] font-bold transition-colors ${
                            simOn
                              ? 'bg-white/10 text-slate-300 hover:bg-white/20'
                              : 'bg-amber-500 text-white hover:bg-amber-400'
                          }`}
                          title={simOn ? '시뮬레이션 모드 종료' : '옥상 태양광 시뮬레이션 열기'}
                        >
                          {simOn ? '× 시뮬 닫기' : '☀ 시뮬레이션'}
                        </button>
                      </div>

                      {/* 시뮬 모드 UI (대상 선택 → 시간대 → 재생 컨트롤 → 진행 바) */}
                      {simOn && (
                        <div className="mb-2 rounded-lg border border-amber-400/30 bg-amber-500/5 p-2.5">
                          {/* 시뮬 대상 선택 상태 + 전체 토글 */}
                          <div className="mb-2 flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">
                              시뮬 대상 <span className="font-mono text-amber-300">{simSelected.size}/{buildings.length}</span> 선택
                            </span>
                            <button
                              type="button"
                              onClick={toggleAll}
                              disabled={simPlaying}
                              className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-200 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {allSelected ? '전체 해제' : '전체 선택'}
                            </button>
                          </div>
                          {/* 기간 프리셋 + 커스텀 슬라이더 — 재생 중엔 잠금 */}
                          <div className="mb-2">
                            <div className="mb-1 flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">기간</span>
                              <span className="font-mono text-amber-300">
                                오늘 ~ {fmtDate(endDate)} · {simDays}일
                              </span>
                            </div>
                            <div className="mb-1.5 flex flex-wrap gap-1">
                              {SIM_DAY_PRESETS.map((p) => (
                                <button
                                  key={p.days}
                                  type="button"
                                  onClick={() => setSimDays(p.days)}
                                  disabled={simPlaying}
                                  className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    simDays === p.days
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <Slider
                              min={1}
                              max={90}
                              step={1}
                              value={[simDays]}
                              disabled={simPlaying}
                              onValueChange={(v) => setSimDays(v[0])}
                            />
                            <div className="flex justify-between text-[9px] text-slate-500">
                              <span>1일</span>
                              <span>45일</span>
                              <span>90일</span>
                            </div>
                          </div>

                          {/* 재생 컨트롤 + 현재 날짜/시각 */}
                          <div className="mb-1.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (atEnd) setSimCurrentStep(0);
                                setSimPlaying(true);
                              }}
                              disabled={simPlaying}
                              title={atEnd ? '처음부터 다시 재생' : '재생'}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                            >
                              ▶
                            </button>
                            <button
                              type="button"
                              onClick={() => setSimPlaying(false)}
                              disabled={!simPlaying}
                              title="일시정지"
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                            >
                              ⏸
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSimPlaying(false);
                                setSimCurrentStep(0);
                              }}
                              disabled={atStart && !simPlaying}
                              title="처음으로"
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-600 text-white transition-colors hover:bg-slate-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                            >
                              ⏮
                            </button>
                            <div className="ml-auto text-right">
                              <div className="font-mono text-sm font-bold leading-tight text-amber-300">
                                {fmtDate(currentDate)}
                              </div>
                              <div className="text-[9px] text-slate-500">
                                {simPlaying
                                  ? `● 재생 중 (${simDays}일을 30초에)`
                                  : atEnd
                                  ? '완료'
                                  : atStart
                                  ? '대기 중'
                                  : '일시정지'}
                              </div>
                            </div>
                          </div>

                          {/* 진행 바 */}
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                              style={{
                                width: `${(simCurrentStep / (SIM_TOTAL_STEPS - 1)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 건물 리스트 — 시뮬 ON이면 행 앞에 체크박스, 미선택은 회색 처리 */}
                      <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                        {buildings.map((b) => {
                          const row = perBuilding.find((r) => r.id === b.id);
                          const isSelected = simOn ? simSelected.has(b.id) : false;
                          return (
                            <div
                              key={b.id}
                              className={`flex items-center gap-2 rounded-md pl-1 pr-2 py-1.5 text-sm transition-colors ${
                                simOn && !isSelected ? 'opacity-40' : ''
                              }`}
                            >
                              {/* 시뮬 ON일 때만 체크박스 — 재생 중엔 잠금 */}
                              {simOn && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={simPlaying}
                                  onChange={() => toggleOne(b.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  title={isSelected ? '시뮬 대상에서 제외' : '시뮬 대상에 포함'}
                                  className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-amber-500 disabled:cursor-not-allowed"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => goToBuilding(b)}
                                className="flex flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-white transition-colors hover:bg-white/10"
                              >
                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-white bg-sky-500" />
                                <span className="flex flex-1 flex-col overflow-hidden">
                                  <span className="truncate font-semibold text-[13px]">{b.name}</span>
                                  <span className="text-[10px] text-slate-400">
                                    {buildingArea(b.rings).toFixed(0)}㎡ · {b.rings.length}조각 · 높이 {b.height}m
                                  </span>
                                </span>
                                {simOn && row && isSelected ? (
                                  <span className="flex shrink-0 flex-col items-end">
                                    <span className="font-mono text-[11px] font-bold text-amber-300">
                                      {row.kwNow.toFixed(0)} kW
                                    </span>
                                    <span className="font-mono text-[9px] text-slate-400">
                                      누적 {row.kwhSoFar.toFixed(0)} kWh
                                    </span>
                                  </span>
                                ) : simOn ? (
                                  <span className="text-[10px] text-slate-500">제외</span>
                                ) : (
                                  <span className="text-[10px] text-slate-500">›</span>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* 📊 시뮬레이션 결과 — 상태별 강조: 대기 / 재생 중 / 완료 */}
                      {simOn && (() => {
                        // 완료 시 일평균 계산 (누적 발전량 ÷ 시뮬 일수)
                        const daysElapsed = ((simCurrentStep + 1) / SIM_TOTAL_STEPS) * simDays;
                        const avgPerDay = daysElapsed > 0 ? totalKwhSoFar / daysElapsed : 0;
                        // 순위 (누적 kWh 큰 순, 상위 3)
                        const ranked = [...selectedRows].sort((a, z) => z.kwhSoFar - a.kwhSoFar);
                        const rankMedal = ['🥇', '🥈', '🥉'];
                        return (
                          <div
                            className={`mt-2 rounded-lg border p-3 transition-colors ${
                              atEnd
                                ? 'border-amber-400/70 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                                : simPlaying
                                ? 'border-amber-400/40 bg-black/40'
                                : 'border-white/10 bg-black/30'
                            }`}
                          >
                            {/* 결과 카드 헤더 — 상태 배지 포함 */}
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                                📊 시뮬레이션 결과
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  atEnd
                                    ? 'bg-emerald-500 text-white'
                                    : simPlaying
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-white/10 text-slate-400'
                                }`}
                              >
                                {atEnd ? '✓ 완료' : simPlaying ? '● 재생 중' : '⏸ 대기'}
                              </span>
                            </div>

                            {/* 대기 상태 (아직 재생 안 함) → 안내 */}
                            {atStart && !simPlaying ? (
                              <div className="py-2 text-center text-[11px] text-slate-400">
                                ▶ 재생 버튼을 눌러 시뮬레이션을 시작하세요
                                <br />
                                <span className="text-slate-500">
                                  {selectedRows.length}동 · {simDays}일 · 30초 재생
                                </span>
                              </div>
                            ) : (
                              <>
                                {/* 큰 숫자: 완료 시 총 발전량, 재생 중이면 지금까지 */}
                                <div className="text-center">
                                  <div className="font-mono text-2xl font-extrabold leading-tight text-amber-300">
                                    {totalKwhSoFar.toFixed(0)}{' '}
                                    <span className="text-sm text-slate-400">kWh</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {atEnd
                                      ? `${simDays}일간 총 발전량 · ${selectedRows.length}동 합계`
                                      : `지금까지 누적 · ${selectedRows.length}동`}
                                  </div>
                                </div>

                                {/* 보조 지표 2줄 */}
                                <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px]">
                                  <div className="rounded bg-black/30 p-1.5">
                                    <div className="font-mono text-sm font-bold text-white">
                                      {avgPerDay.toFixed(0)}
                                    </div>
                                    <div className="text-[9px] text-slate-500">kWh/일 평균</div>
                                  </div>
                                  <div className="rounded bg-black/30 p-1.5">
                                    <div className="font-mono text-sm font-bold text-white">
                                      {totalKwNow.toFixed(0)}
                                    </div>
                                    <div className="text-[9px] text-slate-500">
                                      {atEnd ? '완료 시각 kW' : '현재 kW'}
                                    </div>
                                  </div>
                                </div>

                                {/* Top 3 건물 순위 (건물 2개 이상 선택 시) */}
                                {ranked.length >= 2 && (
                                  <div className="mt-2 border-t border-white/10 pt-2">
                                    <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">
                                      건물별 순위
                                    </div>
                                    <div className="flex flex-col gap-0.5 text-[11px]">
                                      {ranked.slice(0, 3).map((r, i) => (
                                        <div
                                          key={r.id}
                                          className="flex items-center justify-between gap-2"
                                        >
                                          <span className="truncate text-slate-300">
                                            {rankMedal[i]} {r.name}
                                          </span>
                                          <span className="shrink-0 font-mono text-amber-200">
                                            {r.kwhSoFar.toFixed(0)} kWh
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
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
