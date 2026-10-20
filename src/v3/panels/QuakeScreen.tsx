import { useEffect, useState } from 'react';
import { hideQuake, showQuake } from '../map/quakeSim';
import { DisopSteps } from './DisopSteps';

/* 지진 시뮬레이션(CASE02) — 화면 구성은 재난 3종 공통(2026-09-09 사용자 확정):
     레벨 고르기 → 발령 기준 → 재생/정지 → 조치 항목(재생하면 저절로 진행).
   ⚠️ 진도 선택(Ⅵ·Ⅶ)은 뺐다 — DiSOP 레벨이 이미 지진 크기로 나뉘어 있어(관심 M3.0 / 주의 M4.0 /
      경계 = 설비 피해·인명 이상) 같은 것을 두 번 고르게 하는 셈이었다.
   피해 복구 예상도 뺐다 — 근거를 댈 수 있는 단가·리드타임이 없다. */

export function QuakeScreen() {
  const [shown, setShown] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    return () => hideQuake();
  }, []);

  const play = () => {
    showQuake(); // 지도에 진앙 표시
    setShown(true);
    setEnded(false);
  };
  const stop = () => {
    hideQuake();
    setShown(false);
    setEnded(true);
  };

  return (
    <DisopSteps
      disaster="quake"
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
