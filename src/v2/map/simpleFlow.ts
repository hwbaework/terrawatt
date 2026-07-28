import mapboxgl from 'mapbox-gl';
import { PLANT_READINGS } from '../data/specs';
import { GRID_ROUTE, GRID_ROUTE_COMPANY } from '../data/gridRoute';
import { SUBSTATIONS } from '../data/substations';

/* 발전소 분포 (더미) — 전부 태양광 발전소. 지도 위 동그라미 뱃지 노드만.
   ※ 연결(연계)은 나중에 → 지금은 선/흐름 없음, 발전소 노드만.
   노드 클릭 → 3단계 진입(onEnter). */

/* 좌표 = energy-frontend LASEE 실측 매핑(plant-mapping.ts) 이관.
   laseeId로 실시간 발전 데이터(livePlants)와 연결된다.
   sido/gu = 행정구역 클러스터링용(시도 묶음 → 구·군 묶음 → 낱개).
   한일튜브만 사용자가 위성 대조로 맞춘 건물 좌표 사용(LASEE값과 약 140m 차이). */
export const PLANTS = [
  { laseeId: 17511, name: '용인금속1', lng: 129.347216, lat: 35.515211, sido: '울산', gu: '남구' },
  { laseeId: 17558, name: '용인금속2', lng: 129.3492, lat: 35.5168, sido: '울산', gu: '남구' },
  { laseeId: 17512, name: '태성산업', lng: 129.3458, lat: 35.5135, sido: '울산', gu: '남구' },
  { laseeId: 17514, name: '한일튜브', lng: 129.33079, lat: 35.50515, sido: '울산', gu: '남구' }, // 3D 건물(hanil-tube)과 일치 — 부곡동 273-6
  // 건호이엔씨: LASEE 좌표가 한일튜브와 겹침(오류) → 실주소(남구 용잠로74번길 48) 지오코딩으로 정정
  { laseeId: 17513, name: '건호이엔씨', lng: 129.343, lat: 35.4965, sido: '울산', gu: '남구' },
  { laseeId: 17515, name: '한길', lng: 129.360551, lat: 35.475747, sido: '울산', gu: '울주군' },
];

/* 가상 기업(수용가) — 발전소가 전력을 공급하는 대상 (더미) */
const COMPANY = { name: '가상 기업', lng: 129.3485, lat: 35.5045, sido: '울산', gu: '남구' };

/* 변전소 목록·좌표·동별 담당 매핑은 data/substations.ts (한전 공급 데이터 + OSM 기반) */

/* PPA 공급 흐름 = 한일튜브 → 울산변전소 → 가상 기업.
   전기는 직결이 아니라 한전망(변전소)을 경유해 흐른다 — 기본 개념.
   경로 = 도로 근사 2구간을 이어붙임 (한일튜브→변전소는 GRID_ROUTE 역방향) */
const SUPPLY_PATH: [number, number][] = [
  ...[...GRID_ROUTE].reverse(),
  ...GRID_ROUTE_COMPANY.slice(1),
];

let markers: mapboxgl.Marker[] = [];
let clusterMarkers: mapboxgl.Marker[] = [];
let substationMarkers: mapboxgl.Marker[] = []; // 변전소들 — 확대 시에만 표시(인프라)
let zoomHandler: (() => void) | null = null;
let mapRef: mapboxgl.Map | null = null;
let raf = 0;

/* ── 내 건물 PPA 공급 경로 (발전소 → 변전소 → 내 건물) — 버튼으로 확인하는 단계 ── */
let ppaPath: [number, number][] | null = null;
let ppaCum: number[] = [];
let ppaSplitT = 0; // 변전소 통과 지점 (점 색 전환)

const mDist = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * 90630, (a[1] - b[1]) * 110574);

/* OSRM 도로 경로 (배전선은 도로변 전주를 따름) — 실패하면 직선 폴백 */
async function roadLeg(a: [number, number], b: [number, number]): Promise<[number, number][]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.join(',')};${b.join(',')}?overview=full&geometries=geojson`;
    const r = await fetch(url).then((x) => x.json());
    const pts = r.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (!pts || pts.length < 2) return [a, b];
    if (mDist(pts[0], a) > 10) pts.unshift(a);
    if (mDist(pts[pts.length - 1], b) > 10) pts.push(b);
    return pts;
  } catch {
    return [a, b];
  }
}

/** 발전소 → 담당 변전소 → 내 건물 공급 경로를 그린다 (도로 근사, 흐름점 애니메이션 포함).
    via = 내 건물의 담당 변전소 좌표 (한전 동별 표로 정한 곳) */
export async function showPpaRoute(
  plant: [number, number],
  building: [number, number],
  via: [number, number],
): Promise<void> {
  const map = mapRef;
  if (!map || !map.getSource('ppa-line')) return;
  const [leg1, leg2] = await Promise.all([roadLeg(plant, via), roadLeg(via, building)]);
  (map.getSource('ppa-line') as mapboxgl.GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { color: '#f97316' }, geometry: { type: 'LineString', coordinates: leg1 } },
      { type: 'Feature', properties: { color: '#0d9488' }, geometry: { type: 'LineString', coordinates: leg2 } },
    ],
  });
  ppaPath = [...leg1, ...leg2.slice(1)];
  ppaCum = [0];
  for (let i = 1; i < ppaPath.length; i++) ppaCum.push(ppaCum[i - 1] + mDist(ppaPath[i - 1], ppaPath[i]));
  const total = ppaCum[ppaCum.length - 1] || 1;
  ppaSplitT = ppaCum[leg1.length - 1] / total;
}

/** PPA 공급 경로 지우기 */
export function clearPpaRoute(): void {
  ppaPath = null;
  const map = mapRef;
  if (!map) return;
  (map.getSource('ppa-line') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
  (map.getSource('ppa-dots') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
}
/* 계측값(현재 발전량 등)은 실데이터 연동 시 붙인다. 마커에는 고정 정보(이름·설비 용량)만. */

/* 행정구역 다단계 클러스터링 — 나라에선 시도 묶음, 시도를 클릭해 들어가면 구·군별 동그라미,
   더 확대하면 낱개. z<9: 시도 / 9≤z<12.5: 구·군 / z≥12.5: 낱개 */
type ClusterBand = 'sido' | 'gu' | 'none';
function bandForZoom(z: number): ClusterBand {
  if (z < 9) return 'sido';
  if (z < 12.5) return 'gu';
  return 'none';
}

/* onEnter: 발전소 원 클릭 시 3단계 진입 / onInfo: 칩(글자) 클릭 시 정보 카드 */
export function addSimpleFlow(
  map: mapboxgl.Map,
  onEnter?: (name: string, lngLat: [number, number]) => void,
  onInfo?: (laseeId: number, name: string) => void,
): void {
  if (markers.length) return;
  stopSimpleFlow();
  injectStyle();

  // 배전망 회랑(청록) + PPA 공급 흐름점(주황) — 한일튜브 → 변전소 → 가상기업
  if (!map.getSource('grid-line')) {
    // 물리 선로 회랑: 변전소↔한일튜브 + 변전소↔가상기업 (청록 = 한전망, 태양광 주황과 구분)
    // 구간별 색: 한일튜브↔변전소 = 주황(태양광 전력) / 변전소→가상기업 = 청록(한전망)
    map.addSource('grid-line', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { color: '#f97316' }, geometry: { type: 'LineString', coordinates: GRID_ROUTE } },
          { type: 'Feature', properties: { color: '#0d9488' }, geometry: { type: 'LineString', coordinates: GRID_ROUTE_COMPANY } },
        ],
      },
    });
    // 흰 테두리(케이싱) 위에 청록 본선 — 위성·복잡한 배경에서도 선이 또렷하게
    map.addLayer({ id: 'grid-line-casing', type: 'line', source: 'grid-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.55 } });
    map.addLayer({ id: 'grid-line-layer', type: 'line', source: 'grid-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.85 } });
    // 에너지 흐름점(주황 = 태양광 전력): 한일튜브 → 변전소 → 가상기업 전 구간
    map.addSource('grid-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'grid-dots-glow', type: 'circle', source: 'grid-dots', paint: { 'circle-radius': 10, 'circle-color': ['get', 'glow'], 'circle-opacity': 0.3, 'circle-blur': 1.2 } });
    map.addLayer({ id: 'grid-dots-core', type: 'circle', source: 'grid-dots', paint: { 'circle-radius': 3.5, 'circle-color': ['get', 'core'], 'circle-opacity': 1 } });

    // 내 건물 PPA 공급 경로 (발전소 → 변전소 → 내 건물) — showPpaRoute()가 채움
    map.addSource('ppa-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'ppa-line-casing', type: 'line', source: 'ppa-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.55 } });
    map.addLayer({ id: 'ppa-line-layer', type: 'line', source: 'ppa-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.85 } });
    map.addSource('ppa-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'ppa-dots-glow', type: 'circle', source: 'ppa-dots', paint: { 'circle-radius': 10, 'circle-color': ['get', 'glow'], 'circle-opacity': 0.3, 'circle-blur': 1.2 } });
    map.addLayer({ id: 'ppa-dots-core', type: 'circle', source: 'ppa-dots', paint: { 'circle-radius': 3.5, 'circle-color': ['get', 'core'], 'circle-opacity': 1 } });

    // 다구간 경로에서 진행률 t(0~1) → 좌표 (누적거리 기반 보간)
    const gm = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 90630, (a[1] - b[1]) * 110574);
    const cum: number[] = [0];
    for (let i = 1; i < SUPPLY_PATH.length; i++) cum.push(cum[i - 1] + gm(SUPPLY_PATH[i - 1], SUPPLY_PATH[i]));
    const routeLen = cum[cum.length - 1];
    const routeAt = (t: number): [number, number] => {
      const d = t * routeLen;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const a = SUPPLY_PATH[i - 1];
      const b = SUPPLY_PATH[i];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };

    // 구간 경계: 앞부분(한일튜브→변전소)이 전체에서 차지하는 비율 — 점 색 전환 지점
    const splitT = cum[GRID_ROUTE.length - 1] / routeLen;

    const GN = 7; // 전체 경로 약 3.6km — 점 7개
    let phase = 0;
    const frame = () => {
      phase = (phase + 0.0016) % 1; // 흐름 속도 — 낮출수록 느리게 (사용자 조정 2026-07-23)
      const gfeats: GeoJSON.Feature[] = [];
      for (let k = 0; k < GN; k++) {
        const frac = (phase + k / GN) % 1;
        // 점 색 = 지나는 구간 색 (주황 → 변전소 지나면 청록)
        const seg = frac < splitT
          ? { core: '#f97316', glow: '#fb923c' }
          : { core: '#0d9488', glow: '#2dd4bf' };
        gfeats.push({ type: 'Feature', properties: seg, geometry: { type: 'Point', coordinates: routeAt(frac) } });
      }
      (map.getSource('grid-dots') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: gfeats });
      // 내 건물 PPA 경로 점 — 경로가 설정돼 있을 때만
      if (ppaPath && ppaCum.length > 1) {
        const total = ppaCum[ppaCum.length - 1] || 1;
        const pAt = (t: number): [number, number] => {
          const d = t * total;
          let i = 1;
          while (i < ppaCum.length - 1 && ppaCum[i] < d) i++;
          const f = (d - ppaCum[i - 1]) / (ppaCum[i] - ppaCum[i - 1] || 1);
          const a = ppaPath![i - 1];
          const b = ppaPath![i];
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        };
        const pfeats: GeoJSON.Feature[] = [];
        for (let k = 0; k < GN; k++) {
          const frac = (phase + k / GN) % 1;
          const seg = frac < ppaSplitT
            ? { core: '#f97316', glow: '#fb923c' }
            : { core: '#0d9488', glow: '#2dd4bf' };
          pfeats.push({ type: 'Feature', properties: seg, geometry: { type: 'Point', coordinates: pAt(frac) } });
        }
        (map.getSource('ppa-dots') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: pfeats });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // 발전소 노드 (전부 태양광, 주황). 원 클릭 → 3단계 진입, 칩 클릭 → 정보 카드
  markers = PLANTS.map((p) => {
    const r = PLANT_READINGS[p.laseeId];
    const el = nodeEl({
      color: '#ea580c',
      icon: SOLAR_SVG,
      name: p.name,
      sub: r ? `${r.currentOutputKw}kW` : undefined,
      onClick: () => onEnter?.(p.name, [p.lng, p.lat]),
      onChipClick: () => onInfo?.(p.laseeId, p.name),
    });
    return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
  });

  // 가상 기업(수용가) 노드 — 파랑 건물. 발전소가 전력 공급하는 대상
  const companyEl = nodeEl({
    color: '#6366f1',
    icon: COMPANY_SVG,
    name: COMPANY.name,
    onClick: () => onEnter?.(COMPANY.name, [COMPANY.lng, COMPANY.lat]),
  });
  markers.push(new mapboxgl.Marker({ element: companyEl, anchor: 'center' }).setLngLat([COMPANY.lng, COMPANY.lat]).addTo(map));

  // 변전소 노드들 — 청록 플러그(한전망 색). 배전용 전부 표시(어느 건물이든 담당 변전소가 보이도록).
  // 인프라라 나라뷰에선 숨기고 확대(z≥12.5)시에만 표시
  substationMarkers = SUBSTATIONS.map((s) => {
    const el = nodeEl({ color: '#0d9488', icon: POWER_SVG, name: s.name });
    return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map);
  });

  // 행정구역 클러스터 — 발전소·기업만 집계 (변전소는 인프라라 제외)
  // ※ pts 순서는 markers 순서와 반드시 일치해야 함 (인덱스로 표시/숨김 제어)
  const pts = [
    ...PLANTS.map((p) => ({ ...p, kind: 'plant' as const })),
    { ...COMPANY, kind: 'company' as const },
  ];
  let curBand: ClusterBand | null = null;
  let singleVisible = new Set<number>(pts.map((_, i) => i)); // 낱개로 보여줄 인덱스

  const rebuildClusters = (band: ClusterBand) => {
    clusterMarkers.forEach((m) => m.remove());
    clusterMarkers = [];
    singleVisible = new Set();
    if (band === 'none') {
      pts.forEach((_, i) => singleVisible.add(i));
      return;
    }
    // 시도 밴드면 "울산", 구 밴드면 "울산 남구"·"울산 울주군" 단위로 묶음
    const groups = new Map<string, number[]>();
    pts.forEach((p, i) => {
      const key = band === 'sido' ? p.sido : `${p.sido}|${p.gu}`;
      const arr = groups.get(key);
      if (arr) arr.push(i);
      else groups.set(key, [i]);
    });
    for (const [key, idxs] of groups) {
      const lng = idxs.reduce((a, i) => a + pts[i].lng, 0) / idxs.length;
      const lat = idxs.reduce((a, i) => a + pts[i].lat, 0) / idxs.length;
      const label = band === 'sido' ? key : key.split('|')[1];
      // 구성 요약: "발전소 6 · 기업 1" — 원 안 숫자는 발전소 수
      const plantN = idxs.filter((i) => pts[i].kind === 'plant').length;
      const companyN = idxs.filter((i) => pts[i].kind === 'company').length;
      const sub = [plantN > 0 ? `발전소 ${plantN}` : '', companyN > 0 ? `기업 ${companyN}` : '']
        .filter(Boolean)
        .join(' · ');
      const el = clusterEl(plantN > 0 ? plantN : idxs.length, label, sub, () => {
        // 클릭 → 다음 단계로 확대 (시도 → 구·군별 동그라미 → 낱개)
        map.flyTo({ center: [lng, lat], zoom: band === 'sido' ? 10.5 : 13.5, duration: 1200 });
      });
      clusterMarkers.push(
        new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map),
      );
    }
  };

  // 줌에 따라: 밴드별 클러스터 재구성 + 크기·상세도 조절
  mapRef = map;
  zoomHandler = () => {
    const z = map.getZoom();
    const band = bandForZoom(z);
    if (band !== curBand) {
      curBand = band;
      rebuildClusters(band);
    }
    const f = Math.min(1, Math.max(0, (z - 6.5) / (11 - 6.5)));
    // 가까이 갈수록 정보는 유지 — 건물 레벨(z≥15)에선 살짝만 줄여 건물을 가리지 않게
    const s = z >= 15 ? 0.85 : 0.4 + f * 0.6;
    const compact = z < 9;
    markers.forEach((mk, i) => {
      const el = mk.getElement();
      el.style.display = singleVisible.has(i) ? '' : 'none';
      const inner = el.querySelector<HTMLElement>('.sf-inner');
      if (inner) inner.style.transform = `scale(${s})`;
      el.classList.toggle('sf-compact', compact);
    });
    for (const mk of clusterMarkers) {
      const inner = mk.getElement().querySelector<HTMLElement>('.sf-inner');
      if (inner) inner.style.transform = `scale(${0.7 + f * 0.3})`;
    }
    // 변전소들 — 인프라라 광역에선 숨김, 낱개 밴드(z≥12.5)에서만 표시
    for (const mk of substationMarkers) {
      const el = mk.getElement();
      el.style.display = z >= 12.5 ? '' : 'none';
      const inner = el.querySelector<HTMLElement>('.sf-inner');
      if (inner) inner.style.transform = `scale(${s})`;
    }
  };
  map.on('zoom', zoomHandler);
  zoomHandler();
}

export function stopSimpleFlow(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (zoomHandler && mapRef) mapRef.off('zoom', zoomHandler);
  zoomHandler = null;
  mapRef = null;
  markers.forEach((m) => m.remove());
  markers = [];
  clusterMarkers.forEach((m) => m.remove());
  clusterMarkers = [];
  substationMarkers.forEach((m) => m.remove());
  substationMarkers = [];
  ppaPath = null;
}

/* ── 클러스터 묶음 뱃지 (원 안 = 발전소 수, 칩 = "발전소 N · 기업 M") ── */
function clusterEl(count: number, label: string, sub: string, onClick: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sf-node';
  el.innerHTML = `
    <div class="sf-inner">
      <div class="sf-ring" style="border-color:#ea580c"></div>
      <div class="sf-circle sf-cluster" style="border-color:#ea580c">
        <span class="material-symbols-outlined" style="font-size:17px;line-height:1;color:#ea580c">bolt</span><span class="sf-cluster-count">${count}</span>
      </div>
      <div class="sf-chip">
        <span class="sf-chip-name" style="color:#ea580c">${label}</span>
        <span class="sf-chip-sub">${sub}</span>
      </div>
    </div>
  `;
  const circle = el.querySelector<HTMLElement>('.sf-circle');
  if (circle) {
    circle.style.cursor = 'pointer';
    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return el;
}

/* ── 동그라미 노드 — 아이콘 원 + 한 줄 칩(이름·실시간 출력) 2층 구조.
   원 클릭 = 3단계 진입(onClick), 칩(글자) 클릭 = 정보 카드(onChipClick) ── */
function nodeEl({
  color,
  icon,
  name,
  sub,
  onClick,
  onChipClick,
}: {
  color: string;
  icon: string;
  name: string;
  sub?: string;
  onClick?: () => void;
  onChipClick?: () => void;
}): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sf-node';
  el.innerHTML = `
    <div class="sf-inner">
      <div class="sf-ring" style="border-color:${color}"></div>
      <div class="sf-circle" style="border-color:${color}">${icon}</div>
      <div class="sf-chip" ${sub ? 'title="현재 발전량"' : ''}>
        <span class="sf-chip-name" style="color:${color}">${name}</span>
        ${sub ? `<span class="sf-chip-val">${sub}</span>` : ''}
      </div>
    </div>
  `;
  if (onClick) {
    const circle = el.querySelector<HTMLElement>('.sf-circle');
    if (circle) {
      circle.style.cursor = 'pointer';
      circle.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
    }
  }
  if (onChipClick) {
    const chip = el.querySelector<HTMLElement>('.sf-chip');
    if (chip) {
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        onChipClick();
      });
    }
  }
  return el;
}

/* 마커 원 안의 아이콘 — UI와 동일한 Material Symbols 체계 */
const SOLAR_SVG =
  '<span class="material-symbols-outlined" style="font-size:26px;line-height:1;color:#ea580c">solar_power</span>';
const COMPANY_SVG =
  '<span class="material-symbols-outlined" style="font-size:24px;line-height:1;color:#6366f1">factory</span>';
const POWER_SVG =
  '<span class="material-symbols-outlined" style="font-size:24px;line-height:1;color:#0d9488">power</span>';

function injectStyle(): void {
  if (document.getElementById('sf-style')) return;
  const s = document.createElement('style');
  s.id = 'sf-style';
  s.textContent = `
    .sf-node{position:relative;width:0;height:0;pointer-events:none;font-family:inherit;}
    .sf-inner{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .2s ease-out;}
    .sf-ring{position:absolute;left:-27px;top:-27px;width:54px;height:54px;border-radius:9999px;border:1px solid;opacity:.5;animation:sf-pulse 3s ease-out infinite;}
    .sf-circle{position:absolute;left:-24px;top:-24px;width:48px;height:48px;border-radius:9999px;background:#fff;border:2px solid;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:auto;transition:transform .15s;}
    .sf-circle:hover{transform:scale(1.12);}
    /* 한 줄 칩 — 이름 + 실시간 출력. 흰 배경판이라 위성사진 위에서도 읽힘 */
    .sf-chip{position:absolute;left:0;top:30px;transform:translateX(-50%);white-space:nowrap;display:flex;gap:7px;align-items:baseline;background:rgba(255,255,255,.96);padding:4px 12px;border-radius:9999px;box-shadow:0 1px 6px rgba(0,0,0,.35);pointer-events:auto;}
    .sf-chip-name{font-size:13px;font-weight:800;}
    .sf-chip-val{font-size:13px;font-weight:800;color:#1e293b;}
    .sf-chip-sub{font-size:12px;font-weight:600;color:#475569;}
    .sf-node.sf-compact .sf-chip{display:none;}
    .sf-circle.sf-cluster{width:58px;height:58px;left:-29px;top:-29px;border-width:2px;}
    .sf-cluster-count{font-size:17px;font-weight:800;color:#ea580c;letter-spacing:-0.02em;}
    @keyframes sf-pulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(1.5);opacity:0}100%{opacity:0}}
  `;
  document.head.appendChild(s);
}
