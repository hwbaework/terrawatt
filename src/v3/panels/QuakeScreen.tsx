import { useEffect, useState } from 'react';
import { hideQuake, showQuake } from '../map/quakeSim';
import { SELF_TARIFF } from '../lib/bizSim';
import { PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { Section } from './Drawer';

/* 지진 시뮬레이션(CASE02) — 진도 선택 → 지도에 진앙 표시.

   화재 화면과 같은 최소 구성(2026-08-24) — 대응 절차·영향·행동요령·안내문은 뺐다
   (실제 사업장 절차 문서 없이 지어 넣지 않는다. DiSOP 연동 때 실물로 넣는다).
   진도 설명은 기상청 진도등급(수정메르칼리) 원문 인용이라 남긴다 — "이 진도가 어느 정도인지".
   지도 표시는 진앙+동심원뿐 — 구역별 주의/위험 마커는 뺐다(2026-08-31, 판정할 데이터 없음). */

/** 진도 선택지 + 기상청 진도등급(수정메르칼리) 공식 설명 — 날씨누리 진도등급표 원문.
    Ⅳ·Ⅴ는 뺐다(2026-08-31 사용자 확정) — 설비 영향이 없는 등급은 시뮬레이션할 이유가 없다.
    남긴 둘의 뜻: Ⅵ = 혹시 모르니 점검 / Ⅶ = 모듈이 망가졌을 수 있으니 점검 + 교체 대비 */
const INTENSITIES = [
  { grade: 'Ⅵ', mag: '규모 4.7~5.3', desc: '모든 사람이 느끼고, 일부 무거운 가구가 움직이며, 벽의 석회가 떨어지기도 한다' },
  { grade: 'Ⅶ', mag: '규모 5.3~6.0', desc: '일반 건물에 약간의 피해가 발생하며, 부실한 건물에는 상당한 피해가 발생한다' },
] as const;

/* ── 종료 후 결과(2026-08-31 사용자 확정) ──
   · 공통 = "모듈 점검" — 지진 후 모듈 상태는 점검해야만 안다. 틀어짐·정지 같은 단정 금지
   · Ⅶ(규모 5.3~)만 + "파손 모듈 교체(1장당)" — 망가졌을 수 있는 등급이라 화재와 같은 단위로 대비 금액을 준다
     1장 = 640Wp → 손실 0.64 × 3.82 × 157.6 ≈ 385원/일 · 교체 ~2주 · 장당 ~20만원(자재+시공, 임시 — 실단가 확인 중) */
const RATE = SELF_TARIFF.energyKrwKwh;
const HOURS = 3.82;
const SPEC = PLANT_SPECS[HOME.facilityId];
const MODULE_DAY_LOSS = (SPEC.module.wp / 1000) * HOURS * RATE;
const MODULE_REPAIR_DAYS = 14;
const MODULE_REPAIR_COST = 20_0000;
const won = (n: number) =>
  n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원` : `${Math.round(n).toLocaleString('ko-KR')}원`;

export function QuakeScreen() {
  const [grade, setGrade] = useState<(typeof INTENSITIES)[number]['grade']>('Ⅵ');
  const [shown, setShown] = useState(false);
  /** 한 번이라도 재생 후 정지했나 — 종료 후 피해·복구 예상을 보여주는 조건(화재와 동일) */
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    return () => hideQuake();
  }, []);

  const play = () => {
    showQuake();
    setShown(true);
    setEnded(false);
  };
  const stop = () => {
    hideQuake();
    setShown(false);
    setEnded(true);
  };

  const selected = INTENSITIES.find((x) => x.grade === grade);

  return (
    <>
      <Section title="진도 (기상청 진도등급)">
        <div className="grid grid-cols-2 gap-1.5">
          {INTENSITIES.map((x) => {
            const on = grade === x.grade;
            return (
              <button
                key={x.grade}
                type="button"
                onClick={() => setGrade(x.grade)}
                className={`rounded-md py-1.5 transition-colors ${
                  on ? 'bg-amber-500/25' : 'bg-white/[0.06] hover:bg-white/10'
                }`}
              >
                <span className={`block text-[14px] font-extrabold leading-tight ${on ? 'text-amber-300' : 'text-slate-300'}`}>
                  {x.grade}
                </span>
                <span className={`block text-[11px] leading-tight ${on ? 'text-amber-200/80' : 'text-slate-500'}`}>
                  {x.mag}
                </span>
              </button>
            );
          })}
        </div>
        {/* 이 진도가 어느 정도인지 — 기상청 원문 */}
        <p className="mt-2.5 rounded-lg bg-white/[0.04] px-3 py-2.5 text-[13px] leading-relaxed text-slate-200">
          <span className="mr-1.5 font-extrabold text-amber-300">진도 {grade} · {selected?.mag}</span>
          {selected?.desc}
        </p>
      </Section>

      {/* 재생 · 정지 — 재생 = 지도에 진앙 표시, 정지 = 해제 */}
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

      {/* 종료 후 — 피해·복구 예상: 공통 "모듈 점검" + Ⅶ은 파손 모듈 교체(1장당) */}
      {ended && (
        <Section title="피해 복구 예상">
          <div className="space-y-1.5">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="flex items-baseline gap-1.5 text-[13px] font-extrabold text-slate-100">
                  <span className="h-2 w-2 self-center rounded-full bg-slate-500" />
                  모듈 점검
                </span>
                <span className="text-[12.5px] font-bold text-slate-300">발전 유지</span>
              </div>
            </div>

            {grade === 'Ⅶ' && (
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
            )}
          </div>
        </Section>
      )}
    </>
  );
}
