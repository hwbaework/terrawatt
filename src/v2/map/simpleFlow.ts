import mapboxgl from 'mapbox-gl';
import { PLANT_READINGS } from '../data/specs';

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

/* 예시 연결선 하나 — 발전소(용인금속1) → 기업. 발전소끼리는 연결 안 함 */
/* 예시 연결: 한일튜브(타겟 발전소) → 가상 기업(수용가) */
const LINK = { a: PLANTS.find((p) => p.laseeId === 17514) ?? PLANTS[0], b: COMPANY };

let markers: mapboxgl.Marker[] = [];
let clusterMarkers: mapboxgl.Marker[] = [];
let zoomHandler: (() => void) | null = null;
let mapRef: mapboxgl.Map | null = null;
let raf = 0;
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

  // 예시 연결선 하나 (용인금속1 → 한길) + 부드럽게 흐르는 점
  if (!map.getSource('sf-line')) {
    const line: [number, number][] = [
      [LINK.a.lng, LINK.a.lat],
      [LINK.b.lng, LINK.b.lat],
    ];
    map.addSource('sf-line', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } } });
    map.addLayer({ id: 'sf-line-layer', type: 'line', source: 'sf-line', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#f97316', 'line-width': 2.5, 'line-opacity': 0.5 } });
    map.addSource('sf-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sf-dots-glow', type: 'circle', source: 'sf-dots', paint: { 'circle-radius': 6, 'circle-color': '#fb923c', 'circle-opacity': 0.18, 'circle-blur': 1.5 } });
    map.addLayer({ id: 'sf-dots-core', type: 'circle', source: 'sf-dots', paint: { 'circle-radius': 2.2, 'circle-color': '#fdba74', 'circle-opacity': 0.95 } });
    const N = 4;
    let phase = 0;
    const frame = () => {
      phase = (phase + 0.0035) % 1;
      const feats: GeoJSON.Feature[] = [];
      for (let k = 0; k < N; k++) {
        const frac = (phase + k / N) % 1; // 끝점 사이 직접 보간 = 완전 연속
        feats.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [LINK.a.lng + (LINK.b.lng - LINK.a.lng) * frac, LINK.a.lat + (LINK.b.lat - LINK.a.lat) * frac] },
        });
      }
      (map.getSource('sf-dots') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: feats });
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

  // 행정구역 클러스터 — 줌 밴드가 바뀔 때마다 시도/구·군 단위로 묶음을 다시 만든다
  const pts = [...PLANTS, COMPANY];
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
      const el = clusterEl(idxs.length, label, () => {
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
}

/* ── 클러스터 묶음 뱃지 (개수 + 클릭하면 확대) ── */
function clusterEl(count: number, label: string, onClick: () => void): HTMLElement {
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
        <span class="sf-chip-sub">${count}곳</span>
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
