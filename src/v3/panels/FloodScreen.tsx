import { useEffect, useRef, useState } from 'react';
import { groundAlt, hideFlood, probeRoute, setBaseAlt, setFloodLevel, showFlood } from '../map/floodSim';
import { SELF_TARIFF } from '../lib/bizSim';
import { PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { Section } from './Drawer';

/* 침수 시뮬레이션(CASE03) — **이진**(침수 되냐/안 되냐) + **모듈 기준만**(2026-08-31 사용자 확정).

   수위 슬라이더·주의/위험 단계는 뺐다 — 의사결정 관점에서 의미 있는 문턱은 침수 여부 하나뿐.
   전기실·수배전반 피해는 다루지 않는다 — 받아올 데이터가 없는 설비를 지어내지 않는다.
   배수 후 결과는 화재·지진과 같은 문법(2026-08-31 사용자 확정) —
   "영향 없음"이라 단정하지 않는다: 침수 후 상태는 점검해야만 알고, 파손이 있으면 교체다.
   · [재생] = 침수 발생 (물 차오르는 연출) · [정지] = 배수 → 점검 + 파손 모듈 교체 대비 */

/* 파손 모듈 교체(1장당) — 화재·지진과 같은 단위·단가:
   1장 = 640Wp → 손실 0.64 × 3.82 × 157.6 ≈ 385원/일 · 교체 ~2주 · 장당 ~20만원(자재+시공, 임시 — 실단가 확인 중) */
const RATE = SELF_TARIFF.energyKrwKwh;
const HOURS = 3.82;
const SPEC = PLANT_SPECS[HOME.facilityId];
const MODULE_DAY_LOSS = (SPEC.module.wp / 1000) * HOURS * RATE;
const MODULE_REPAIR_DAYS = 14;
const MODULE_REPAIR_COST = 20_0000;
const won = (n: number) =>
  n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원` : `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 침수 연출 수위(m) */
const FLOOD_M = 0.6;
/** 차오르는 속도 (m/초) */
const RISE_M_PER_S = 0.15;
const TICK_MS = 100;

export function FloodScreen() {
  const [shown, setShown] = useState(false); // 침수 중
  const [ended, setEnded] = useState(false); // 배수 후 — 피해·복구 예상 표시
  const playRef = useRef(0);

  /* 물 평면 준비 + 지형 고도는 지형이 읽힐 때까지 재시도 */
  useEffect(() => {
    let done = false;
    const tryTerrain = () => {
      const a = groundAlt();
      if (a == null) return false;
      setBaseAlt(a);
      probeRoute();
      return true;
    };
    const first = groundAlt();
    showFlood(first ?? 0);
    if (first != null) {
      probeRoute();
      done = true;
    }
    const t = window.setInterval(() => {
      if (done || tryTerrain()) {
        done = true;
        window.clearInterval(t);
      }
    }, 1000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(playRef.current);
      hideFlood();
    };
  }, []);

  /* [재생] — 침수 발생: 물이 차오른다 */
  const play = () => {
    if (shown) return;
    window.clearInterval(playRef.current);
    setShown(true);
    setEnded(false);
    let cur = 0;
    setFloodLevel(0);
    playRef.current = window.setInterval(() => {
      cur = Math.min(FLOOD_M, cur + RISE_M_PER_S * (TICK_MS / 1000));
      setFloodLevel(cur);
      if (cur >= FLOOD_M) window.clearInterval(playRef.current);
    }, TICK_MS);
  };

  /* [정지] — 배수: 물이 빠지고 피해·복구 예상이 뜬다 */
  const stop = () => {
    window.clearInterval(playRef.current);
    setFloodLevel(0);
    setShown(false);
    setEnded(true);
  };

  return (
    <>
      <Section title="침수 시뮬레이션">
        {/* 상태 — 재생 전/중을 색으로만 (화재 화면과 동일 문법) */}
        <div
          className={`flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-[14px] font-extrabold ${
            shown ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.05] text-slate-400'
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${shown ? 'animate-pulse bg-red-400' : 'bg-emerald-400'}`} />
          {shown ? '침수 발생' : ended ? '배수 완료' : '정상'}
        </div>
      </Section>

      {/* 재생 · 정지 */}
      <div className="flex gap-2 px-5 py-3">
        <button
          type="button"
          onClick={play}
          disabled={shown}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-colors ${
            shown ? 'bg-blue-600/40 text-blue-200/60' : 'bg-blue-600/90 text-white hover:bg-blue-600'
          }`}
        >
          재생
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!shown}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-colors ${
            shown ? 'bg-white/10 text-slate-200 hover:bg-white/20' : 'bg-white/[0.04] text-slate-600'
          }`}
        >
          정지
        </button>
      </div>

      {/* 배수 후 — 피해·복구 예상: 점검 + 파손 모듈 교체 대비 (화재·지진과 같은 문법) */}
      {ended && (
        <Section title="피해 복구 예상">
          <div className="space-y-1.5">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="flex items-baseline gap-1.5 text-[13px] font-extrabold text-slate-100">
                  <span className="h-2 w-2 self-center rounded-full bg-slate-500" />
                  모듈·배선 점검
                </span>
              </div>
            </div>

            <div title={`${SPEC.module.model} · 장당 ~20만원(임시)`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="flex items-baseline gap-1.5 text-[13px] font-extrabold text-slate-100">
                  <span className="h-2 w-2 self-center rounded-full bg-red-400" />
                  파손 모듈 교체 (1장당)
                  <span className="text-[12.5px] font-bold text-slate-300">{SPEC.module.model}</span>
                </span>
                <span className="text-[12.5px] font-bold text-slate-300">교체 ~2주</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between text-[12.5px]">
                <span className="text-slate-500">
                  발전 손실 <b className="font-bold text-red-300">{won(MODULE_DAY_LOSS)}/일</b>
                </span>
                <span className="text-slate-500">
                  복구까지 <b className="font-bold text-red-300">{won(MODULE_DAY_LOSS * MODULE_REPAIR_DAYS + MODULE_REPAIR_COST)}</b>
                </span>
              </div>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
