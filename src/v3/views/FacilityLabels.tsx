import { useEffect, useRef, useState } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { MODELED_FACILITIES } from '../data/facilities';
import { PLANNED_ASSETS } from '../data/plannedAssets';
import { FACILITY_SPECS, MODEL_SPECS, PLANT_SPECS } from '../data/specs';
import { FACILITY_GEN_DEMO, PLANT_DEMO } from '../data/demoReadings';
import { worldToScreen } from '../map/vworldEngine';

/* 건물 위에 뜨는 이름표 — 이걸 누르면 시설 정보가 열린다.

   3D 모델을 직접 클릭하는 방법(Cesium picking)도 걸어뒀지만, 엔진이 모델 id를 어디에 담는지가
   버전마다 달라 확실하지 않다. 이름표는 **평범한 HTML 버튼**이라 반드시 눌린다.
   덤으로 "여기가 내 건물"이라는 표시도 된다.

   예정 자산(수소·ORC·ESS·V2G)도 같은 방식으로 띄우되 **점선 테두리 + 흐린 톤**으로 구분한다 —
   실물·확정 위치가 아직 없다는 표시. 좌표가 임시라서 "여기 근처" 이상의 의미는 없다.

   위치는 매 프레임 3D 좌표를 화면 좌표로 바꿔서 따라가게 한다. */

/** 이름표를 건물 지붕보다 조금 위에 띄운다 (모델 높이를 알면 그 위로) */
function labelHeightM(facilityId: string): number {
  const h = MODEL_SPECS[facilityId]?.dimensionsM?.[1];
  return (h ?? 20) + 12;
}

/** 이름표를 붙일 지점들 — 실물 시설 + 예정 자산을 한 목록으로 */
const POINTS = [
  ...MODELED_FACILITIES.map((f) => ({
    id: f.id,
    lng: f.lng,
    lat: f.lat,
    heightM: labelHeightM(f.id),
  })),
  ...PLANNED_ASSETS.map((a) => ({ id: a.id, lng: a.lng, lat: a.lat, heightM: 24 })),
];

export function FacilityLabels({
  onSelect,
  onSelectAsset,
  onQuickAction,
  onOpenView,
}: {
  onSelect: (facilityId: string) => void;
  /** 예정 자산 이름표를 누르면 자산 id를 알려준다 */
  onSelectAsset: (assetId: string) => void;
  /** 콜아웃의 바로가기 — 발전량 시뮬·화재·지진·침수 */
  onQuickAction?: (action: 'gen' | 'fire' | 'quake' | 'flood' | 'predict') => void;
  /** 콜아웃의 뷰 그림 — 누르면 지도 가운데에 그 뷰가 크게 뜬다(구조·모니터링) */
  onOpenView?: (view: 'graph') => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let raf = 0;

    const tick = () => {
      for (const p0 of POINTS) {
        const el = box.querySelector<HTMLElement>(`[data-fid="${p0.id}"]`);
        if (!el) continue;
        const p = worldToScreen(p0.lng, p0.lat, p0.heightM);
        if (!p) {
          el.style.visibility = 'hidden'; // 지구 반대편이거나 화면 밖
          continue;
        }
        el.style.visibility = 'visible';
        // translate(-50%, -100%) = 점의 바로 위 가운데에 붙인다
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
        setReady(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute inset-0 z-10"
      style={{ opacity: ready ? 1 : 0, transition: 'opacity .3s' }}
    >
      {/* ── 실물 시설 이름표 + 호버 요약 카드(2026-08-26 사용자 확정 — 부동산 지도 카드 참고) ──
            건물에 마우스를 올리면 주소·설치용량·현재 출력·이번달 절감액·상태가 카드로 뜬다.
            호버는 보조·클릭이 본선(터치엔 호버 없음 — 탭하면 바로 상세). 값은 발전 실적과 같은 demoReadings.
            ⚠️ 이건 상호작용 명세의 웹 POC — 최종 제품(유니티)에선 3D 피킹 + 인게임 카드로 같은 구성을 구현한다 */}
      {MODELED_FACILITIES.map((f) => {
        const spec = FACILITY_SPECS[f.id];
        const plant = PLANT_SPECS[f.id];
        const g = f.id === 'hanil-tube' ? FACILITY_GEN_DEMO : undefined;
        return (
          <div
            key={f.id}
            data-fid={f.id}
            style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}
            className="group pointer-events-auto"
          >
            {/* ── 계기판 콜아웃 — 가로형(2026-08-26 사용자 확정):
                  왼쪽 = 계기판(이름·현재 출력·오늘 곡선·용량·금액) / 오른쪽 = 뷰 그림(구조·모니터링) + 바로가기.
                  리더라인·점으로 건물과 연결 */}
            {spec && plant && g && (
              <div
                className="pointer-events-none absolute bottom-full left-1/2 w-[27rem] -translate-x-1/2 pb-8 opacity-0
                           transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100"
              >
                {/* 리더라인 + 앵커 점 */}
                <div className="absolute bottom-0 left-1/2 h-8 w-px -translate-x-1/2 bg-sky-300/60" />
                <div className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-sky-300" />

                <div className="grid grid-cols-2 gap-3.5 rounded-xl border border-sky-300/25 bg-slate-950/90 p-3.5 shadow-2xl backdrop-blur-md">
                  {/* ── 왼쪽: 계기판 ── */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-extrabold tracking-wide text-white">{f.name}</span>
                      <span className={`h-2 w-2 rounded-full ${spec.status === '가동 중' ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
                    </div>
                    {/* 출력·금액을 **같은 크기·같은 구조**(라벨 위 → 값 아래)로 나란히(2026-08-31 사용자 확정 — 순서·크기 통일) */}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center gap-1 text-[11.5px] font-bold tracking-wide text-slate-400">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                          현재 출력
                        </div>
                        <div className="mt-1 text-[20px] font-extrabold leading-none text-white">
                          {g.currentKw.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
                          <span className="ml-0.5 text-[12px] font-bold text-slate-400">kW</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11.5px] font-bold tracking-wide text-slate-400">이번달 절감</div>
                        <div className="mt-1 text-[20px] font-extrabold leading-none text-emerald-300">
                          {g.monthSaveManwon.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
                          <span className="ml-0.5 text-[12px] font-bold text-slate-400">만원</span>
                        </div>
                      </div>
                    </div>
                    {/* 오늘 출력 곡선 — 누르면 오른쪽 아래에 실시간 그래프(툴팁 포함)가 크게 뜬다(2026-08-26) */}
                    <button
                      type="button"
                      title="시간별 출력 그래프 크게 보기"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenView?.('graph');
                      }}
                      className="mt-2 block w-full rounded-md transition-colors hover:bg-white/[0.06]"
                    >
                      <svg viewBox="0 0 200 34" className="h-[34px] w-full">
                        {(() => {
                          const c = PLANT_DEMO.todayCurve;
                          const deltas = c.slice(1).map(([, v], i) => v - c[i][1]);
                          const max = Math.max(...deltas, 1);
                          const pts = deltas
                            .map((d, i) => `${((i / (deltas.length - 1)) * 196 + 2).toFixed(1)},${(30 - (d / max) * 26).toFixed(1)}`)
                            .join(' ');
                          return (
                            <>
                              <polyline points={`2,30 ${pts} 198,30`} fill="rgba(52,211,153,.12)" stroke="none" />
                              <polyline points={pts} fill="none" stroke="#34d399" strokeWidth={1.6} strokeLinejoin="round" />
                            </>
                          );
                        })()}
                      </svg>
                    </button>
                    {/* 숫자에 라벨을 붙인다 — 429.44가 뭔지 설명 없이 읽히게. 금액은 위로 승격(중복 제거) */}
                    <div className="mt-2 border-t border-white/10 pt-2 text-[12.5px] text-slate-500">
                      설치 <b className="font-bold text-slate-200">{plant.capacityKw.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} kW</b>
                    </div>
                  </div>

                  {/* ── 오른쪽: 예지보전 바로가기 + 시뮬레이션 ── */}
                  <div className="flex flex-col border-l border-white/10 pl-3.5">
                    {/* 모니터링(모듈 격자) 타일 제거(2026-08-31 사용자 확정) — 개별 모듈 데이터는 받을 수 없다
                        (DT-02: 각 모듈 정보 확인 불가). 점검 판정은 인버터 단위 = 오른쪽 예지보전 화면이 담당 →
                        여기서는 예지보전 바로가기로 대체 */}
                    {onQuickAction && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickAction('predict');
                        }}
                        className="group/v flex flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/60 text-left transition-colors hover:border-sky-400/50"
                      >
                        {/* 인버터 4대 상태 미리보기 — 3 정상 · 1 점검(실데이터 구도 그대로) */}
                        <svg viewBox="0 0 100 52" className="w-full flex-1">
                          <rect width="100" height="52" fill="#020617" />
                          {/* 4줄 전부 동일(2026-08-31 사용자 확정) — 출력은 적을 수도 많을 수도 있는 거라
                              미리보기가 한 대를 다르게 그리면 문제라고 단정하는 셈. 상태는 예지보전 화면이 말한다 */}
                          {[0, 1, 2, 3].map((i) => {
                            const y = 6 + i * 11;
                            return (
                              <g key={i}>
                                <circle cx="10" cy={y + 3.5} r="2.5" fill="#34d399" />
                                <rect x="17" y={y} width="70" height="7" rx="2" fill="#38bdf8" opacity="0.4" />
                              </g>
                            );
                          })}
                        </svg>
                        <div className="px-2 py-1.5 text-[12px] font-bold text-slate-200 group-hover/v:text-sky-200">예지보전</div>
                      </button>
                    )}
                    {/* 시뮬레이션 묶음 — 정체불명 알약 금지(2026-08-26): 라벨로 무엇인지 밝히고 이름도 명확하게 */}
                    {onQuickAction && (
                      <div className="mt-2">
                        <div className="text-[11.5px] font-bold tracking-wider text-slate-400">시뮬레이션</div>
                        <div className="mt-1 grid grid-cols-4 gap-1">
                          {(
                            [
                              { id: 'gen', label: '발전량' },
                              { id: 'fire', label: '화재' },
                              { id: 'quake', label: '지진' },
                              { id: 'flood', label: '침수' },
                            ] as const
                          ).map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickAction(a.id);
                              }}
                              className="rounded-md bg-white/[0.07] py-1.5 text-[12px] font-bold text-slate-200 transition-colors hover:bg-sky-500/25 hover:text-sky-200"
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              title={`${f.name} 정보 보기`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20
                         bg-slate-950/85 px-3 py-1.5 text-[11px] font-bold text-slate-100 shadow-lg backdrop-blur
                         transition-colors hover:border-white/40 hover:bg-slate-900"
            >
              <MIcon name="factory" size={13} className="text-amber-400" />
              {f.name}
              <MIcon name="chevron_right" size={13} className="text-slate-500" />
            </button>
          </div>
        );
      })}

      {/* 예정 자산 — 점선·흐린 톤. 좌표가 임시라는 뜻으로 이름 뒤에 (예정)을 붙인다 */}
      {PLANNED_ASSETS.map((a) => (
        <button
          key={a.id}
          data-fid={a.id}
          type="button"
          onClick={() => onSelectAsset(a.id)}
          title={`${a.name} — ${a.locationNote}`}
          style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}
          className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-amber-300/40
                     bg-slate-950/70 px-3 py-1.5 text-[11px] font-bold text-slate-300 shadow-lg backdrop-blur
                     transition-colors hover:border-amber-300/70 hover:bg-slate-900"
        >
          <MIcon name={a.icon} size={13} className="text-amber-300/80" />
          {a.name}
          <span className="text-[9px] font-bold text-amber-300/70">예정</span>
          <MIcon name="chevron_right" size={13} className="text-slate-500" />
        </button>
      ))}
    </div>
  );
}
