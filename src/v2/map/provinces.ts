/* mapboxgl 타입은 전역 네임스페이스로 제공됨 (mapbox-gl 패키지의 UMD 선언) — import 불필요 */

/* 시/도 경계 GeoJSON 캐시 — 이름으로 bbox 찾을 때 재사용 */
let provinceFC: GeoJSON.FeatureCollection | null = null;

/* 폴리곤/멀티폴리곤의 경계 상자 [minX, minY, maxX, maxY] */
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

/* 1단계(나라) 시/도 인터랙션 — 지도에서 시/도를 직접 클릭하면 노란색으로 표시.
   v0.1의 region-outline(노란 윤곽)을 v0.2에선 클릭 선택 방식으로 계승.
   데이터: /geo/skorea-provinces.json (v0.1과 공유, properties.name = 시/도명) */

export async function addProvinceLayers(map: mapboxgl.Map): Promise<void> {
  if (map.getSource('kr-provinces')) return;
  const fc = (await fetch('/geo/skorea-provinces.json').then((r) => r.json())) as GeoJSON.FeatureCollection;
  provinceFC = fc;
  map.addSource('kr-provinces', { type: 'geojson', data: fc, generateId: true });

  // 마우스 올리면 옅은 노랑 (feature-state hover)
  map.addLayer({
    id: 'kr-prov-fill',
    type: 'fill',
    source: 'kr-provinces',
    paint: {
      'fill-color': '#facc15',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.18, 0],
    },
  });
  // 시/도 경계선 (은은한 흰색)
  map.addLayer({
    id: 'kr-prov-line',
    type: 'line',
    source: 'kr-provinces',
    paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 1 },
  });
  // 선택된 시/도 — 진한 노란 채움 + 윤곽
  map.addLayer({
    id: 'kr-prov-sel-fill',
    type: 'fill',
    source: 'kr-provinces',
    filter: ['==', ['get', 'name'], ''],
    paint: { 'fill-color': '#facc15', 'fill-opacity': 0.28 },
  });
  map.addLayer({
    id: 'kr-prov-sel-line',
    type: 'line',
    source: 'kr-provinces',
    filter: ['==', ['get', 'name'], ''],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#facc15', 'line-width': 3 },
  });
}

let selTimer: ReturnType<typeof setTimeout> | undefined;

/* 선택 시/도 반영 — 노란 표시는 3초 뒤 자동 해제(칩/카메라 상태와 무관하게 지도 표시만 잠깐).
   빈 문자열이면 즉시 해제. */
export function applyProvinceSelection(map: mapboxgl.Map, name: string): void {
  if (!map.getLayer('kr-prov-sel-fill')) return;
  if (selTimer) clearTimeout(selTimer);
  const setName = (n: string) => {
    if (!map.getLayer('kr-prov-sel-fill')) return;
    const f: mapboxgl.FilterSpecification = ['==', ['get', 'name'], n];
    map.setFilter('kr-prov-sel-fill', f);
    map.setFilter('kr-prov-sel-line', f);
  };
  setName(name);
  if (name) selTimer = setTimeout(() => setName(''), 3000); // 3초 뒤 노란 표시만 사라짐
}

/* 시/도 이름 → 그 경계로 카메라 이동. 이름이 없으면(해제) 전국 뷰로 복귀. */
export function flyToProvince(map: mapboxgl.Map, name: string): void {
  if (!name) {
    // 전국 뷰 — 시작 카메라와 동일
    map.flyTo({ center: [127.8, 36.2], zoom: 6.3, pitch: 0, bearing: 0, duration: 1400, essential: true });
    return;
  }
  const feat = provinceFC?.features.find((f) => f.properties?.name === name);
  if (!feat?.geometry) return;
  const [minX, minY, maxX, maxY] = featureBBox(feat.geometry);
  map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 80, pitch: 0, bearing: 0, duration: 1400 });
}
