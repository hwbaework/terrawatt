import mapboxgl from 'mapbox-gl';

/* 발전소 분포 (더미) — 전부 태양광 발전소. 지도 위 동그라미 뱃지 노드만.
   ※ 연결(연계)은 나중에 → 지금은 선/흐름 없음, 발전소 노드만.
   노드 클릭 → 3단계 진입(onEnter). */

export const PLANTS = [
  { name: '용인금속1', lng: 129.34, lat: 35.499, mw: 280 },
  { name: '용인금속2', lng: 129.3435, lat: 35.5015, mw: 180 },
  { name: '태성산업', lng: 129.345, lat: 35.498, mw: 120 },
  { name: '한일튜브', lng: 129.336, lat: 35.5015, mw: 220 },
  { name: '건호이엔씨', lng: 129.344, lat: 35.4948, mw: 95 },
  { name: '한길', lng: 129.3355, lat: 35.4958, mw: 150 },
];

/* 가상 기업(수용가) — 발전소가 전력을 공급하는 대상 (더미) */
const COMPANY = { name: '가상 기업', lng: 129.3485, lat: 35.5045, mw: 0 };

/* 예시 연결선 하나 — 발전소(용인금속1) → 기업. 발전소끼리는 연결 안 함 */
const LINK = { a: PLANTS[0], b: COMPANY };

let markers: mapboxgl.Marker[] = [];
let zoomHandler: (() => void) | null = null;
let mapRef: mapboxgl.Map | null = null;
let raf = 0;

/* onEnter: 발전소(건물) 클릭 시 3단계 진입 트리거 */
export function addSimpleFlow(map: mapboxgl.Map, onEnter?: (name: string, lngLat: [number, number]) => void): void {
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

  // 발전소 노드 (전부 태양광, 주황). 클릭 → 3단계 진입
  markers = PLANTS.map((p) => {
    const el = nodeEl({
      color: '#ea580c',
      icon: SOLAR_SVG,
      name: p.name,
      region: '부곡 · 발전소',
      badge: `${p.mw} MW`,
      onClick: () => onEnter?.(p.name, [p.lng, p.lat]),
    });
    return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
  });

  // 가상 기업(수용가) 노드 — 파랑 건물. 발전소가 전력 공급하는 대상
  const companyEl = nodeEl({
    color: '#6366f1',
    icon: COMPANY_SVG,
    name: COMPANY.name,
    region: '수용가',
    onClick: () => onEnter?.(COMPANY.name, [COMPANY.lng, COMPANY.lat]),
  });
  markers.push(new mapboxgl.Marker({ element: companyEl, anchor: 'center' }).setLngLat([COMPANY.lng, COMPANY.lat]).addTo(map));

  // 줌에 따라 크기·상세도 조절 — 멀면 작게 + 뱃지·지역 숨김(아이콘만)
  mapRef = map;
  zoomHandler = () => {
    const z = map.getZoom();
    const f = Math.min(1, Math.max(0, (z - 6.5) / (11 - 6.5)));
    const s = 0.4 + f * 0.6;
    const compact = z < 9;
    for (const mk of markers) {
      const el = mk.getElement();
      const inner = el.querySelector<HTMLElement>('.sf-inner');
      if (inner) inner.style.transform = `scale(${s})`;
      el.classList.toggle('sf-compact', compact);
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
}

/* ── 동그라미 뱃지 노드 (클릭 가능) ── */
function nodeEl({ color, icon, name, region, badge, onClick }: { color: string; icon: string; name: string; region: string; badge?: string; onClick?: () => void }): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sf-node';
  el.innerHTML = `
    <div class="sf-inner">
      ${badge ? `<div class="sf-badge" style="color:${color};background:${color}1f;border-color:${color}55">${badge}</div>` : ''}
      <div class="sf-ring" style="border-color:${color}"></div>
      <div class="sf-circle" style="border-color:${color}">${icon}</div>
      <div class="sf-name" style="color:${color}">${name}</div>
      <div class="sf-region">${region}</div>
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
  return el;
}

const SOLAR_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="5" width="18" height="13" rx="1.5" fill="#ea580c"/><line x1="9" y1="5" x2="9" y2="18" stroke="#fff" stroke-width="0.9" opacity="0.6"/><line x1="15" y1="5" x2="15" y2="18" stroke="#fff" stroke-width="0.9" opacity="0.6"/><line x1="3" y1="9.5" x2="21" y2="9.5" stroke="#fff" stroke-width="0.9" opacity="0.6"/><line x1="3" y1="14" x2="21" y2="14" stroke="#fff" stroke-width="0.9" opacity="0.6"/></svg>';
const COMPANY_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 8 L6 21 L14 21 L14 8 Z" fill="#6366f1"/><path d="M14 8 L18 6 L18 19 L14 21 Z" fill="#6366f1" opacity="0.7"/><rect x="8" y="11" width="2" height="2" fill="#fff" opacity="0.8"/><rect x="8" y="15" width="2" height="2" fill="#fff" opacity="0.8"/></svg>';

function injectStyle(): void {
  if (document.getElementById('sf-style')) return;
  const s = document.createElement('style');
  s.id = 'sf-style';
  s.textContent = `
    .sf-node{position:relative;width:0;height:0;pointer-events:none;font-family:inherit;}
    .sf-inner{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .2s ease-out;}
    .sf-ring{position:absolute;left:-24px;top:-24px;width:48px;height:48px;border-radius:9999px;border:1px solid;opacity:.5;animation:sf-pulse 3s ease-out infinite;}
    .sf-circle{position:absolute;left:-21px;top:-21px;width:42px;height:42px;border-radius:9999px;background:#fff;border:1.5px solid;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.15);pointer-events:auto;transition:transform .15s;}
    .sf-circle:hover{transform:scale(1.12);}
    .sf-badge{position:absolute;left:0;top:-44px;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;padding:1px 7px;border-radius:9999px;border:0.5px solid;}
    .sf-name{position:absolute;left:0;top:28px;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:700;text-shadow:0 0 3px #fff,0 0 3px #fff;}
    .sf-region{position:absolute;left:0;top:41px;transform:translateX(-50%);white-space:nowrap;font-size:9px;color:#94a3b8;text-shadow:0 0 3px #fff,0 0 3px #fff;}
    .sf-node.sf-compact .sf-badge,.sf-node.sf-compact .sf-name,.sf-node.sf-compact .sf-region{display:none;}
    @keyframes sf-pulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(1.5);opacity:0}100%{opacity:0}}
  `;
  document.head.appendChild(s);
}
