import { useEffect, useState } from 'react';
import { hideFire, showFire } from '../map/fireSim';
import { DisopSteps } from './DisopSteps';

/* 화재 시뮬레이션(CASE01) — 화면 구성은 재난 3종이 모두 같다(2026-09-09 사용자 확정):
     레벨 고르기 → 발령 기준 → 재생/정지 → 조치 항목(재생하면 저절로 진행).
   상태 박스("정상·화재 발생·진화 완료")는 뺐다 — 조치 항목의 진행 표시와 중복이었다.
   피해 복구 예상(교체 기간·금액)도 뺐다 — 근거를 댈 수 있는 단가·리드타임이 없다.
   화면 뼈대와 매뉴얼 내용은 DisopSteps + data/disop.ts 가 갖고 있다. */

export function FireScreen() {
  const [shown, setShown] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    return () => hideFire();
  }, []);

  const play = () => {
    showFire(); // 지도에 화재 표시
    setShown(true);
    setEnded(false);
  };
  const stop = () => {
    hideFire(); // 진화
    setShown(false);
    setEnded(true);
  };

  return (
    <DisopSteps
      disaster="fire"
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
