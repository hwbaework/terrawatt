import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { WorldStateProvider, useWorldState } from './world/WorldStateContext';
import { stageFromZoom, STAGE_LABEL, STAGE_ICON, type Stage } from './lib/stage';
import { MarketPanel } from './panels/MarketPanel';
import { BuildingTestPanel } from './panels/BuildingTestPanel';
import { Stage3Overlay } from './panels/Stage3Overlay';
import { addProvinceLayers, applyProvinceSelection, flyToProvince } from './map/provinces';
import { addSimpleFlow, stopSimpleFlow, PLANTS } from './map/simpleFlow';
import { createBuildingLayer } from './map/buildingLayer';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? '';
mapboxgl.accessToken = TOKEN;

/* 카메라 프리셋 — 1단계(나라 전체) / 2단계(건물 보이는 레벨, v0.1 발전소 진입과 동일) */
const KOREA_VIEW = { center: [127.8, 36.2] as [number, number], zoom: 6.3, pitch: 0, bearing: 0 };
const BUILDING_VIEW = { center: [129.33904, 35.49792] as [number, number], zoom: 16.5, pitch: 62, bearing: -20 };

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
  const enterBuildingRef = useRef<(name: string, lngLat: [number, number]) => void>(() => {});
  const stageRef = useRef<Stage>(1);
  const [stage, setStage] = useState<Stage>(1);
  const [basemap, setBasemap] = useState<Basemap>('mono'); // 기본 = 밝은 흑백
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [entered, setEntered] = useState<{ name: string; mw: number } | null>(null); // 3단계 진입 발전소
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

    // 스타일 로드마다(최초 + 지도/위성 전환) 커스텀 레이어 재구성
    map.on('style.load', async () => {
      try {
        map.setConfigProperty('basemap', 'lightPreset', 'day');
        map.setLanguage('ko');
      } catch (err) {
        console.warn('[v2 basemap]', err);
      }
      try {
        await addProvinceLayers(map);
        // 발전소 노드 + 예시 연결선. 노드 클릭 → 3단계 진입
        addSimpleFlow(map, (name, lngLat) => enterBuildingRef.current(name, lngLat));
        // 용인금속1 위치에 3D 건물 모델 (ibuilding49.glb)
        if (!map.getLayer('v2-building')) {
          map.addLayer(createBuildingLayer(129.34, 35.499, '/models/ibuilding49-opt.glb'));
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
      stopSimpleFlow();
      testMarkerRef.current?.remove();
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
    const mw = PLANTS.find((p) => p.name === name)?.mw ?? 100;
    mapRef.current?.flyTo({ center: lngLat, zoom: 18.5, pitch: 75, bearing: 20, duration: 1400, essential: true });
    window.setTimeout(() => setEntered({ name, mw }), 1200); // 카메라 진입 후 화면 전환
  };
  enterBuildingRef.current = enterBuilding;
  /* 3단계 나가기 → 2단계 건물 뷰로 복귀 */
  const exitBuilding = () => {
    setEntered(null);
    mapRef.current?.flyTo({ ...BUILDING_VIEW, duration: 1200, essential: true });
  };

  /* 주소/내위치 선택 → 그 지점으로 이동 + 파란 핀 */
  const handlePick = (lng: number, lat: number, label: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (!testMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = 'font-size:30px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.4));';
      el.textContent = '📍';
      testMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' });
    }
    testMarkerRef.current.setLngLat([lng, lat]).addTo(map);
    testMarkerRef.current.getElement().title = label;
    map.flyTo({ center: [lng, lat], zoom: 16, pitch: 45, duration: 1800, essential: true });
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900">
      <div ref={containerRef} className="absolute inset-0" style={{ height: '100dvh', width: '100vw' }} />

      {status === 'error' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900">
          <div className="rounded-xl bg-red-500/10 px-6 py-4 text-red-300">⚠ {errMsg}</div>
        </div>
      )}

      {/* 좌상단: 브랜드 + 버전 전환 */}
      <div className="absolute left-4 top-4 z-10 w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-extrabold tracking-wide text-white">⚡ TerraWatt</div>
            <div className="mt-0.5 text-[10px] text-slate-400">에너지 자급자족 디지털트윈</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">v0.2</span>
            <a href="?v=1" className="text-[9px] text-slate-500 underline-offset-2 transition-colors hover:text-slate-300 hover:underline">
              v0.1 보기
            </a>
          </div>
        </div>
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
              <span>{STAGE_ICON[s]}</span>
              {s}단계 · {STAGE_LABEL[s]}
            </button>
          ))}
        </div>

        {/* 지도/위성 토글 */}
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
        <BuildingTestPanel token={TOKEN} onPick={handlePick} />
      </div>

      {/* 하단 중앙: WorldState 시각 */}
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur">
        🕐 {String(Math.floor(hour)).padStart(2, '0')}:
        {String(Math.floor((hour % 1) * 60)).padStart(2, '0')}
        <span className="ml-2 text-slate-500">단일 WorldState — 전 단계 공유</span>
      </div>

      {/* 3단계 진입 화면 (건물 클릭 시) — 유니티 자리 */}
      {entered && <Stage3Overlay name={entered.name} mw={entered.mw} onExit={exitBuilding} />}
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
