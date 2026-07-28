import { useState } from 'react';
import { MIcon } from '../lib/MIcon';
import { PLANTS } from '../map/simpleFlow';
import { PLANT_SPECS, formatCapacity } from '../data/specs';
import {
  findSupplySubstation,
  substationsByDistance,
  PLANT_SUB,
  type SupplySub,
} from '../data/substations';
import { fetchMonthlyWx, type MonthWx } from '../data/monthlyScenario';

/* 내 건물 카드 — 우클릭으로 선택한 건물(들)의 지붕 면적·높이·설치 가능 용량.
   면적 = 실제 건물 외곽선 기반(shoelace 공식) — 실측값이라 조절 불가.
   이용률 = 가정값이라 조절 가능 — 옥상 설비·그늘·경사·통로 등 불확실성을 여기 담는다. */

/* 옥상 태양광 규격 (v0.1 이식) — 근거를 노출하기 위해 패널 단위로 계산 */
const PANEL_KWP = 0.5; // 패널 1장 용량
const PANEL_AREA_M2 = 2.5; // 패널 1장 면적
const USABLE_DEFAULT = 75; // 지붕 이용률 % 기본값
const USABLE_MIN = 30;
const USABLE_MAX = 90;
const USABLE_STEP = 5;

/* 위경도 링 → 근사 면적(㎡) — shoelace + 위도 보정 */
function ringAreaM2(ring: number[][]): number {
  if (!ring || ring.length < 3) return 0;
  const lat0 = (ring[0][1] * Math.PI) / 180;
  const mx = 111320 * Math.cos(lat0);
  const my = 110574;
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * mx * (ring[i + 1][1] * my) - ring[i + 1][0] * mx * (ring[i][1] * my);
  }
  return Math.abs(s / 2);
}

function featureAreaM2(f: GeoJSON.Feature): number {
  const g = f.geometry;
  const polyArea = (rings: number[][][]) =>
    rings.reduce((acc, ring, i) => (i === 0 ? acc + ringAreaM2(ring) : acc - ringAreaM2(ring)), 0);
  if (g.type === 'Polygon') return polyArea(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((acc, p) => acc + polyArea(p), 0);
  return 0;
}

/* 선택 건물들의 중심점 (첫 건물 외곽선 평균) — PPA 경로의 도착점 */
function centroidOf(features: GeoJSON.Feature[]): [number, number] | null {
  const g = features[0]?.geometry;
  const ring =
    g?.type === 'Polygon' ? g.coordinates[0] : g?.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
  if (!ring || ring.length === 0) return null;
  const sx = ring.reduce((a, p) => a + p[0], 0);
  const sy = ring.reduce((a, p) => a + p[1], 0);
  return [sx / ring.length, sy / ring.length];
}

export function MyBuildingPanel({
  features,
  onClear,
  onAdjustHeight,
  onSelectSupply,
  onClearSupply,
  onScenario,
}: {
  features: GeoJSON.Feature[];
  onClear: () => void;
  /** 선택된 건물 전체 높이 ±m */
  onAdjustHeight: (deltaM: number) => void;
  /** 발전소 → 담당 변전소(via) → 내 건물 공급 경로 그리기 */
  onSelectSupply: (plant: [number, number], building: [number, number], via: [number, number]) => void;
  /** 공급 경로 지우기 */
  onClearSupply: () => void;
  /** 월별 시나리오 데이터 준비 완료 — 하단 그래프 패널 열기 (왼쪽 카드가 붐비지 않게 분리) */
  onScenario: (rows: MonthWx[], source: 'nasa' | 'fallback', kwp: number) => void;
}) {
  const [usablePct, setUsablePct] = useState(USABLE_DEFAULT); // 지붕 이용률 % (조절 가능한 가정값)
  const [supplyBusy, setSupplyBusy] = useState(false); // 담당 변전소 판정 중
  const [supplySub, setSupplySub] = useState<SupplySub | null>(null); // 내 건물 담당 변전소 (판정 결과)
  const [subPickOpen, setSubPickOpen] = useState(false); // 변전소 직접 선택 목록 표시
  const [supplyName, setSupplyName] = useState(''); // 연결된 발전소 이름 (공급 경로 표시 중)
  const [supplyPlant, setSupplyPlant] = useState<[number, number] | null>(null); // 연결된 발전소 좌표 — 변전소 변경 시 자동 재연결용
  const [wxBusy, setWxBusy] = useState(false); // 월별 시나리오 — 작년 실측 날씨 불러오는 중
  const areaM2 = Math.round(features.reduce((a, f) => a + featureAreaM2(f), 0));
  const heights = features.map((f) => Number(f.properties?.h) || 0).filter((h) => h > 0);
  const heightText =
    heights.length === 0
      ? '—'
      : heights.length === 1
        ? `${Math.round(heights[0])} m`
        : `${Math.round(Math.min(...heights))}~${Math.round(Math.max(...heights))} m`;
  const panels = Math.floor((areaM2 * (usablePct / 100)) / PANEL_AREA_M2);
  const kwp = Math.round(panels * PANEL_KWP);

  return (
    <div className="w-64 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-white">
          <MIcon name="factory" size={18} className="text-blue-400" />
          내 건물
        </span>
        <button
          type="button"
          onClick={onClear}
          title="선택 전부 해제"
          className="rounded px-1 text-slate-400 transition-colors hover:text-white"
        >
          <MIcon name="close" size={18} />
        </button>
      </div>

      {/* 지붕 총면적 — 대표값 */}
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold text-white">{areaM2.toLocaleString()}</span>
        <span className="text-sm font-bold text-slate-400">㎡</span>
        <span className="ml-auto text-[11px] text-slate-400">지붕 총면적</span>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-slate-400">선택 건물</span>
        <span className="text-right font-semibold text-white">{features.length}동</span>
        <span className="text-slate-400">높이</span>
        <span className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onAdjustHeight(-3)}
            title="3m 낮추기"
            className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-slate-300 transition-colors hover:bg-white/20"
          >
            <MIcon name="remove" size={13} />
          </button>
          <span className="min-w-[52px] text-center font-semibold text-white">{heightText}</span>
          <button
            type="button"
            onClick={() => onAdjustHeight(3)}
            title="3m 높이기"
            className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-slate-300 transition-colors hover:bg-white/20"
          >
            <MIcon name="add" size={13} />
          </button>
        </span>
        <span className="text-slate-400">지붕 이용률</span>
        <span className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setUsablePct((v) => Math.max(USABLE_MIN, v - USABLE_STEP))}
            title="보수적으로 (설비·그늘·경사 많음)"
            className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-slate-300 transition-colors hover:bg-white/20"
          >
            <MIcon name="remove" size={13} />
          </button>
          <span className="min-w-[38px] text-center font-semibold text-white">{usablePct}%</span>
          <button
            type="button"
            onClick={() => setUsablePct((v) => Math.min(USABLE_MAX, v + USABLE_STEP))}
            title="낙관적으로 (평지붕·장애물 적음)"
            className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-slate-300 transition-colors hover:bg-white/20"
          >
            <MIcon name="add" size={13} />
          </button>
        </span>
        <span className="text-slate-400">설치 가능 패널</span>
        <span className="text-right font-semibold text-white">{panels.toLocaleString()}장</span>
        <span className="text-slate-400">예상 설비 용량</span>
        <span className="text-right font-semibold text-emerald-400">{kwp.toLocaleString()} kWp</span>
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-slate-500">
        실측 면적 × 이용률 {usablePct}%(가정) · 패널 {PANEL_AREA_M2}㎡/{PANEL_KWP}kWp 기준 추정 — 실사 전 참고값
      </p>

      {/* ── 월별 시나리오 — "작년 날씨가 반복된다면 이만큼" (실측이라 반박 불가).
          그래프는 지도 하단 가로 패널(MonthlyScenarioPanel)에 — 왼쪽 카드 붐빔 방지 ── */}
      <button
        type="button"
        disabled={wxBusy || kwp <= 0}
        onClick={() => {
          const c = centroidOf(features);
          if (!c) return;
          setWxBusy(true);
          fetchMonthlyWx(c[0], c[1])
            .then(({ rows, source }) => onScenario(rows, source, kwp))
            .finally(() => setWxBusy(false));
        }}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-orange-600 px-3 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
      >
        <MIcon name="schedule" size={16} />
        {wxBusy ? '날씨 데이터 불러오는 중…' : '월별 시뮬레이션'}
      </button>


      {/* ── 다음 스텝: offsite PPA — ① 담당 변전소 판정 → ② 발전소 선택 → ③ 경로 표시 ── */}
      {!supplySub && !supplyName && (
        <button
          type="button"
          disabled={supplyBusy}
          onClick={() => {
            const c = centroidOf(features);
            if (!c) return;
            setSupplyBusy(true);
            findSupplySubstation(c[0], c[1])
              .then(setSupplySub)
              .finally(() => setSupplyBusy(false));
          }}
          className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          <MIcon name="bolt" size={16} />
          {supplyBusy ? '담당 변전소 확인 중…' : '근처 발전소에서 공급받기 확인'}
        </button>
      )}

      {/* 담당 변전소 결과 — 발전소를 고르기 전/후 공통으로 보여줌.
          추정은 기본값일 뿐 — [변경]으로 다른 변전소를 직접 고를 수 있다(고지서로 확인한 경우 등) */}
      {supplySub && (
        <div className="mt-2.5 rounded-lg bg-teal-500/15 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[12px] font-bold text-teal-300">
              <MIcon name="power" size={14} />
              담당 변전소 · {supplySub.sub.name}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubPickOpen((v) => !v)}
                className="text-[11px] font-semibold text-teal-300 transition-colors hover:text-white"
              >
                변경
              </button>
              {!supplyName && (
                <button
                  type="button"
                  onClick={() => {
                    setSupplySub(null);
                    setSubPickOpen(false);
                  }}
                  className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-white"
                >
                  닫기
                </button>
              )}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            {supplySub.basis === 'kepco'
              ? `${supplySub.dong} 기준, 한전 공급 데이터로 추정 — 전기요금 고지서로 확정 가능`
              : supplySub.basis === 'nearest'
                ? '한전 표에 없는 지역이라 가장 가까운 변전소로 추정 — 고지서로 확정 필요'
                : '직접 선택한 변전소 — 고지서 기준이면 정확'}
          </p>
        </div>
      )}

      {/* 변전소 직접 선택 — 거리순, 한전 표 후보엔 뱃지. 바꾸면 발전소 선택·경로는 리셋 */}
      {supplySub && subPickOpen && (
        <div className="mt-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            변전소 선택 — 고지서와 다르면 여기서 교체
          </div>
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {(() => {
              const c = centroidOf(features);
              if (!c) return null;
              return substationsByDistance(c[0], c[1])
                .slice(0, 6)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      // 발전소를 이미 골라둔 상태면 새 변전소 경유로 선을 자동으로 다시 그림
                      if (supplyPlant) {
                        const c = centroidOf(features);
                        if (c) onSelectSupply(supplyPlant, c, [s.lng, s.lat]);
                      }
                      setSupplySub({
                        ...supplySub,
                        sub: { id: s.id, name: s.name, lng: s.lng, lat: s.lat },
                        basis: supplySub.kepcoIds.includes(s.id) ? 'kepco' : 'manual',
                      });
                      setSubPickOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                      s.id === supplySub.sub.id ? 'bg-teal-500/25' : 'bg-white/5 hover:bg-white/15'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                      <MIcon name="power" size={14} className="text-teal-300" />
                      {s.name}
                      {supplySub.kepcoIds.includes(s.id) && (
                        <span className="rounded bg-teal-500/25 px-1 py-0.5 text-[9px] font-bold text-teal-300">
                          한전 추정
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-400">{s.km.toFixed(1)}km</span>
                  </button>
                ));
            })()}
          </div>
        </div>
      )}

      {supplySub && !supplyName && !subPickOpen && (
        <div className="mt-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            공급 후보 발전소 — 선택하면 경로 표시
          </div>
          <div className="flex flex-col gap-1">
            {(() => {
              const c = centroidOf(features);
              if (!c) return null;
              // 같은 변전소에 물린 발전소 우선(전기가 동네 안에서 도는 최단 매칭), 그다음 거리순
              return PLANTS.map((p) => ({
                ...p,
                km: Math.hypot((p.lng - c[0]) * 90630, (p.lat - c[1]) * 110574) / 1000,
                sameSub: PLANT_SUB[p.laseeId] === supplySub.sub.id,
              }))
                .sort((a, b) => Number(b.sameSub) - Number(a.sameSub) || a.km - b.km)
                .slice(0, 3)
                .map((p) => (
                  <button
                    key={p.laseeId}
                    type="button"
                    onClick={() => {
                      onSelectSupply([p.lng, p.lat], c, [supplySub.sub.lng, supplySub.sub.lat]);
                      setSupplyName(p.name);
                      setSupplyPlant([p.lng, p.lat]);
                    }}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-2 text-left transition-colors hover:bg-white/15"
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                      <MIcon name="solar_power" size={14} className="text-orange-400" />
                      {p.name}
                      {p.sameSub && (
                        <span className="rounded bg-teal-500/25 px-1 py-0.5 text-[9px] font-bold text-teal-300">
                          같은 변전소
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {PLANT_SPECS[p.laseeId] ? formatCapacity(PLANT_SPECS[p.laseeId].capacityKw) : ''} ·{' '}
                      {p.km.toFixed(1)}km
                    </span>
                  </button>
                ));
            })()}
          </div>
        </div>
      )}

      {supplyName && supplySub && (
        <div className="mt-2 rounded-lg bg-emerald-500/15 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[12px] font-bold text-emerald-300">
              <MIcon name="bolt" size={14} />
              {supplyName} → {supplySub.sub.name} 경유
            </span>
            <span className="flex items-center gap-2">
              {/* 발전소 변경 — 목록으로 되돌아감 (경로는 새 발전소 고르면 다시 그림) */}
              <button
                type="button"
                onClick={() => setSupplyName('')}
                className="text-[11px] font-semibold text-emerald-300 transition-colors hover:text-white"
              >
                변경
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearSupply();
                  setSupplyName('');
                  setSupplyPlant(null);
                  setSupplySub(null);
                  setSubPickOpen(false);
                }}
                className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-white"
              >
                지우기
              </button>
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            설치·관리 부담 없이 한전망(변전소)을 통해 공급받는 offsite PPA 개념
          </p>
        </div>
      )}
    </div>
  );
}
