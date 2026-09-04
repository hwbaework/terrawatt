import { useCallback, useEffect, useRef, useState } from 'react';
import { VersionSwitch } from '../VersionSwitch';
import { MIcon } from '../v2/lib/MIcon';
import { VWORLD_KEY, lookAtPlace } from './map/vworldEngine';
import { VWorld3DView } from './views/VWorld3DView';
import { Compass, WeatherBadge } from './views/WeatherBadge';
import { HOME } from './home';
// import { TweakPanel } from './panels/TweakPanel'; // 화면 설계서용으로 임시 숨김(2026-08-24) — 되돌릴 때 복원
import { FacilityPanel } from './panels/FacilityPanel';
import { DtScreenPanel } from './panels/DtScreenPanel';
import { Drawer } from './panels/Drawer';
import { PlantSimScreen } from './panels/PlantSimScreen';
import { BizDock, BizResultView } from './panels/BizResultView';
import { DtViewPopup } from './panels/DtViewPopup';
import { EventPopup } from './panels/EventPopup';
import { INVERTER_COMM_DOWN, PLANT_EVENTS, type PlantEventKind } from './data/plantEvents';
import { FloodScreen } from './panels/FloodScreen';
import { FireScreen } from './panels/FireScreen';
import { QuakeScreen } from './panels/QuakeScreen';
import { DEFAULT_PV_ASSUMPTION, defaultProject, planPv, M2_PER_KW, type PvAssumption, type PvProject } from './lib/pvPlan';
import { PLANT_SPECS } from './data/specs';
import { FACILITY_MONTH_ACTUAL_KWH, FACILITY_YEAR_ACTUAL_MWH, PLANT_DEMO } from './data/demoReadings';
import type { SketchBuilding } from './map/buildSketch';
import { ACTIVE_SCREENS } from './data/dtScreens';
import { PLANNED_ASSETS } from './data/plannedAssets';
import { AssetPanel, AssetDtStub } from './panels/AssetPanel';
import { BuildScreen } from './panels/BuildScreen';
import { getBuilding, isSketching, listBuildings } from './map/buildSketch';

/* ── TerraWatt v0.3 ──────────────────────────────────────────────────────────
   v0.2(POC)와 달리 나라 → 시 → 구 단계를 두지 않는다.
   **열자마자 내 건물(한일튜브 부지)** 이 보이는 것이 v0.3의 기본 화면.

   지도 = 브이월드 3D 엔진 하나만 쓴다(2026-07-29 확정).
   전에는 "배경 타일(mapbox + 위성사진)"을 함께 두고 전환했지만,
   ①모든 걸 두 벌씩 관리해야 하고 ②두 엔진이 건물을 세우는 규칙이 달라 모양이 어긋나서 걷어냈다.
   (가벼운 대신 주변이 평면 사진이라 트윈다운 맛이 없기도 했다)

   ⚠️ 브이월드 로더는 index.html 에 정적으로 박혀 있어야만 동작한다 — 거기 주석 참고.
   ─────────────────────────────────────────────────────────────────────────── */

export default function AppV3() {
  const homeRef = useRef<() => void>(() => {});

  /* 오른쪽 서랍에 무엇을 띄울지 — 시설 정보 하나와 DT 화면 5개가 자리를 나눠 쓴다 */
  type Panel =
    | { kind: 'facility'; id: string }
    /** 예정 자산(수소·ORC·ESS·V2G) — 아직 실물이 없어 "예상 화면"을 보여준다 */
    | { kind: 'asset'; id: string }
    | { kind: 'dt'; id: string }
    /** 시뮬: gen=발전량(#8) / fire·quake·flood=재난(CASE01~03) — 재난은 DiSOP 관제(p.159).
        물리 연출(불 번짐 등)은 유니티(DT-US), 광역 재해 시뮬은 인천 개발물 도입 예정이라 여기 없다 */
    | { kind: 'sim'; id: 'gen' | 'fire' | 'quake' | 'flood' }
    /** 건물 세우기(BG-01) — 땅에 점 찍어 지붕 자리 → 건물 → 태양광 조건 폼. 스케치 중엔 지도 클릭 = 점 찍기 */
    | { kind: 'build' }
    | null;
  const [panel, setPanel] = useState<Panel>(null);

  /* 건물 세우기 → 사업성 결과.
     bizRan = 시뮬레이션을 돌린 건물들(결과함에 남는다 — 건물을 지우기 전까지) / bizOpen = 지금 펼쳐 놓은 결과 창
     bizTick = 폼이 바뀔 때마다 +1 → 결과함·결과 창이 최신 값으로 다시 계산 */
  const [bizRan, setBizRan] = useState<string[]>([]);
  const [bizOpen, setBizOpen] = useState<string | null>(null);
  const [bizTick, setBizTick] = useState(0);
  const bizBuildings = listBuildings().filter((b) => bizRan.includes(b.id));
  const bizBuilding = bizOpen ? getBuilding(bizOpen) : undefined;

  /* 지금 어느 자산을 보고 있나 — 오른쪽 아이콘 바(시설 정보·DT 화면)가 이걸 따라간다.
     한일튜브(HOME) 또는 예정 자산 id. "리모컨은 하나, 채널이 바뀌는" 방식 —
     자산마다 메뉴를 따로 만들면 메뉴 수정·데이터 연동을 5벌씩 해야 해서 이렇게 간다. */
  const [focus, setFocus] = useState<string>(HOME.facilityId);
  const focusAsset = PLANNED_ASSETS.find((a) => a.id === focus); // undefined = 한일튜브

  /* 발전량 시뮬(한일튜브) — 건물 세우기와 같은 통합 구성(2026-08-24 사용자 확정):
     오른쪽 서랍 = 조정 입력(PlantSimScreen) / 가운데 = 사업성 검토 큰 팝업(BizResultView, 문서로 보기 포함).
     설치용량은 실측(PLANT_SPECS, 429.44kW) 고정 — 면적을 용량×12로 역산해 planPv 에 태우면 capacityKw 가 그 값 그대로 나온다 */
  const [hanilAssumption, setHanilAssumption] = useState<PvAssumption>(DEFAULT_PV_ASSUMPTION);
  const [hanilProject, setHanilProject] = useState<PvProject>(() => defaultProject());
  /** null = 올해(실측 비교) / n = 다음 달부터 n개월 예측 — 월별 차트의 범위 */
  const [hanilMonths, setHanilMonths] = useState<number | null>(null);
  /** 콜아웃 스파크라인 → 시간별 출력 그래프 팝업. 구조·모니터링 뷰는 삭제됨(2026-08-31) */
  const [dtView, setDtView] = useState<'graph' | null>(null);
  const [hanilOpen, setHanilOpen] = useState(false);
  const [hanilTick, setHanilTick] = useState(0);
  const hanilCapacityKw = PLANT_SPECS[HOME.facilityId]?.capacityKw ?? 0;
  const hanilBuilding: SketchBuilding = {
    id: 'hanil-sim',
    name: HOME.name,
    rings: [],
    ring: [{ lng: HOME.lng, lat: HOME.lat, alt: 0, ground: 0 }],
    areaM2: hanilCapacityKw * M2_PER_KW,
    heightM: 22,
    pv: planPv(hanilCapacityKw * M2_PER_KW, hanilAssumption),
    project: hanilProject,
  };

  /* 시뮬 화면을 떠나면 결과를 내린다 */
  useEffect(() => {
    if (!(panel?.kind === 'sim' && panel.id === 'gen')) setHanilOpen(false);
  }, [panel]);

  /* 설비 이벤트 팝업 — 발전소 상세의 "설비 상태"를 누르면 그 신호의 알림을 미리 본다(2026-08-31).
     발전량 0은 안 울린다(구름일 수 있음) — 조건·철학은 plantEvents.ts 주석 참고.
     발전소 상세를 벗어나면 같이 내린다 */
  const [plantEvent, setPlantEvent] = useState<PlantEventKind | null>(null);
  useEffect(() => {
    if (!(panel?.kind === 'dt' && panel.id === 'plant')) setPlantEvent(null);
  }, [panel]);
  /* 좌상단 한일튜브 카드도 이벤트를 따라간다(2026-08-31 사용자 확정):
     RTU 전원·통신이 죽으면 실시간 값 자체가 안 오므로 0, 인버터 2대 두절이면 살아있는 2대의 합만.
     "가동중" 배지도 이벤트 이름으로 바뀐다 */
  const liveKw =
    plantEvent === 'rtuPower' || plantEvent === 'rtuComm'
      ? 0
      : plantEvent === 'inverterComm'
        ? PLANT_DEMO.inverters.filter((i) => !INVERTER_COMM_DOWN.includes(i.id)).reduce((s, i) => s + i.acKw, 0)
        : PLANT_DEMO.currentKw;

  /* 지도가 "내 건물로 돌아가기" 동작을 여기에 걸어둔다 */
  const bindHome = useCallback((fn: () => void) => {
    homeRef.current = fn;
  }, []);

  /* 전체화면 지도 앱은 **문서 스크롤이 있으면 안 된다** — 스크롤이 생기면 지도가 위로 밀리고
     아래에 빈 배경(검정)이 드러난다(실제 발생: 브이월드가 body에 붙이는 보조 요소 등이
     문서를 살짝 늘리는 순간 휠 스크롤이 페이지를 내려버림). v0.3이 떠 있는 동안만 잠근다. */
  useEffect(() => {
    // body만 잠그면 html(문서 최상위)이 대신 스크롤된다 — 둘 다 잠가야 막힌다(실측)
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0); // 이미 밀려 있었다면 제자리로
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  /* 건물 클릭 → 정보 패널. 같은 곳을 다시 누르면 닫는다 */
  const handleSelect = useCallback((facilityId: string) => {
    if (isSketching()) return; // 건물 세우기 중엔 지도 클릭 = 점 찍기 — 시설 패널이 튀어나오면 안 된다
    setFocus(facilityId);
    setPanel((cur) => (cur?.kind === 'facility' && cur.id === facilityId ? null : { kind: 'facility', id: facilityId }));
  }, []);

  const toggleDt = (id: string) =>
    setPanel((cur) => (cur?.kind === 'dt' && cur.id === id ? null : { kind: 'dt', id }));

  /* 예정 자산 버튼 — 카메라를 그 동네(임시 좌표)로 데려가고 예상 패널을 연다.
     한일튜브보다 높이 잡는 이유: 좌표가 대략이라 붙여 보면 오히려 어색해서, 동네 단위로 보여준다 */
  const goAsset = (id: string) => {
    const a = PLANNED_ASSETS.find((x) => x.id === id);
    if (!a) return;
    lookAtPlace({ lng: a.lng, lat: a.lat, altitude: 900, tiltDeg: -50 });
    setFocus(id);
    setPanel({ kind: 'asset', id });
  };

  /* 오른쪽 바 첫 칸(시설 정보) — 카메라는 안 움직이고 패널만 토글 */
  const toggleInfo = () => {
    if (!focusAsset) return handleSelect(HOME.facilityId);
    setPanel((cur) =>
      cur?.kind === 'asset' && cur.id === focusAsset.id ? null : { kind: 'asset', id: focusAsset.id },
    );
  };

  if (!VWORLD_KEY) {
    return (
      <div className="flex items-center justify-center bg-slate-900 p-6" style={{ height: '100dvh' }}>
        <div className="max-w-md rounded-xl bg-red-500/10 px-6 py-5 text-red-200">
          <div className="text-sm font-bold">브이월드 인증키가 없습니다</div>
          <div className="mt-2 text-xs leading-relaxed text-red-300/90">
            <code className="rounded bg-black/30 px-1">.env</code> 에{' '}
            <code className="rounded bg-black/30 px-1">VITE_VWORLD_KEY=발급받은키</code> 를 넣고 개발 서버를 다시
            시작해 주세요.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: '100dvh', width: '100vw' }}>
      <VWorld3DView
        bindHome={bindHome}
        onSelect={handleSelect}
        onSelectAsset={goAsset}
        onQuickAction={(a) => setPanel(a === 'predict' ? { kind: 'dt', id: 'predictive' } : { kind: 'sim', id: a })}
        onOpenView={setDtView}
      />
      {/* 상단 가운데 — 지금 보는 곳의 구·군 + 날씨(샘플). 경계를 넘으면 지역명·값이 바뀐다 */}
      <WeatherBadge />

      {/* 설비 이벤트 팝업 — 발전소 상세의 설비 상태 클릭으로 미리 본다 */}
      {plantEvent && <EventPopup kind={plantEvent} onClose={() => setPlantEvent(null)} />}

      {/* 오른쪽 아래 — 나침반(지도 앱 관례 자리). 서랍이 열리면 아이콘 바처럼 같이 밀려난다 */}
      <div
        className={`fixed bottom-10 z-30 transition-[right] duration-200 ${panel ? 'right-[21.75rem]' : 'right-3'}`}
      >
        <Compass />
      </div>

      {/* 좌상단: 브랜드 + 버전 전환 + 내 건물 바로가기 */}
      <div data-brand-card className="absolute left-4 top-4 z-10 w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
        {/* 화면 설계서 작성용으로 임시 숨김(2026-08-24) — display:none만 지우면 복원 */}
        <div className="flex items-start justify-between gap-2" style={{ display: 'none' }}>
          <div>
            <div className="flex items-center gap-1 text-sm font-extrabold tracking-wide text-white">
              <MIcon name="bolt" size={16} className="text-amber-400" />
              TerraWatt
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">에너지 자급자족 디지털트윈</div>
          </div>
          <VersionSwitch />
        </div>
        {/* 내 건물 바로가기 — 화면 설계서 작성용으로 배치조절·예정 자산 4종은 임시로 숨김(2026-08-24).
            되돌리려면 이 주석 위쪽의 <TweakPanel/> 버튼과 아래 PLANNED_ASSETS.map 블록을 복원 */}
        <div className="mt-2 flex items-center gap-1.5">
          {/* 내 건물 바로가기 — 이름 + 실시간 발전량 + 상태(2026-08-26 사용자 요청) */}
          <button
            type="button"
            onClick={() => {
              homeRef.current();
              setFocus(HOME.facilityId);
              setPanel({ kind: 'facility', id: HOME.facilityId }); // 건물로 이동하면서 정보 패널도 함께
            }}
            className="flex flex-1 items-center gap-2 rounded-lg bg-white/10 px-2.5 py-2 text-left transition-colors hover:bg-white/20"
          >
            <MIcon name="factory" size={16} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-bold text-slate-100">{HOME.name}</span>
                {/* 이벤트 중엔 "가동중" 대신 이벤트 이름을 빨갛게 */}
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[1px] text-[10px] font-bold ${
                    plantEvent ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${plantEvent ? 'animate-pulse bg-red-400' : 'bg-emerald-400'}`} />
                  {plantEvent ? PLANT_EVENTS[plantEvent].badge : '가동중'}
                </span>
              </span>
              <span className="mt-0.5 flex items-baseline gap-1">
                <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${plantEvent ? 'bg-red-400' : 'bg-emerald-400'}`} />
                <span className={`text-[13px] font-extrabold ${plantEvent ? 'text-red-300' : 'text-emerald-300'}`}>{liveKw.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                <span className="text-[10px] font-bold text-slate-500">kW 실시간</span>
              </span>
            </span>
            <MIcon name="chevron_right" size={16} className="shrink-0 text-slate-500" />
          </button>
        </div>

        <div className="mt-1.5 flex flex-col gap-1">
          {false && PLANNED_ASSETS.map((a) => {
            const on = panel?.kind === 'asset' && panel.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => goAsset(a.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold transition-colors ${
                  on ? 'bg-blue-600/80 text-white' : 'bg-white/[0.04] text-slate-400 hover:bg-white/15 hover:text-slate-200'
                }`}
              >
                <MIcon name={a.icon} size={14} className={on ? 'text-white' : 'text-slate-500'} />
                {a.name}
                <span
                  className={`ml-auto rounded px-1 py-px text-[8px] font-bold ${
                    on ? 'bg-white/20 text-white' : 'bg-amber-400/10 text-amber-300/80'
                  }`}
                >
                  예정
                </span>
                <MIcon name="chevron_right" size={14} className={on ? 'text-white/70' : 'text-slate-600'} />
              </button>
            );
          })}
        </div>

      </div>

      {/* 오른쪽 끝 아이콘 바 — 디지털트윈 화면을 갈아끼운다.
          서랍이 열리면 그 폭(21rem)만큼 왼쪽으로 비켜선다 */}
      <div
        className={`fixed top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-white/10
                    bg-slate-950/85 p-1.5 shadow-xl backdrop-blur transition-[right] duration-200
                    ${panel ? 'right-[21.75rem]' : 'right-3'}`}
      >
        {/* 첫 칸 = 시설 정보. **지금 보고 있는 자산**을 따라간다 — 한일튜브면 공장, 수소면 수소 */}
        <button
          type="button"
          onClick={toggleInfo}
          title={`${focusAsset?.name ?? HOME.name} — 시설 정보`}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            panel?.kind === 'facility' || panel?.kind === 'asset'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
        >
          <MIcon name={focusAsset?.icon ?? 'factory'} size={18} />
        </button>
        <div className="my-0.5 h-px bg-white/10" />

        {ACTIVE_SCREENS().map((s) => {
          const on = panel?.kind === 'dt' && panel.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleDt(s.id)}
              title={`${s.name} — ${s.summary}`}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                on ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              <MIcon name={s.icon} size={18} />
            </button>
          );
        })}

        {/* 건물 세우기(BG-01) — DT 화면과 성격이 달라(보는 화면이 아니라 "만드는" 도구) 구분선 아래.
            왼쪽 카드에 두었더니 "한일튜브를 짓는" 것처럼 읽혀서 오른쪽 탭으로 옮김(2026-08-19).
            켜면 지도 클릭 = 점 찍기 */}
        {/* 화면 설계서 작성용으로 임시 숨김(2026-08-24) — display:none 만 지우면 복원 */}
        <div className="my-0.5 h-px bg-white/10" style={{ display: 'none' }} />
        <button
          type="button"
          onClick={() => setPanel((cur) => (cur?.kind === 'build' ? null : { kind: 'build' }))}
          title="건물 세우기 — 땅에 점을 찍어 지붕 면적을 잡고 용량·발전량을 산정"
          style={{ display: 'none' }}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            panel?.kind === 'build' ? 'bg-sky-600 text-white' : 'text-sky-300/80 hover:bg-white/10 hover:text-sky-200'
          }`}
        >
          <MIcon name="pin_drop" size={18} />
        </button>
      </div>

      {/* 오른쪽 서랍 — 시설 정보 / 예정 자산 / DT 화면 */}
      {panel?.kind === 'facility' && <FacilityPanel facilityId={panel.id} onClose={() => setPanel(null)} />}
      {panel?.kind === 'asset' && <AssetPanel assetId={panel.id} onClose={() => setPanel(null)} />}
      {/* DT 화면 — 한일튜브는 실화면, 예정 자산은 "연동되면 이런 게 보인다" 스텁 */}
      {panel?.kind === 'dt' &&
        (focusAsset ? (
          <AssetDtStub assetId={focusAsset.id} screenId={panel.id} onClose={() => setPanel(null)} />
        ) : (
          <DtScreenPanel
            screenId={panel.id}
            onClose={() => setPanel(null)}
            onEvent={setPlantEvent}
            activeEvent={plantEvent}
            onRunGen={() => setPanel({ kind: 'sim', id: 'gen' })}
            onRunFire={() => setPanel({ kind: 'sim', id: 'fire' })}
            onRunQuake={() => setPanel({ kind: 'sim', id: 'quake' })}
            onRunFlood={() => setPanel({ kind: 'sim', id: 'flood' })}
          />
        ))}

      {/* 시뮬레이션 — 조건은 서랍, 결과는 지도(침수는 3D 자체가 결과) */}
      {panel?.kind === 'sim' && panel.id === 'gen' && (
        <Drawer title="발전량 시뮬레이션" onClose={() => setPanel(null)} onBack={() => setPanel({ kind: 'dt', id: 'plant' })}>
          <PlantSimScreen
            assumption={hanilAssumption}
            project={hanilProject}
            periodMonths={hanilMonths}
            onAssumption={(a) => {
              setHanilAssumption(a);
              setHanilTick((t) => t + 1);
            }}
            onProject={(p) => {
              setHanilProject(p);
              setHanilTick((t) => t + 1);
            }}
            onPeriodMonths={(m) => {
              setHanilMonths(m);
              setHanilTick((t) => t + 1);
            }}
            onRun={() => setHanilOpen(true)}
          />
        </Drawer>
      )}
      {panel?.kind === 'sim' && panel.id === 'fire' && (
        <Drawer title="화재 시뮬레이션" onClose={() => setPanel(null)} onBack={() => setPanel({ kind: 'dt', id: 'safety' })}>
          <FireScreen />
        </Drawer>
      )}
      {panel?.kind === 'sim' && panel.id === 'quake' && (
        <Drawer title="지진 시뮬레이션" onClose={() => setPanel(null)} onBack={() => setPanel({ kind: 'dt', id: 'safety' })}>
          <QuakeScreen />
        </Drawer>
      )}
      {panel?.kind === 'sim' && panel.id === 'flood' && (
        <Drawer title="침수 시뮬레이션" onClose={() => setPanel(null)} onBack={() => setPanel({ kind: 'dt', id: 'safety' })}>
          <FloodScreen />
        </Drawer>
      )}
      {/* 건물 세우기(BG-01 샘플) — 화면이 떠 있는 동안만 스케치 모드 */}
      {panel?.kind === 'build' && (
        <Drawer title="건물 세우기" badge="BG-01" onClose={() => setPanel(null)}>
          <BuildScreen
            onRun={(b) => {
              setBizRan((cur) => (cur.includes(b.id) ? cur : [...cur, b.id]));
              setBizOpen(b.id);
            }}
            onChanged={() => setBizTick((t) => t + 1)}
            onRemoved={(id) => {
              setBizRan((cur) => cur.filter((x) => x !== id));
              setBizOpen((cur) => (cur === id ? null : cur));
            }}
          />
        </Drawer>
      )}
      {/* 사업성 결과함 — 건물 세우기 전용이라, 건물 세우기 아이콘을 숨긴 동안 같이 숨김(2026-08-24). false && 지우면 복원 */}
      {false && (
        <BizDock buildings={bizBuildings} openId={bizOpen} onOpen={(id) => { setBizOpen(id); if (panel?.kind !== 'build') setPanel({ kind: 'build' }); }} tick={bizTick} />
      )}
      {bizBuilding && <BizResultView key={bizBuilding.id} building={bizBuilding} tick={bizTick} onClose={() => setBizOpen(null)} />}
      {/* DT 뷰 팝업 — 콜아웃의 뷰 그림(구조·모니터링)을 누르면 지도 가운데에 크게 */}
      {dtView && <DtViewPopup initial={dtView} onClose={() => setDtView(null)} />}
      {/* 발전량 시뮬 결과 — 한일튜브 실측 설비를 같은 엔진(runBiz)에 태운 사업성 검토. 문서로 보기·실측 오버레이 포함 */}
      {hanilOpen && (
        <BizResultView
          key="hanil-sim"
          building={hanilBuilding}
          tick={hanilTick}
          onClose={() => setHanilOpen(false)}
          showDoc
          actualMonthlyKwh={FACILITY_MONTH_ACTUAL_KWH}
          actualYearlyMwh={FACILITY_YEAR_ACTUAL_MWH}
          periodMonths={hanilMonths}
        />
      )}
    </div>
  );
}
