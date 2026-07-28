import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { WorldStateProvider, useWorldState } from './world/WorldStateContext';
import { stageFromZoom, STAGE_LABEL, type Stage } from './lib/stage';
import { MIcon } from './lib/MIcon';
import { MarketPanel } from './panels/MarketPanel';
import { BuildingTestPanel } from './panels/BuildingTestPanel';
import { TweakPanel } from './panels/TweakPanel';
import { Stage3Overlay } from './panels/Stage3Overlay';
import { addProvinceLayers, applyProvinceSelection, flyToProvince } from './map/provinces';
import { addSimpleFlow, stopSimpleFlow, showPpaRoute, clearPpaRoute, PLANTS } from './map/simpleFlow';
import { createBuildingLayer } from './map/buildingLayer';
import { FACILITIES } from './data/facilities';
import { ESS_READING } from './data/specs';
import { EssPanel } from './panels/EssPanel';
import { PlantPanel } from './panels/PlantPanel';
import { MyPlantsPanel } from './panels/MyPlantsPanel';
import { MyBuildingPanel } from './panels/MyBuildingPanel';
import { MonthlyScenarioPanel, type SimView } from './panels/MonthlyScenarioPanel';
import { fetchDailyWx, dayKwh, type MonthWx, type DayWx } from './data/monthlyScenario';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? '';
mapboxgl.accessToken = TOKEN;

/* 카메라 프리셋 — 1단계(나라 전체) / 2단계(건물 보이는 레벨, v0.1 발전소 진입과 동일) */
const KOREA_VIEW = { center: [127.8, 36.2] as [number, number], zoom: 6.3, pitch: 0, bearing: 0 };

/* ESS를 보유한 발전소(한일튜브) — 이 발전소를 열면 ESS 카드도 함께 뜬다 */
const ESS_OWNER_ID = 17514;
// 한일튜브(부곡동 273-6, Plus Code G84J+49) 부지가 화면 중앙에 오도록 — 카메라는 남쪽에서 북쪽을 바라봄
const BUILDING_VIEW = { center: [129.3311, 35.5046] as [number, number], zoom: 16.5, pitch: 62, bearing: -20 };

/* 지도/흑백/위성 스타일 — 전부 Mapbox 내장 (커스텀 아님) */
const STYLES = {
  map: 'mapbox://styles/mapbox/standard', // 컬러 + 3D
  mono: 'mapbox://styles/mapbox/light-v11', // 밝은 흑백
  satellite: 'mapbox://styles/mapbox/standard-satellite', // 위성
} as const;
type Basemap = keyof typeof STYLES;
const BASEMAP_LABEL: Record<Basemap, string> = { map: '지도', mono: '흑백', satellite: '위성' };

function AppV2Inner() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const testMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropPinRef = useRef<(lng: number, lat: number, label: string) => void>(() => {});
  const myBuildingsRef = useRef<GeoJSON.Feature[]>([]); // 선택된 내 건물들 (여러 동, 스타일 전환 시 복원용)
  const [myBldCount, setMyBldCount] = useState(0); // 선택된 건물 수 (패널 표시용)
  const [, setBldTick] = useState(0); // 높이 조절 후 카드 갱신 트리거
  const [scenario, setScenario] = useState<{
    rows: MonthWx[];
    source: 'nasa' | 'fallback';
    kwp: number;
  } | null>(null); // 월별 시나리오 — 하단 그래프 패널 데이터
  const [sim, setSim] = useState<SimView | null>(null); // 시뮬 진행 상태 (매 프레임 갱신)
  const [simBusy, setSimBusy] = useState(false); // 일별 실측 데이터 불러오는 중
  const simRafRef = useRef(0);
  const simTintRef = useRef<HTMLDivElement | null>(null); // 밤낮 틴트 오버레이 (지도 위 반투명 막)
  const dailyRef = useRef<{ key: string; days: DayWx[] } | null>(null); // 일별 실측 캐시 (위치별)
  const enterBuildingRef = useRef<(name: string, lngLat: [number, number]) => void>(() => {});
  const stageRef = useRef<Stage>(1);
  const [stage, setStage] = useState<Stage>(1);
  const [basemap, setBasemap] = useState<Basemap>('mono'); // 기본 = 밝은 흑백
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [entered, setEntered] = useState<{ name: string } | null>(null); // 3단계 진입 발전소
  const [essOpen, setEssOpen] = useState(false); // ESS 상세 카드
  const [plantInfo, setPlantInfo] = useState<{ laseeId: number; name: string } | null>(null); // 발전소 정보 카드 (칩 클릭)
  const essMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const didMountSelRef = useRef(false);
  const { hour } = useWorldState();

  useEffect(() => {
    if (!containerRef.current) return;
    if (!TOKEN) {
      setStatus('error');
      setErrMsg('VITE_MAPBOX_TOKEN 미설정 (.env 확인)');
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES.mono, // 기본 = 밝은 흑백
      center: KOREA_VIEW.center,
      zoom: KOREA_VIEW.zoom,
      pitch: 0,
      antialias: true,
      fadeDuration: 0,
    });
    mapRef.current = map;
    (window as unknown as { __v2map?: mapboxgl.Map }).__v2map = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    // ESS 🔋 뱃지 마커 — 건물 자리에 충전율 표시, 클릭하면 상세 카드 (내용은 hour effect가 채움)
    const essFacility = FACILITIES.find((f) => f.id === 'ess-hanil');
    let onEssZoom: (() => void) | null = null;
    if (essFacility) {
      const essEl = document.createElement('div');
      essEl.style.cssText = 'cursor:pointer;user-select:none;';
      // 충전율 표시(고정값) — 실시간 연동 시 값만 교체
      essEl.innerHTML =
        '<div style="background:#fff;border:1.5px solid #059669;color:#059669;font-weight:800;' +
        'font-size:12px;padding:3px 9px;border-radius:9999px;box-shadow:0 2px 8px rgba(0,0,0,.2);' +
        'white-space:nowrap;display:flex;align-items:center;gap:3px;">' +
        '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;">battery_charging_full</span>' +
        `${ESS_READING.soc}% · ${ESS_READING.mode}</div>`;
      essEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setEssOpen((v) => !v);
      });
      essMarkerRef.current = new mapboxgl.Marker({ element: essEl, anchor: 'bottom', offset: [0, -6] })
        .setLngLat([essFacility.lng, essFacility.lat])
        .addTo(map);
      // 충분히 들어왔을 때만 표시 (건물 보이는 레벨 근처)
      onEssZoom = () => {
        essEl.style.display = map.getZoom() >= 12.5 ? '' : 'none';
      };
      map.on('zoom', onEssZoom);
      onEssZoom();
    }


    const onZoom = () => {
      const s = stageFromZoom(map.getZoom());
      if (s !== stageRef.current) {
        stageRef.current = s;
        setStage(s);
      }
    };
    map.on('zoom', onZoom);

    // 시/도 hover·click (1단계 전용)
    let hoverId: number | string | undefined;
    const onProvMove = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (stageRef.current !== 1) return;
      const id = e.features?.[0]?.id;
      if (id === hoverId) return;
      if (hoverId !== undefined) map.setFeatureState({ source: 'kr-provinces', id: hoverId }, { hover: false });
      hoverId = id;
      if (hoverId !== undefined) {
        map.setFeatureState({ source: 'kr-provinces', id: hoverId }, { hover: true });
        map.getCanvas().style.cursor = 'pointer';
      }
    };
    const onProvLeave = () => {
      if (hoverId !== undefined) map.setFeatureState({ source: 'kr-provinces', id: hoverId }, { hover: false });
      hoverId = undefined;
      map.getCanvas().style.cursor = '';
    };
    const onProvClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (stageRef.current !== 1) return;
      const name = e.features?.[0]?.properties?.name as string | undefined;
      if (!name) return;
      setSelectedProvince((prev) => (prev === name ? '' : name));
    };
    map.on('mousemove', 'kr-prov-fill', onProvMove);
    map.on('mouseleave', 'kr-prov-fill', onProvLeave);
    map.on('click', 'kr-prov-fill', onProvClick);

    // 지도 우클릭 "딸깍" → 핀 찍기. 우클릭 드래그(회전·기울이기)는 핀 안 찍힘.
    // Mapbox가 회전 후에도 contextmenu를 발생시키므로(실측), 누른/뗀 지점 거리로 직접 판별
    let rightDownPt: { x: number; y: number } | null = null;
    const onRightDown = (ev: MouseEvent) => {
      if (ev.button === 2) rightDownPt = { x: ev.clientX, y: ev.clientY };
    };
    map.getCanvas().addEventListener('mousedown', onRightDown);
    const onPinClick = (e: mapboxgl.MapMouseEvent) => {
      const oe = e.originalEvent as MouseEvent;
      if (rightDownPt && Math.hypot(oe.clientX - rightDownPt.x, oe.clientY - rightDownPt.y) > 5) return; // 드래그였음 → 회전
      dropPinRef.current(e.lngLat.lng, e.lngLat.lat, '선택 위치');
    };
    map.on('contextmenu', onPinClick);

    // 스타일 로드마다(최초 + 지도/위성 전환) 커스텀 레이어 재구성
    map.on('style.load', async () => {
      try {
        map.setConfigProperty('basemap', 'lightPreset', 'day');
        map.setLanguage('ko');
      } catch (err) {
        console.warn('[v2 basemap]', err);
      }
      try {
        // 내 건물 세우기 — 전체가 아니라 핀 찍은 건물 하나만 3D로 돌출.
        // bld-pick = 건물 외곽선 조회용 투명 레이어, my-building = 선택된 건물 폴리곤
        if (!map.getLayer('bld-pick') && map.getSource('composite')) {
          map.addLayer({
            id: 'bld-pick',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill',
            minzoom: 13,
            paint: { 'fill-opacity': 0 },
          });
        }
        if (!map.getSource('my-building')) {
          map.addSource('my-building', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({
            id: 'my-building-3d',
            type: 'fill-extrusion',
            source: 'my-building',
            paint: {
              'fill-extrusion-color': '#3b82f6',
              'fill-extrusion-height': ['get', 'h'], // 높이(m) — 속성이라 나중에 조절 UI 붙이기 쉬움
              'fill-extrusion-opacity': 0.85,
            },
          });
          // 스타일 전환(지도↔흑백↔위성) 후에도 선택했던 건물들 유지
          if (myBuildingsRef.current.length > 0) {
            (map.getSource('my-building') as mapboxgl.GeoJSONSource).setData({
              type: 'FeatureCollection',
              features: myBuildingsRef.current,
            });
          }
        }
        await addProvinceLayers(map);
        // 발전소 노드 + 예시 연결선. 원 클릭 → 3단계 진입, 칩(글자) 클릭 → 정보 카드
        addSimpleFlow(
          map,
          (name, lngLat) => enterBuildingRef.current(name, lngLat),
          (laseeId, name) => {
            setPlantInfo((cur) => {
              const closing = cur?.laseeId === laseeId; // 같은 곳 다시 클릭 = 닫기
              setEssOpen(!closing && laseeId === ESS_OWNER_ID); // ESS 보유 발전소면 함께
              return closing ? null : { laseeId, name };
            });
          },
        );
        // 시설 목록표(facilities.ts)의 3D 모델 보유 시설을 전부 세운다
        for (const f of FACILITIES) {
          if (!f.model) continue;
          const layerId = `v2-bld-${f.id}`;
          if (map.getLayer(layerId)) continue;
          map.addLayer(
            createBuildingLayer(f.lng, f.lat, f.model.url, {
              id: layerId,
              targetSizeM: f.model.targetSizeM,
              rotationDeg: f.model.rotationDeg,
              natural: f.model.natural,
            }),
          );
        }
        applyProvinceSelection(map, selectedProvince);
      } catch (err) {
        console.warn('[v2 layers]', err);
      }
    });
    map.on('load', () => setStatus('ready'));
    map.on('error', (e) => console.error('[v2 map error]', e.error));

    return () => {
      map.off('zoom', onZoom);
      map.off('mousemove', 'kr-prov-fill', onProvMove);
      map.off('mouseleave', 'kr-prov-fill', onProvLeave);
      map.off('click', 'kr-prov-fill', onProvClick);
      map.off('contextmenu', onPinClick);
      map.getCanvas().removeEventListener('mousedown', onRightDown);
      stopSimpleFlow();
      testMarkerRef.current?.remove();
      if (onEssZoom) map.off('zoom', onEssZoom);
      essMarkerRef.current?.remove();
      essMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /* 선택 시/도 → 하이라이트 + 카메라 이동 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyProvinceSelection(map, selectedProvince);
    if (didMountSelRef.current) flyToProvince(map, selectedProvince);
    else didMountSelRef.current = true;
  }, [selectedProvince]);

  /* 지도/위성 전환 */
  const switchBasemap = (b: Basemap) => {
    if (b === basemap) return;
    setBasemap(b);
    mapRef.current?.setStyle(STYLES[b]); // style.load 핸들러가 커스텀 레이어 재구성
  };

  /* 단계 버튼 → 해당 뷰로 이동 (stage는 onZoom이 자동 갱신)
     2단계 = 건물 보이는 깊은 줌 + pitch (v0.1 발전소 진입과 동일) */
  const goStage = (s: Stage) => {
    const v = s === 1 ? KOREA_VIEW : BUILDING_VIEW;
    if (s === 1) setSelectedProvince('');
    mapRef.current?.flyTo({
      center: v.center,
      zoom: v.zoom,
      pitch: v.pitch,
      bearing: v.bearing,
      duration: 2000,
      essential: true,
    });
  };

  /* 3단계 진입 — 건물로 카메라가 빨려들어가는 연출 후 유니티 자리(오버레이) 표시 */
  const enterBuilding = (name: string, lngLat: [number, number]) => {
    mapRef.current?.flyTo({ center: lngLat, zoom: 18.5, pitch: 75, bearing: 20, duration: 1400, essential: true });
    window.setTimeout(() => setEntered({ name }), 1200); // 카메라 진입 후 화면 전환
  };
  enterBuildingRef.current = enterBuilding;
  /* 3단계 나가기 → 2단계 건물 뷰로 복귀 */
  const exitBuilding = () => {
    setEntered(null);
    mapRef.current?.flyTo({ ...BUILDING_VIEW, duration: 1200, essential: true });
  };

  /* 핀 지점의 실제 건물 외곽선을 파란 3D로 토글 (v0.1 파란 건물 스타일).
     새 건물 = 추가, 이미 선택된 건물 = 해제 — 여러 동 선택 가능. 빈 땅이면 선택 유지.
     반환: 건물을 찾았는지 (못 찾으면 타일 로드 후 재시도용) */
  const selectBuildingAt = (lng: number, lat: number): boolean => {
    const map = mapRef.current;
    if (!map || !map.getLayer('bld-pick')) return false;
    const src = map.getSource('my-building') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return false;
    const feats = map.queryRenderedFeatures(map.project([lng, lat]), { layers: ['bld-pick'] });
    if (feats.length === 0) return false;
    const f = feats[0];
    // 건물 식별 키 — 타일 피처 id, 없으면 첫 꼭짓점 좌표
    const g = f.geometry as GeoJSON.Polygon;
    const key = String(f.id ?? g.coordinates?.[0]?.[0]?.join(','));
    const cur = myBuildingsRef.current;
    const idx = cur.findIndex((x) => x.properties?.key === key);
    if (idx >= 0) {
      cur.splice(idx, 1); // 이미 선택된 건물 → 해제
    } else {
      const h = Number(f.properties?.height) || 15; // 데이터에 높이 없으면 공장 기본 15m
      cur.push({ type: 'Feature', properties: { h, key }, geometry: f.geometry });
    }
    src.setData({ type: 'FeatureCollection', features: cur });
    setMyBldCount(cur.length);
    return true;
  };

  /* 선택한 건물들 높이 조절 (전체 일괄 ±3m) — 최소 6m(단층 공장 수준, 그 이하 건물은 없음) */
  const MIN_BUILDING_H = 6;
  const adjustBuildingHeight = (deltaM: number) => {
    const cur = myBuildingsRef.current;
    if (cur.length === 0) return;
    for (const f of cur) {
      const h = Number(f.properties?.h) || 15;
      f.properties = { ...f.properties, h: Math.max(MIN_BUILDING_H, h + deltaM) };
    }
    (mapRef.current?.getSource('my-building') as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: cur,
    });
    setBldTick((t) => t + 1); // 카드의 높이 표시 갱신용
  };

  /* 선택한 건물 전부 내리기 (공급 경로도 함께) */
  /* 월별 시나리오 — 선택한 달의 강수량만큼 지도에 비 내리기 (Mapbox 내장 효과, 추가 용량 없음) */
  const setMonthRain = (rainMmDay: number | null) => {
    const map = mapRef.current;
    if (!map) return;
    if (rainMmDay == null || rainMmDay < 1.5) {
      map.setRain(null);
      return;
    }
    const k = Math.min(1, rainMmDay / 7); // 7mm/일(장마급)이면 최대 강도
    map.setRain({
      density: 0.3 + k * 0.5,
      intensity: 0.5 + k * 0.5,
      color: '#a8adbc',
      opacity: 0.7,
      vignette: k * 0.8,
      'vignette-color': '#464646',
      direction: [0, 80],
      'droplet-size': [2.6, 18.2],
      'distortion-strength': 0.7,
      'center-thinning': 0,
    });
  };

  /* ── 월별 시뮬레이션 엔진 — 하루 재생(해 뜨고 짐) = 실제 1주(일별 실측).
     하루 24시간을 그 주 일수(7)로 나눠, 진짜 비 온 날 차례에만 비가 내리고
     그날은 실측 일사량이 낮아 계기판도 실제로 느리게 오른다.
     지도 밝기는 틴트 오버레이로 — 흑백지도에서도 밤낮이 보인다 ── */
  const stopSim = () => {
    cancelAnimationFrame(simRafRef.current);
    setSim(null);
    setMonthRain(null);
    if (simTintRef.current) simTintRef.current.style.opacity = '0';
  };

  const runSim = async (months: number[]) => {
    if (!scenario || months.length === 0) return;
    const { kwp } = scenario;
    cancelAnimationFrame(simRafRef.current);

    // 일별 실측 365일 — 건물 위치 기준 최초 1회 조회 후 캐시 (위치가 바뀌면 다시)
    const g = myBuildingsRef.current[0]?.geometry as GeoJSON.Geometry | undefined;
    const ring =
      g?.type === 'Polygon' ? g.coordinates[0] : g?.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
    const lng = ring ? ring.reduce((a, p) => a + p[0], 0) / ring.length : 129.33;
    const lat = ring ? ring.reduce((a, p) => a + p[1], 0) / ring.length : 35.505;
    const key = `${lng.toFixed(3)},${lat.toFixed(3)}`;
    if (dailyRef.current?.key !== key) {
      setSimBusy(true);
      const { days } = await fetchDailyWx(lng, lat);
      dailyRef.current = { key, days };
      setSimBusy(false);
    }

    // 선택 기간의 날들을 주(7일) 단위로 묶는다 — 마지막 주는 짧을 수 있음
    const ordered = months.flatMap((m) => dailyRef.current!.days.filter((d) => d.m === m));
    const weeks: DayWx[][] = [];
    for (let i = 0; i < ordered.length; i += 7) weeks.push(ordered.slice(i, i + 7));
    const weekKwhs = weeks.map((w) => w.reduce((a, d) => a + dayKwh(kwp, d), 0));
    const total = Math.round(weekKwhs.reduce((a, b) => a + b, 0));
    if (weeks.length === 0) return;

    const DAY_MS = 1400; // 한 사이클(=실제 1주) 재생 시간
    // 낮 가중치 w(h)=sin((h-6)/12π) — 계기판이 해를 따라 오르게 하는 곡선
    const partial = (h: number) => {
      const x = Math.min(Math.max(h - 6, 0), 12);
      return (12 / Math.PI) * (1 - Math.cos((x / 12) * Math.PI));
    };
    let lastSlot = '';
    const start = performance.now();
    const frame = (t: number) => {
      const f = (t - start) / DAY_MS; // 누적 사이클(소수)
      const wi = Math.floor(f);
      if (wi >= weeks.length) {
        // 완료 — 계기판은 기간 합계로 고정, 비·틴트 해제
        const lastDay = ordered[ordered.length - 1];
        setSim({ playing: false, month: lastDay.m, weekN: Math.ceil(lastDay.d / 7), hour: 18, cumKwh: total, rainMm: 0, months });
        setMonthRain(null);
        if (simTintRef.current) simTintRef.current.style.opacity = '0';
        return;
      }
      const week = weeks[wi];
      const h = (f % 1) * 24;
      // 지금 시각이 그 주의 몇째 날인지 — 비는 그 실제 날에 왔을 때만
      const slot = Math.min(week.length - 1, Math.floor((h / 24) * week.length));
      const day = week[slot];
      const slotKey = `${wi}-${slot}`;
      if (slotKey !== lastSlot) {
        lastSlot = slotKey;
        // 1mm 미만은 맑음 취급, 많이 온 날은 세차게 (setMonthRain 스케일에 맞춤)
        setMonthRain(day.rainMm >= 1 ? Math.min(7, 1.5 + day.rainMm / 3) : null);
      }
      // 누적 발전량 — 지나간 날들 합 + 오늘 진행분(낮 곡선을 따르되, 밤 슬롯은 선형)
      const s0 = (slot / week.length) * 24;
      const s1 = ((slot + 1) / week.length) * 24;
      const denom = partial(s1) - partial(s0);
      const fracInSlot = denom > 0.05 ? (partial(h) - partial(s0)) / denom : (h - s0) / (s1 - s0);
      const passed = week.slice(0, slot).reduce((a, d) => a + dayKwh(kwp, d), 0);
      const cum =
        weekKwhs.slice(0, wi).reduce((a, b) => a + b, 0) + passed + dayKwh(kwp, day) * Math.max(0, Math.min(1, fracInSlot));
      // 밤낮 틴트 — 밤엔 짙은 남색, 해 뜰/질 무렵엔 옅은 주황
      const el = simTintRef.current;
      if (el) {
        const d = Math.sin(((h - 6) / 12) * Math.PI); // 태양 고도 근사 (<0 = 밤)
        if (d <= 0) {
          el.style.background = '#0a1432';
          el.style.opacity = String(Math.min(0.5, 0.18 + -d * 0.4));
        } else if (d < 0.3) {
          el.style.background = '#ff9640';
          el.style.opacity = String(0.2 * (1 - d / 0.3));
        } else {
          el.style.opacity = '0';
        }
      }
      setSim({
        playing: true,
        month: day.m,
        weekN: Math.ceil(day.d / 7),
        hour: h,
        cumKwh: Math.round(cum),
        rainMm: Math.round(day.rainMm),
        months,
      });
      simRafRef.current = requestAnimationFrame(frame);
    };
    simRafRef.current = requestAnimationFrame(frame);
  };

  const clearBuildings = () => {
    myBuildingsRef.current = [];
    setMyBldCount(0);
    clearPpaRoute();
    stopSim();
    setScenario(null);
    (mapRef.current?.getSource('my-building') as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [],
    });
  };

  /* 핀 찍기 — 지도 우클릭·주소 검색·내 위치가 공용으로 사용 */
  const dropPin = (lng: number, lat: number, label: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (!testMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'material-symbols-outlined';
      el.style.cssText =
        'font-size:36px;line-height:1;color:#2563eb;filter:drop-shadow(0 3px 5px rgba(0,0,0,.4));user-select:none;';
      el.textContent = 'pin_drop';
      testMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' });
    }
    testMarkerRef.current.setLngLat([lng, lat]).addTo(map);
    testMarkerRef.current.getElement().title = label;
    // 핀 지점 건물 세우기 — 화면 밖/타일 미로드로 못 찾았을 때만 도착 후 한 번 더 (토글이라 중복 실행 금지)
    if (!selectBuildingAt(lng, lat)) {
      map.once('idle', () => selectBuildingAt(lng, lat));
    }
  };
  dropPinRef.current = dropPin;

  /* 주소/내위치 선택 → 핀 + 그 지점으로 이동 */
  const handlePick = (lng: number, lat: number, label: string) => {
    dropPin(lng, lat, label);
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, pitch: 45, duration: 1800, essential: true });
  };

  /* [핀으로 이동] — 현재 핀 위치로 카메라 복귀. 핀 없으면 false */
  const goPin = (): boolean => {
    const map = mapRef.current;
    const marker = testMarkerRef.current;
    if (!map || !marker || !marker.getElement().isConnected) return false;
    const ll = marker.getLngLat();
    map.flyTo({ center: [ll.lng, ll.lat], zoom: Math.max(map.getZoom(), 16), pitch: 45, duration: 1400, essential: true });
    return true;
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900">
      <div ref={containerRef} className="absolute inset-0" style={{ height: '100dvh', width: '100vw' }} />

      {/* 시뮬레이션 밤낮 틴트 — 지도 바로 위 반투명 막 (runSim이 매 프레임 색·농도 조절) */}
      <div ref={simTintRef} className="pointer-events-none absolute inset-0 z-[5]" style={{ opacity: 0 }} />

      {status === 'error' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900">
          <div className="rounded-xl bg-red-500/10 px-6 py-4 text-red-300">⚠ {errMsg}</div>
        </div>
      )}

      {/* 좌상단: 브랜드 + 버전 전환 */}
      <div className="absolute left-4 top-4 z-10 w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1 text-sm font-extrabold tracking-wide text-white">
              <MIcon name="bolt" size={16} className="text-amber-400" />
              TerraWatt
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">에너지 자급자족 디지털트윈</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">v0.2</span>
            <a href="?v=1" className="text-[9px] text-slate-500 underline-offset-2 transition-colors hover:text-slate-300 hover:underline">
              v0.1 보기
            </a>
          </div>
        </div>
        {/* 내 발전소 바로가기 — 클릭 → 건물 코앞까지 이동 + 정보 카드(발전량 → ESS) */}
        <MyPlantsPanel
          onSelect={(laseeId, name) => {
            const p = PLANTS.find((x) => x.laseeId === laseeId);
            if (p) mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 17, pitch: 60, bearing: -20, duration: 1600, essential: true });
            setPlantInfo({ laseeId, name });
            setEssOpen(laseeId === ESS_OWNER_ID); // ESS 보유 발전소면 함께 표시
          }}
        />
      </div>

      {/* 우상단: 단계 토글 + 지도/위성 토글 + (1단계) 선택 시/도 · 단가 */}
      <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
        {/* 단계 토글 */}
        <div className="inline-flex rounded-lg bg-black/60 p-0.5 shadow-lg backdrop-blur">
          {([1, 2] as Stage[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => goStage(s)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                stage === s ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>

        {/* 지도/위성 토글 + 3D 건물 세우기 */}
        <div className="inline-flex rounded-lg bg-black/60 p-0.5 shadow-lg backdrop-blur">
          {(['map', 'mono', 'satellite'] as Basemap[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => switchBasemap(b)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                basemap === b ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {BASEMAP_LABEL[b]}
            </button>
          ))}
        </div>

        {stage === 1 && selectedProvince && (
          <div className="flex items-center gap-1.5 rounded-lg bg-yellow-400/90 px-3 py-1.5 shadow-lg">
            <span className="text-xs font-bold text-slate-900">📍 {selectedProvince}</span>
            <button
              type="button"
              onClick={() => setSelectedProvince('')}
              title="선택 해제"
              className="flex h-4 w-4 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-black/10"
            >
              ✕
            </button>
          </div>
        )}
        {/* 단가(SMP 등)는 1·2단계 모두 표시 */}
        <MarketPanel />
      </div>

      {/* 좌하단: 내 건물 위치 테스트 (접기/펴기 + 주소 검색) */}
      <div className="absolute bottom-8 left-4 z-10">
        <BuildingTestPanel
          token={TOKEN}
          onPick={handlePick}
          onGoPin={goPin}
          buildingCount={myBldCount}
          onClearBuildings={clearBuildings}
        />
      </div>

      {/* 우하단: 3D 건물 배치 조절 (밀기/돌리기 → 좌표 복사) */}
      <div className="absolute bottom-8 right-14 z-10">
        <TweakPanel />
      </div>

      {/* 좌측 정보 카드들 — 순서: 발전량(발전소) → ESS → 내 건물 */}
      {(essOpen || plantInfo || myBldCount > 0) && (
        <div className="absolute left-4 top-32 z-10 flex flex-col gap-2">
          {plantInfo && (
            <PlantPanel
              laseeId={plantInfo.laseeId}
              name={plantInfo.name}
              onClose={() => setPlantInfo(null)}
            />
          )}
          {essOpen && <EssPanel onClose={() => setEssOpen(false)} />}
          {myBldCount > 0 && (
            <MyBuildingPanel
              features={myBuildingsRef.current}
              onClear={clearBuildings}
              onAdjustHeight={adjustBuildingHeight}
              onSelectSupply={(plant, building, via) => void showPpaRoute(plant, building, via)}
              onClearSupply={clearPpaRoute}
              onScenario={(rows, source, kwp) => setScenario({ rows, source, kwp })}
            />
          )}
        </div>
      )}

      {/* 하단 중앙: 월별 시뮬레이션 — 왼쪽 카드 붐빔을 피해 가로로 넓게 */}
      {scenario && myBldCount > 0 && (
        <MonthlyScenarioPanel
          rows={scenario.rows}
          source={scenario.source}
          kwp={scenario.kwp}
          sim={sim}
          busy={simBusy}
          onRun={(months) => void runSim(months)}
          onStop={stopSim}
          onClose={() => {
            stopSim();
            setScenario(null);
          }}
        />
      )}

      {/* 하단 중앙: WorldState 시각 */}
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur">
        <MIcon name="schedule" size={13} className="mr-1 text-slate-400" />
        {String(Math.floor(hour)).padStart(2, '0')}:
        {String(Math.floor((hour % 1) * 60)).padStart(2, '0')}
        <span className="ml-2 text-slate-500">단일 WorldState — 전 단계 공유</span>
      </div>

      {/* 3단계 진입 화면 (건물 클릭 시) — 유니티 자리 */}
      {entered && <Stage3Overlay name={entered.name} onExit={exitBuilding} />}
    </div>
  );
}

export default function AppV2() {
  return (
    <WorldStateProvider>
      <AppV2Inner />
    </WorldStateProvider>
  );
}
