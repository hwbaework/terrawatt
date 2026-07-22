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
import { addSimpleFlow, stopSimpleFlow, PLANTS } from './map/simpleFlow';
import { createBuildingLayer } from './map/buildingLayer';
import { FACILITIES } from './data/facilities';
import { ESS_READING } from './data/specs';
import { EssPanel } from './panels/EssPanel';
import { PlantPanel } from './panels/PlantPanel';
import { MyPlantsPanel } from './panels/MyPlantsPanel';

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

      {/* 우하단: 3D 건물 배치 조절 (밀기/돌리기 → 좌표 복사) */}
      <div className="absolute bottom-8 right-14 z-10">
        <TweakPanel />
      </div>

      {/* 좌측 정보 카드들 — 순서: 발전량(발전소) → ESS */}
      {(essOpen || plantInfo) && (
        <div className="absolute left-4 top-32 z-10 flex flex-col gap-2">
          {plantInfo && (
            <PlantPanel
              laseeId={plantInfo.laseeId}
              name={plantInfo.name}
              onClose={() => setPlantInfo(null)}
            />
          )}
          {essOpen && <EssPanel onClose={() => setEssOpen(false)} />}
        </div>
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
