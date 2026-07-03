import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as SunCalc from 'suncalc';

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

/* 지도 초기 중심 = 첫 번째 발전소 */
const HOME = BUGOK_STATION;

/* 태양 계산 기준점(발전소 위치) */
const SUN_REF = { lat: HOME.lat, lng: HOME.lng };

/* zoom 11→13 사이에서 0→value로 페이드 인 */
function zoomReveal(value: number): mapboxgl.ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 11, 0, 13, value] as mapboxgl.ExpressionSpecification;
}

/* 특정 좌표 둘레의 작은 원형 폴리곤 (미터 반경) — 3D 비컨 기둥의 바닥면 */
function circlePolygon(lng: number, lat: number, radiusM: number, steps = 24): number[][] {
  const ring: number[][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

/* 발전소들을 3D 비컨(원기둥) GeoJSON으로 */
function beaconGeoJSON(plants: Plant[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plants.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name },
      geometry: { type: 'Polygon', coordinates: [circlePolygon(p.lng, p.lat, 9)] },
    })),
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

/* 시/도 목록 (드롭다운용) — 경계 GeoJSON의 name과 일치 */
const PROVINCES = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

/* 울산 구/군 목록 — 하위(동) 경계 데이터가 준비된 지역 */
const ULSAN_DISTRICTS = ['중구', '남구', '동구', '북구', '울주군'];

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

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [weather, setWeather] = useState<'clear' | 'rain' | 'snow'>('clear');
  const [selected, setSelected] = useState<Plant | null>(null);
  const [region, setRegion] = useState(''); // 선택된 시/도
  const [district, setDistrict] = useState(''); // 선택된 구/군 (울산)
  const [dong, setDong] = useState(''); // 선택된 읍/면/동
  const [dongList, setDongList] = useState<string[]>([]); // 현재 구의 동 목록
  const provincesRef = useRef<GeoJSON.FeatureCollection | null>(null); // 경계 GeoJSON 캐시
  const districtsRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const dongRef = useRef<GeoJSON.FeatureCollection | null>(null);
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
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    let flowRaf = 0; // 송전망 흐름 애니메이션 프레임 id

    const safeResize = () => {
      if (mapRef.current === map) map.resize();
    };

    map.on('load', () => {
      setStatus('ready');
      safeResize();
      requestAnimationFrame(safeResize);

      // 발전소 핀 마커 — 초록 물방울 핀 + 이름 라벨 (3D에서도 항상 정면)
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
        new mapboxgl.Marker({ element: wrap, anchor: 'bottom' })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
      }
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
      } catch (err) {
        console.warn('[mapbox config]', err);
      }

      // 3D 비컨(초록 원기둥) — 실제 3D 씬에 박혀 건물처럼 기울고 가려짐
      if (!map.getSource('plant-beacons')) {
        map.addSource('plant-beacons', { type: 'geojson', data: beaconGeoJSON(PLANTS) });
        map.addLayer({
          id: 'plant-beacons-3d',
          type: 'fill-extrusion',
          source: 'plant-beacons',
          paint: {
            'fill-extrusion-color': '#22c55e',
            'fill-extrusion-base': 0,
            'fill-extrusion-height': 55, // 기둥 높이(m)
            'fill-extrusion-opacity': 0.75,
          },
        });
        map.on('click', 'plant-beacons-3d', (e) => {
          const id = e.features?.[0]?.properties?.id;
          const p = PLANTS.find((x) => x.id === id);
          if (p) selectPlant(p);
        });
        map.on('mouseenter', 'plant-beacons-3d', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'plant-beacons-3d', () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // ── 송전/배전망 ── (줌 13부터 표시 = 건물이 보이기 시작하는 시점)
      if (!map.getSource('grid-lines')) {
        map.addSource('grid-lines', { type: 'geojson', data: gridLinesGeoJSON() });
        map.addSource('grid-nodes', { type: 'geojson', data: gridNodesGeoJSON() });

        // 실측 인입 경로로 교체 — 변전소에서 154kV 실제 선로를 따라 발전소로
        fetch('/geo/plant-feed.json')
          .then((r) => r.json())
          .then((feed: { substation: { name: string; lng: number; lat: number }; feed: GeoJSON.Feature }) => {
            if (mapRef.current !== map) return;
            const h: [number, number] = [BUGOK_STATION.lng, BUGOK_STATION.lat];
            const distLines: GeoJSON.Feature[] = LOADS.map((l) => ({
              type: 'Feature',
              properties: { role: 'distribution' },
              geometry: { type: 'LineString', coordinates: [h, [l.lng, l.lat]] },
            }));
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

        // 1) 베이스 라인 — 송전(주황 굵게) / 배전(파랑 얇게)
        map.addLayer({
          id: 'grid-base',
          type: 'line',
          source: 'grid-lines',
          minzoom: 13,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['match', ['get', 'role'], 'transmission', '#f59e0b', '#38bdf8'],
            'line-width': ['match', ['get', 'role'], 'transmission', 5, 3],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 14, 0.55],
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
            'line-color': ['match', ['get', 'role'], 'transmission', '#fff3c4', '#e0f2fe'],
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
            'circle-color': ['match', ['get', 'kind'], 'substation', '#f59e0b', '#38bdf8'],
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
        map.addSource('power-infra', { type: 'geojson', data: '/geo/ulsan-power.json' });

        // 송전선 — 전압별 구분 (345kV 빨강 굵게 / 154kV 이하 노랑)
        map.addLayer({
          id: 'power-lines',
          type: 'line',
          source: 'power-infra',
          filter: ['==', ['get', 'kind'], 'line'],
          minzoom: 11.5,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['case', ['>=', ['get', 'kv'], 345], '#f87171', '#fbbf24'],
            'line-width': ['case', ['>=', ['get', 'kv'], 345], 3, 2],
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

  /* 날씨(맑음/비/눈) 적용 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;

    // 비
    if (weather === 'rain') {
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
    if (weather === 'snow') {
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
  }, [weather, status]);

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

  /* GeoJSON 지연 로드 + 캐시 (경로별 1회) */
  const loadGeo = async (url: string, ref: React.MutableRefObject<GeoJSON.FeatureCollection | null>) => {
    if (ref.current) return ref.current;
    try {
      const res = await fetch(url);
      ref.current = (await res.json()) as GeoJSON.FeatureCollection;
      return ref.current;
    } catch (err) {
      console.warn('[region] geojson load fail:', url, err);
      return null;
    }
  };

  /* 윤곽선 잠깐 표시 + bbox로 카메라 이동 (공통) */
  const flashFeature = (feat: GeoJSON.Feature) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('region-outline') as mapboxgl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: [feat] });
    map.setPaintProperty('region-outline-line', 'line-opacity', 1);
    map.setPaintProperty('region-outline-glow', 'line-opacity', 0.6);

    const [minX, minY, maxX, maxY] = featureBBox(feat.geometry);
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, pitch: 0, bearing: 0, duration: 1600 });

    if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current);
    outlineTimerRef.current = setTimeout(() => {
      mapRef.current?.setPaintProperty('region-outline-line', 'line-opacity', 0);
      mapRef.current?.setPaintProperty('region-outline-glow', 'line-opacity', 0);
    }, 3500);
  };

  /* 시/도 선택 = 해당 구역으로 이동 + 윤곽선 잠깐 표시 */
  const showRegion = async (name: string) => {
    setRegion(name);
    setDistrict('');
    setDong('');
    const map = mapRef.current;
    if (!map) return;

    if (!name) {
      // '한국 전체' — 전국 뷰 + 윤곽선 제거
      map.flyTo({ center: [127.8, 36.2], zoom: 6, pitch: 0, bearing: 0, duration: 1600, essential: true });
      (map.getSource('region-outline') as mapboxgl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [],
      });
      return;
    }

    const fc = await loadGeo('/geo/skorea-provinces.json', provincesRef);
    const feat = fc?.features.find((f) => f.properties?.name === name);
    if (feat) flashFeature(feat);
  };

  /* 구/군 선택 (울산) */
  const showDistrict = async (name: string) => {
    setDistrict(name);
    setDong('');
    if (!name) {
      // 구 해제 → 울산 전체로
      setDongList([]);
      showRegion('울산광역시');
      setRegion('울산광역시');
      return;
    }
    const fc = await loadGeo('/geo/ulsan-districts.json', districtsRef);
    const feat = fc?.features.find((f) => f.properties?.name === name);
    if (feat) flashFeature(feat);

    // 이 구의 동 목록 준비
    const dongs = await loadGeo('/geo/ulsan-dong.json', dongRef);
    setDongList(
      (dongs?.features ?? [])
        .filter((f) => f.properties?.gu === name)
        .map((f) => String(f.properties?.name))
        .sort((a, b) => a.localeCompare(b, 'ko')),
    );
  };

  /* 읍/면/동 선택 (울산, 선택된 구 안에서) */
  const showDong = async (name: string) => {
    setDong(name);
    if (!name) {
      showDistrict(district);
      return;
    }
    const fc = await loadGeo('/geo/ulsan-dong.json', dongRef);
    const feat = fc?.features.find((f) => f.properties?.name === name && f.properties?.gu === district);
    if (feat) flashFeature(feat);
  };

  /* 표시용 태양 정보 (suncalc는 이미 도 단위) */
  const sunPos = SunCalc.getPosition(dateAtHour(hour), SUN_REF.lat, SUN_REF.lng);
  const sunAltDeg = sunPos.altitude;
  const times = SunCalc.getTimes(new Date(), SUN_REF.lat, SUN_REF.lng);
  const fmt = (d: Date | null) =>
    d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '--:--';
  const hh = String(Math.floor(hour)).padStart(2, '0');
  const mm = String(Math.round((hour - Math.floor(hour)) * 60)).padStart(2, '0');

  return (
    <div className="fixed inset-0 h-screen w-screen">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" style={{ height: '100dvh', width: '100vw' }} />

      {status === 'ready' && (
        <>
          {/* 상단 중앙: 지역 계층 선택 (시/도 › 구/군 › 동) */}
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-2 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 text-sm text-white">
              <span>🇰🇷 한국</span>
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

              {region === '울산광역시' && (
                <>
                  <span className="text-slate-500">›</span>
                  <select
                    value={district}
                    onChange={(e) => showDistrict(e.target.value)}
                    className="rounded-md bg-white/10 px-2 py-1 text-white outline-none [&>option]:text-black"
                  >
                    <option value="">구/군 선택</option>
                    {ULSAN_DISTRICTS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {region === '울산광역시' && district && dongList.length > 0 && (
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

          {/* 우상단: 날씨 선택 + 태양 정보 */}
          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
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
            <div className="rounded-lg bg-black/60 px-3 py-2 text-right text-xs text-white backdrop-blur">
              <div className="text-sm font-semibold">☀️ 태양 고도 {sunAltDeg.toFixed(1)}°</div>
              <div className="mt-0.5 text-slate-300">
                일출 {fmt(times.sunrise)} · 일몰 {fmt(times.sunset)}
              </div>
              <div className="text-slate-400">{sunAltDeg < 0 ? '🌙 야간' : '주간'}</div>
            </div>
          </div>

          {/* 하단: 시간 슬라이더 */}
          <div className="absolute bottom-8 left-1/2 z-10 w-[min(90vw,560px)] -translate-x-1/2 rounded-xl bg-black/70 px-5 py-4 shadow-xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between text-sm text-white">
              <span className="flex items-center gap-2">🕐 시각</span>
              <span className="font-mono text-lg font-bold">
                {hh}:{mm}
              </span>
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
