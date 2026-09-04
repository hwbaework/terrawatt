/* 사업성 시뮬 결과 계산 — "건물 세우기"에서 만든 태양광 계획(pv) + 사업 조건(project) → 결과 팝업이 받는 숫자.

   ★ 기준 = RMS 태양광 사업성 시뮬레이터 결과 화면(2026-08-19 사용자 스크린샷, 320kW 자가소비 예시).
     그 화면의 숫자를 역산해 규칙을 맞췄다 — 같은 입력이면 같은 결과가 나오게:
       연 발전량(1차년) = 용량 × 일평균 발전시간 × 365          320×3.82×365 = 446,176 kWh ✓(446.2 MWh)
       n년차 발전량     = 1차년 × (1−감소율)^(n−1)                443.9 / 441.7 / 439.5 ✓
       절감액(n년차)    = 자가소비 발전량 × 전력량 단가 + 기본요금 절감, 둘 다 × (1+요금 상승률)^(n−1)
                          97,734천 → 99,727천 (= ×1.025×0.995) ✓
       기본요금 절감    = 설치용량 × 피크감축 반영률 × 기본요금 단가 × 12       320×30%×8,630×12 ≈ 994만 ✓
       CO₂ 감축         = 발전량(MWh) × 0.4173 tCO₂/MWh                    8,499.7 MWh → 3,546.9 t ✓
       소나무 환산      = tCO₂ × 151.5 그루 (= 1그루가 연 6.6 kgCO₂ 흡수)   3,546.9 t → 537,356 그루 ✓
       TOE 환산         = 발전량(MWh) × 0.229                               8,499.7 → 1,946.4 TOE ✓
       월별 분포        = 그 시뮬레이터는 기상청 울산관측소 평년값(1991~2020) 월별 일조 분포 — 우리는 그 표가 없어
                          NASA POWER 울산 월별 일사량(2025)으로 나눈다. **연 합계는 같고 달별 모양만 다를 수 있다.**

   ★ 적용 단가(자가소비) = 2026-08-24 사용자 확정으로 **하나로 통일**했다 — SELF_TARIFF 상수 하나.
      산업용(을) 고압A 선택Ⅱ('26.8 시행 표) / 기본요금 8,320원/kW·월 / 전력량 157.6원/kWh(태양광 발전 시간대 가중평균).
      (이전엔 종별·전압·선택을 화면에서 고르고 위치별로 매번 가중평균을 다시 냈으나 — 제안서는 한 값이어야 한다는 판단.
       157.6 = 그 요금제를 울산 NASA 월별 일사 가중으로 평균한 값. 요금표가 개편되면 이 상수만 바꾼다)
   ⚠️ 사업비·국비·회수기간·J커브는 화면에서 뺐다(2026-08-19 "비용은 따로, 국비는 없다") → 여기서도 계산 안 함. */

import type { PvAssumption, PvPlan, PvProject } from './pvPlan';
import { planPv, tariffLabel, yearKwhAt } from './pvPlan';
import { KEPCO_TABLE_NAME, findTariff, type TariffRow } from '../data/kepcoTariff';

/** 절감액 계산에 쓰는 단가 — 기본요금 + 태양광 발전 시간대 가중평균 전력량 단가. 출처를 함께 둔다 */
export interface TariffRate {
  /** 기본요금 (원/kW·월) */
  basicKrwKw: number;
  /** 전력량 요금 — 태양광 발전 시간대 가중평균 (원/kWh) */
  energyKrwKwh: number;
  source: string;
  /** 공식 표 줄(있으면 화면에서 표로 보여준다) */
  row?: TariffRow;
}
/** 자가소비 적용 단가 — 2026-08-24 사용자 확정: 요금제를 하나로 통일한 단일 상수.
    산업용(을) 고압A 선택Ⅱ('26.8 시행 표, 을은 '26.4.16 시행). 기본요금은 표 그대로, 전력량 157.6원/kWh는
    그 요금제의 계절·시간대별 단가를 태양광 발전 시간(울산 NASA 월별 일사) 비중으로 가중평균한 값.
    (기준 일수비례 평균은 158.8원 근방, 여름 일사 가중까지 반영하면 157.6원 — 사용자 화면값) */
export const SELF_TARIFF: TariffRate = {
  basicKrwKw: 8_320,
  energyKrwKwh: 157.6,
  source: KEPCO_TABLE_NAME,
  row: findTariff('산업용(을)', '고압A', '선택Ⅱ'),
};
/** 자가소비 단가 — 통일된 단일 요금제(SELF_TARIFF). 위치·선택과 무관하게 늘 같은 값 */
export function tariffRateOf(): TariffRate {
  return SELF_TARIFF;
}

/* 환산 계수 — 전부 스크린샷 결과에서 역산(위 주석). 공식 계수표를 받으면 여기만 바꾼다 */
export const CO2_T_PER_MWH = 0.4173;
export const PINE_PER_TCO2 = 1000 / 6.6;
export const TOE_PER_MWH = 0.229;

/** 분석 기간(년) — 시뮬레이터 기본 20년. PPA는 계약기간 */
export const ANALYSIS_YEARS = 20;

export interface YearRow {
  year: number;
  genMwh: number;
  /** 절감(자가소비) 또는 매출(PPA), 원. 단가표가 없으면 null */
  moneyKrw: number | null;
  cumKrw: number | null;
}

export interface BizResult {
  mode: PvProject['mode'];
  years: number;
  /** 월별 발전량(1차년, kWh) 1~12월 */
  monthlyKwh: number[];
  /** 월 분포 출처 */
  monthlySource: string;
  year1Mwh: number;
  totalMwh: number;
  /** 자가소비율(%) — 발전량 중 실제로 자체 소비되는 몫. 사용량이 발전량보다 크면 100 */
  selfUsePct: number;
  /** 1차년 돈(원): 자가소비 = 전력량 절감 + 기본요금 절감 / PPA = 매출. 단가표 없으면 null */
  year1Krw: number | null;
  year1EnergyKrw: number | null;
  year1BasicKrw: number | null;
  totalKrw: number | null;
  rows: YearRow[];
  co2T: number;
  pines: number;
  toe: number;
  /** 단가가 없어서 돈 계산을 못 한 이유 (있으면 화면에 그대로 보여준다) */
  moneyNote?: string;
}

/** 월별 나눔 비율 — NASA 월 일사량 × 일수 비례. 없으면 균등 */
export function monthShares(irr?: Record<number, number>): { shares: number[]; source: string } {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (irr && Object.keys(irr).length === 12) {
    const w = days.map((d, i) => d * (irr[i + 1] ?? 0));
    const sum = w.reduce((s, x) => s + x, 0);
    return { shares: w.map((x) => x / sum), source: 'NASA POWER 울산 월별 일사량(2025) 비례' };
  }
  const sum = days.reduce((s, x) => s + x, 0);
  return { shares: days.map((d) => d / sum), source: '월별 일사량 수신 전 — 일수 비례(임시)' };
}

export function runBiz(
  pv: PvPlan,
  p: PvProject,
  irr?: Record<number, number>,
  /** 민감도 분석용 — 단가를 잠깐 바꿔 돌릴 때 */
  override?: { rate?: TariffRate; ppaPrice?: number },
): BizResult {
  const { shares, source } = monthShares(irr);
  const year1Kwh = pv.yearKwh;
  const monthlyKwh = shares.map((s) => year1Kwh * s);

  // 자가소비율: 달마다 발전 vs 사용을 견줘 넘치는 몫은 빼고 센다.
  // 화면에선 사용량 입력을 뺐다(2026-08-19, 공장은 사용량 ≫ 발전량 → 늘 100%) — 기본값(월 3,000,000kWh)으로 계산돼 사실상 100%
  let selfUsePct = 100;
  if (p.mode === 'self') {
    const used = monthlyKwh.reduce((s, g) => s + Math.min(g, p.self.monthlyKwh), 0);
    selfUsePct = year1Kwh > 0 ? (used / year1Kwh) * 100 : 0;
  }

  const years = p.mode === 'ppa' ? Math.max(1, Math.round(p.ppa.years)) : (p.self.analysisYears ?? ANALYSIS_YEARS);
  const rate = p.mode === 'self' ? (override?.rate ?? tariffRateOf()) : undefined;
  const ppaPrice = override?.ppaPrice ?? p.ppa.priceKrwKwh;
  const moneyNote =
    p.mode === 'self' && !rate
      ? `${tariffLabel(p.self)} — ${p.self.tariffBasis} 기준에는 이 요금제 단가가 없습니다.`
      : undefined;

  const rows: YearRow[] = [];
  let cum = 0;
  let totalMwh = 0;
  let year1Krw: number | null = null;
  let year1EnergyKrw: number | null = null;
  let year1BasicKrw: number | null = null;
  for (let y = 1; y <= years; y++) {
    const genKwh = yearKwhAt(pv, y);
    totalMwh += genKwh / 1000;
    let money: number | null = null;
    if (p.mode === 'ppa') {
      money = genKwh * ppaPrice;
    } else if (rate) {
      const esc = Math.pow(1 + p.self.priceRisePctYr / 100, y - 1);
      const energy = genKwh * (selfUsePct / 100) * rate.energyKrwKwh * esc;
      const basic = pv.capacityKw * (p.self.peakCutPct / 100) * rate.basicKrwKw * 12 * esc;
      money = energy + basic;
      if (y === 1) {
        year1EnergyKrw = energy;
        year1BasicKrw = basic;
      }
    }
    if (money != null) cum += money;
    if (y === 1) year1Krw = money;
    rows.push({ year: y, genMwh: genKwh / 1000, moneyKrw: money, cumKrw: money == null ? null : cum });
  }

  return {
    mode: p.mode,
    years,
    monthlyKwh,
    monthlySource: source,
    year1Mwh: year1Kwh / 1000,
    totalMwh,
    selfUsePct,
    year1Krw,
    year1EnergyKrw,
    year1BasicKrw,
    totalKrw: rows[rows.length - 1]?.cumKrw ?? null,
    rows,
    co2T: totalMwh * CO2_T_PER_MWH,
    pines: totalMwh * CO2_T_PER_MWH * PINE_PER_TCO2,
    toe: totalMwh * TOE_PER_MWH,
    moneyNote,
  };
}

/* ── 민감도 분석 — "이 값이 ±10% 흔들리면 결과가 얼마나 흔들리나" ─────────────────────
   기준 결과 하나를 두고 변수 하나씩만 낮춰/높여 다시 돌린다(다른 값은 그대로).
   결과 지표 = 분석기간 누적 절감액(자가소비)/매출(PPA). 단가표가 없어 돈이 안 나오면 총 발전량(MWh)으로 본다.
   변수: 일평균 발전시간 · 모듈 효율감소율 · 요금 상승률(자가소비) · 전력량 단가 / PPA 단가
   (설치용량은 면적÷12로 고정이라 용량 자체는 민감도 변수에서 뺐다 — 2026-08-24) */
export interface SensRow {
  label: string;
  /** 현재 기준값 (라벨 옆에 "현재 …"로 일괄 표기 — 2026-08-24 사용자 확정) */
  baseInput: string;
  /** 낮춘 조건 설명 / 결과 */
  low: { input: string; value: number };
  high: { input: string; value: number };
}
export interface Sensitivity {
  /** 지표 이름·단위 */
  metric: string;
  unit: 'krw' | 'mwh';
  base: number;
  rows: SensRow[];
}

export function sensitivity(pv: PvPlan, p: PvProject, irr?: Record<number, number>): Sensitivity {
  const base = runBiz(pv, p, irr);
  const useMoney = base.totalKrw != null;
  const metricOf = (r: BizResult) => (useMoney ? (r.totalKrw ?? 0) : r.totalMwh);
  const rerun = (a: Partial<PvAssumption>, proj: PvProject = p, override?: Parameters<typeof runBiz>[3]) =>
    metricOf(runBiz(planPv(pv.areaM2, { ...pv.assumption, ...a }), proj, irr, override));
  const A = pv.assumption;
  const pct = (v: number, d = 2) => v.toLocaleString('ko-KR', { maximumFractionDigits: d });

  const rows: SensRow[] = [
    {
      /* ±5% — 연간 일사량의 해마다 변동은 보통 3~7% 수준(실측 통계). ±10%는 과장이라 축소(2026-08-24 사용자 지적) */
      label: '일평균 발전시간',
      baseInput: `${pct(A.hoursPerDay)} h`,
      low: { input: `${pct(A.hoursPerDay * 0.95)} h (−5%)`, value: rerun({ hoursPerDay: A.hoursPerDay * 0.95 }) },
      high: { input: `${pct(A.hoursPerDay * 1.05)} h (+5%)`, value: rerun({ hoursPerDay: A.hoursPerDay * 1.05 }) },
    },
    {
      /* ±0.2%p(0.3~0.7) — 결정질 모듈의 실측 저하율 분포가 대략 0.3~0.8%/yr(업계 장기 통계) 안이라 타당한 폭 */
      label: '모듈 효율감소율',
      baseInput: `${pct(A.degradePctYr)} %/yr`,
      low: { input: `${pct(Math.max(0, A.degradePctYr - 0.2))} %/yr`, value: rerun({ degradePctYr: Math.max(0, A.degradePctYr - 0.2) }) },
      high: { input: `${pct(A.degradePctYr + 0.2)} %/yr`, value: rerun({ degradePctYr: A.degradePctYr + 0.2 }) },
    },
  ];
  if (p.mode === 'self' && useMoney) {
    const rate = tariffRateOf();
    rows.push(
      {
        /* 절충안(2026-08-24 사용자 확정): 기본값 2.5%는 보수적으로 유지하되,
           상방은 +1%p 가 아니라 **최근 실측 추세(+8%/yr — '23~'25 산업용 판매단가 연 +8~9%)** 시나리오로 —
           "보수적으로 잡아도 이 정도, 최근 추세대로면 이만큼"의 두 층 스토리 */
        label: '전기요금 상승률',
        baseInput: `${pct(p.self.priceRisePctYr)} %/yr`,
        low: { input: `${pct(Math.max(0, p.self.priceRisePctYr - 1))} %/yr`, value: rerun({}, { ...p, self: { ...p.self, priceRisePctYr: Math.max(0, p.self.priceRisePctYr - 1) } }) },
        high: {
          input: `${pct(Math.max(8, p.self.priceRisePctYr + 1))} %/yr (실측 추세)`,
          value: rerun({}, { ...p, self: { ...p.self, priceRisePctYr: Math.max(8, p.self.priceRisePctYr + 1) } }),
        },
      },
      {
        /* 비대칭 −5%/+10% (2026-08-24 사용자 확정 — 한전 판매단가 실데이터 근거):
           산업용 판매단가는 '23→'25 +9.41%·+8.16%로 **오르기만 했다** — 내린 건 일반용 −0.17% 하나(사실상 0).
           그래서 상방은 +10%(실측 인상 추세), 하방은 요금 인하가 아니라 **시간대 개편이 태양광에 불리해지는
           리스크**('26.8 개편이 가중평균을 실제로 낮춘 전례)만 −5%로 남긴다 */
        label: '전력량 단가',
        baseInput: `${pct(rate.energyKrwKwh, 1)} 원/kWh`,
        low: { input: `${pct(rate.energyKrwKwh * 0.95, 1)} 원/kWh (−5%)`, value: rerun({}, p, { rate: { ...rate, energyKrwKwh: rate.energyKrwKwh * 0.95 } }) },
        high: { input: `${pct(rate.energyKrwKwh * 1.1, 1)} 원/kWh (+10%)`, value: rerun({}, p, { rate: { ...rate, energyKrwKwh: rate.energyKrwKwh * 1.1 } }) },
      },
    );
  }
  if (p.mode === 'ppa') {
    rows.push({
      label: 'PPA 단가',
      baseInput: `${pct(p.ppa.priceKrwKwh, 1)} 원/kWh`,
      low: { input: `${pct(p.ppa.priceKrwKwh * 0.9, 1)} 원/kWh (−10%)`, value: rerun({}, p, { ppaPrice: p.ppa.priceKrwKwh * 0.9 }) },
      high: { input: `${pct(p.ppa.priceKrwKwh * 1.1, 1)} 원/kWh (+10%)`, value: rerun({}, p, { ppaPrice: p.ppa.priceKrwKwh * 1.1 }) },
    });
  }
  // 영향 큰 순서로
  rows.sort((x, y) => Math.abs(y.high.value - y.low.value) - Math.abs(x.high.value - x.low.value));
  return {
    metric: useMoney ? `${base.years}년 누적 ${p.mode === 'self' ? '절감액' : 'PPA 매출'}` : `${base.years}년 총 발전량`,
    unit: useMoney ? 'krw' : 'mwh',
    base: metricOf(base),
    rows,
  };
}
