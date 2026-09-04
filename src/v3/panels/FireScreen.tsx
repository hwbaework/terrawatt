import { useEffect, useState } from 'react';
import { hideFire, showFire } from '../map/fireSim';
import { SELF_TARIFF } from '../lib/bizSim';
import { invLabel } from '../data/demoReadings';
import { PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { Section } from './Drawer';

/* 화재 시뮬레이션(CASE01) — "화재가 발생한다"를 재생/정지로 보여준다(2026-08-26 사용자 확정).

   발화 지점 선택(전기실/인버터)은 뺐다 — 어느 지점이라고 콕 집어 재생하는 건 근거가 약하고
   (실제로 그렇게 일어난다는 보장이 없다), 지도에 표시되는 위치도 결국 건물 한 곳이라 의미가 없었다.
   그냥 "화재 발생" 시뮬레이션으로 간다. 대응 절차·확산표는 넣지 않는다(DiSOP·도면 연동 때 실물로).

   정지(진화) 후에는 **피해 복구 예상**을 띄운다(2026-08-31 사용자 확정) —
   "모듈이 타면·인버터가 타면 얼마나 걸리고 얼마 잃나". 계산 근거는 아래 상수 주석 참고. */

/* ── 피해 복구 예상의 근거 숫자 ─────────────────────────────────────────────
   · 인버터별 모듈 수 = 도면 INVERTER 구성 실측(168/168/168/167장 × 640Wp — PLANT_DEMO.inverters.modules)
   · 하루 발전 손실 = kWp × 3.82h(일평균 발전시간) × 157.6원(자가소비 단가) — 사업성 검토와 같은 식
   · 복구 기간: 인버터 교체 4~6주(수입 발주 리드타임) — 시장 통상치(임시). 손실 누적은 6주(42일)로 계산
   · 교체비: 110kW 인버터 ~1,000만원 — 시장 평균(임시, 견적으로 교체) */
const RATE = SELF_TARIFF.energyKrwKwh;
const HOURS = 3.82;
/* 설비 스펙(모듈 모델·장수·인버터 모델)은 specs.ts(PLANT_SPECS) — 도면 실측, 여러 화면 공용 */
const SPEC = PLANT_SPECS[HOME.facilityId];
const MODULE_KWP = SPEC.module.wp / 1000;
const REPAIR_DAYS = 42; // 인버터 6주
const INV_REPAIR_COST = 1000_0000;
/* 모듈 1장 — 가장 작은 피해 단위(인버터와의 대비용): 교체 ~2주(자재 수급+지붕 작업), 장당 ~20만원(자재+시공, 임시) */
const MODULE_REPAIR_DAYS = 14;
const MODULE_REPAIR_COST = 20_0000;
const dayLoss = (kwp: number) => kwp * HOURS * RATE;

const won = (n: number) =>
  n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원` : `${Math.round(n).toLocaleString('ko-KR')}원`;

export function FireScreen() {
  const [shown, setShown] = useState(false);
  /** 한 번이라도 재생 후 정지했나 — 진화 후 피해 복구 예상을 보여주는 조건 */
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    return () => hideFire();
  }, []);

  const play = () => {
    showFire();
    setShown(true);
    setEnded(false);
  };
  const stop = () => {
    hideFire();
    setShown(false);
    setEnded(true);
  };

  return (
    <>
      <Section title="화재 시뮬레이션">
        {/* 상태 — 재생 전/중을 색으로만 (텍스트 최소) */}
        <div
          className={`flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-[14px] font-extrabold ${
            shown ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.05] text-slate-400'
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${shown ? 'animate-pulse bg-red-400' : 'bg-emerald-400'}`} />
          {shown ? '화재 발생' : ended ? '진화 완료' : '정상'}
        </div>
      </Section>

      {/* 재생 · 정지 — 재생 = 지도에 화재 표시, 정지 = 해제(진화) */}
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

      {/* 진화 후 — 피해 복구 예상(2026-08-31 사용자 확정): 인버터 4대 **각각**(모듈 수가 달라 금액도 다름) + 합계.
          빨간 점 = 화재로 정지된 설비. 모듈 수·용량은 잘 보이게 본문 크기로 */}
      {ended && (
        <Section title="피해 복구 예상">
          <div className="space-y-1.5">
            {/* 모듈 1장 — 가장 작은 피해 단위. 인버터(구역 전체 정지)와의 대비가 한눈에 보인다.
                모델 = 도면 실측: S-Energy 640W (L2,465 × H1,133mm) */}
            <div
              title={`${SPEC.module.model} · ${SPEC.module.sizeMm[0].toLocaleString()}×${SPEC.module.sizeMm[1].toLocaleString()}mm`}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between">
                <span className="flex items-baseline gap-1.5 text-[13px] font-extrabold text-slate-100">
                  <span className="h-2 w-2 self-center rounded-full bg-red-400" />
                  모듈 1장
                  <span className="text-[12.5px] font-bold text-slate-300">{SPEC.module.model}</span>
                </span>
                <span className="text-[12.5px] font-bold text-slate-300">교체 ~2주</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between text-[12.5px]">
                <span className="text-slate-500">
                  발전 손실 <b className="font-bold text-red-300">{won(dayLoss(MODULE_KWP))}/일</b>
                </span>
                <span className="text-slate-500">
                  복구까지 <b className="font-bold text-red-300">{won(dayLoss(MODULE_KWP) * MODULE_REPAIR_DAYS + MODULE_REPAIR_COST)}</b>
                </span>
              </div>
            </div>

            {SPEC.inverters.map((inv) => {
              const kwp = inv.modules * MODULE_KWP;
              const perDay = dayLoss(kwp);
              return (
                /* 인버터 모델 = 도면 실측(SPEC.inverterModel) — 툴팁으로 */
                <div key={inv.id} title={`${SPEC.inverterModel} · ${inv.ratedKw}kW`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="flex items-baseline gap-1.5 text-[13px] font-extrabold text-slate-100">
                      <span className="h-2 w-2 self-center rounded-full bg-red-400" />
                      {invLabel(inv.id)}
                      <span className="text-[12.5px] font-bold text-slate-300">
                        모듈 {inv.modules}장 · {kwp.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}kWp
                      </span>
                    </span>
                    <span className="text-[12.5px] font-bold text-slate-300">교체 4~6주</span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between text-[12.5px]">
                    <span className="text-slate-500">
                      발전 손실 <b className="font-bold text-red-300">{won(perDay)}/일</b>
                    </span>
                    <span className="text-slate-500">
                      복구까지 <b className="font-bold text-red-300">{won(perDay * REPAIR_DAYS + INV_REPAIR_COST)}</b>
                    </span>
                  </div>
                </div>
              );
            })}

            {/* 합계 — 4대 전체 소실 시 */}
            {(() => {
              const totalModules = SPEC.inverters.reduce((s, i) => s + i.modules, 0);
              const totalKwp = totalModules * MODULE_KWP;
              const perDay = dayLoss(totalKwp);
              const total = perDay * REPAIR_DAYS + INV_REPAIR_COST * SPEC.inverters.length;
              return (
                <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="flex items-baseline gap-1.5 text-[13px] font-extrabold text-red-200">
                      <span className="h-2 w-2 self-center rounded-full bg-red-400" />
                      합계 (4대 전체)
                      <span className="text-[12.5px] font-bold text-red-200/80">
                        모듈 {totalModules}장 · {totalKwp.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}kWp
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between text-[12.5px]">
                    <span className="text-red-200/70">
                      발전 손실 <b className="font-extrabold text-red-300">{won(perDay)}/일</b>
                    </span>
                    <span className="text-red-200/70">
                      복구까지 <b className="text-[14px] font-extrabold text-red-300">{won(total)}</b>
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </Section>
      )}
    </>
  );
}
