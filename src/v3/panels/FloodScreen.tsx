import { useEffect, useRef, useState } from 'react';
import { groundAlt, hideFlood, probeRoute, setBaseAlt, setFloodLevel, showFlood } from '../map/floodSim';
import { DisopSteps } from './DisopSteps';

/* 침수 시뮬레이션(CASE03 · 태풍·호우) — 화면 구성은 재난 3종 공통(2026-09-09 사용자 확정):
     레벨 고르기 → 발령 기준 → 재생/정지 → 조치 항목(재생하면 저절로 진행).
   상태 박스("정상·침수 발생·배수 완료")와 피해 복구 예상은 뺐다 —
   앞의 것은 조치 항목 진행 표시와 중복이고, 뒤의 것은 근거를 댈 단가·리드타임이 없다.
   · [재생] = 물이 차오르는 연출 · [정지] = 배수 */

/** 침수 연출 수위(m) */
const FLOOD_M = 0.6;
/** 차오르는 속도 (m/초) */
const RISE_M_PER_S = 0.15;
const TICK_MS = 100;

export function FloodScreen() {
  const [shown, setShown] = useState(false);
  const [ended, setEnded] = useState(false);
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

  /* [재생] — 물이 차오른다 */
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

  /* [정지] — 배수 */
  const stop = () => {
    window.clearInterval(playRef.current);
    setFloodLevel(0);
    setShown(false);
    setEnded(true);
  };

  return (
    <DisopSteps
      disaster="typhoon"
      running={shown}
      ended={ended}
      controls={
        <div className="flex gap-2">
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
      }
    />
  );
}
