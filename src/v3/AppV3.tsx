import { useCallback, useEffect, useRef, useState } from 'react';
import { VersionSwitch } from '../VersionSwitch';
import { MIcon } from '../v2/lib/MIcon';
import { VWORLD_KEY } from './map/vworldEngine';
import { VWorld3DView } from './views/VWorld3DView';
import { HOME } from './home';
import { TweakPanel } from './panels/TweakPanel';
import { FacilityPanel } from './panels/FacilityPanel';
import { DtScreenPanel } from './panels/DtScreenPanel';
import { Drawer } from './panels/Drawer';
import { GenSimScreen } from './panels/GenSimScreen';
import { GenResultView } from './panels/GenResultView';
import { DocReport } from './panels/DocReport';
import type { GenForecast, GenSimResult } from './lib/genSim';
import { FACILITY_SPECS } from './data/specs';
import { ACTIVE_SCREENS } from './data/dtScreens';

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
    | { kind: 'dt'; id: string }
    /** 발전량 시뮬레이션(#8). 재해 시뮬(지진·홍수·태풍)은 인천 개발물을 가져와 붙일 예정이라 여기 없다 */
    | { kind: 'sim'; id: 'gen' }
    | null;
  const [panel, setPanel] = useState<Panel>(null);

  /* 발전량 시뮬 — 발전량(gen)과 계약 단가(price)를 나눠 든다.
     ★ 발전량은 [시작]으로 한 번만 계산(NASA 호출), 단가는 언제든 바꿔도 재계산 없이 수익만 갱신. */
  const [gen, setGen] = useState<GenForecast | null>(null);
  const [price, setPrice] = useState(FACILITY_SPECS[HOME.facilityId]?.ppaPriceKrwKwh ?? 0);
  const [docOpen, setDocOpen] = useState(false);

  /* 발전량 + 단가 = 결과 화면·문서가 받는 형태 */
  const genResult: GenSimResult | null = gen ? { ...gen, ppaPrice: price } : null;

  /* 시뮬 화면을 떠나면 결과·문서를 내린다 */
  useEffect(() => {
    if (!(panel?.kind === 'sim' && panel.id === 'gen')) {
      setGen(null);
      setDocOpen(false);
    }
  }, [panel]);

  /* 지도가 "내 건물로 돌아가기" 동작을 여기에 걸어둔다 */
  const bindHome = useCallback((fn: () => void) => {
    homeRef.current = fn;
  }, []);

  /* 건물 클릭 → 정보 패널. 같은 곳을 다시 누르면 닫는다 */
  const handleSelect = useCallback((facilityId: string) => {
    setPanel((cur) => (cur?.kind === 'facility' && cur.id === facilityId ? null : { kind: 'facility', id: facilityId }));
  }, []);

  const toggleDt = (id: string) =>
    setPanel((cur) => (cur?.kind === 'dt' && cur.id === id ? null : { kind: 'dt', id }));

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
      <VWorld3DView bindHome={bindHome} onSelect={handleSelect} />

      {/* 좌상단: 브랜드 + 버전 전환 + 내 건물 바로가기 */}
      <div className="absolute left-4 top-4 z-10 w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1 text-sm font-extrabold tracking-wide text-white">
              <MIcon name="bolt" size={16} className="text-amber-400" />
              TerraWatt
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">에너지 자급자족 디지털트윈</div>
          </div>
          <VersionSwitch />
        </div>
        {/* 내 건물 바로가기 + 배치 조절(아이콘) — 한 줄에 나란히 */}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              homeRef.current();
              setPanel({ kind: 'facility', id: HOME.facilityId }); // 건물로 이동하면서 정보 패널도 함께
            }}
            className="flex flex-1 items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5 text-left text-[11px] font-bold text-slate-200 transition-colors hover:bg-white/20"
          >
            <MIcon name="factory" size={14} className="text-slate-400" />
            {HOME.name}
            <MIcon name="chevron_right" size={14} className="ml-auto text-slate-500" />
          </button>
          <TweakPanel />
        </div>
      </div>

      {/* 오른쪽 끝 아이콘 바 — 디지털트윈 화면을 갈아끼운다.
          서랍이 열리면 그 폭(21rem)만큼 왼쪽으로 비켜선다 */}
      <div
        className={`fixed top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-white/10
                    bg-slate-950/85 p-1.5 shadow-xl backdrop-blur transition-[right] duration-200
                    ${panel ? 'right-[21.75rem]' : 'right-3'}`}
      >
        {/* 첫 칸 = 시설 정보(홈). 건물을 클릭해도 이 칸이 켜진다 */}
        <button
          type="button"
          onClick={() => handleSelect(HOME.facilityId)}
          title={`${HOME.name} — 시설 정보`}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            panel?.kind === 'facility'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
        >
          <MIcon name="factory" size={18} />
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
      </div>

      {/* 오른쪽 서랍 — 시설 정보 / DT 화면 */}
      {panel?.kind === 'facility' && <FacilityPanel facilityId={panel.id} onClose={() => setPanel(null)} />}
      {panel?.kind === 'dt' && (
        <DtScreenPanel
          screenId={panel.id}
          onClose={() => setPanel(null)}
          onRunGen={() => setPanel({ kind: 'sim', id: 'gen' })}
        />
      )}

      {/* 발전량 시뮬레이션 — 조건(기간·단가)은 서랍, 결과는 지도 왼쪽, 문서는 전체 화면 */}
      {panel?.kind === 'sim' && (
        <Drawer title="발전량 시뮬레이션" onClose={() => setPanel(null)} onBack={() => setPanel({ kind: 'dt', id: 'plant' })}>
          <GenSimScreen price={price} onPriceChange={setPrice} onForecast={setGen} />
        </Drawer>
      )}
      {genResult && (
        <GenResultView result={genResult} onClose={() => setGen(null)} onOpenDoc={() => setDocOpen(true)} />
      )}
      {genResult && docOpen && <DocReport result={genResult} onClose={() => setDocOpen(false)} />}
    </div>
  );
}
