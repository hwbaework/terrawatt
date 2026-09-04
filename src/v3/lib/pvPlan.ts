/* 바닥면적 → 설치용량 → 발전량 (BG-01: 건물 세우기의 "정보" 부분)

   ★ 2026-08-24 사용자 확정 — 모듈 개념을 걷어냈다:
       · 모듈 선택 / 모듈 1장 소요면적 / 장수 표시 없음(필요 없다).
       · **설치용량(kW) = 지붕 가용면적(㎡) ÷ 12** (= 12㎡/kW 단일 규칙). 모듈 사양과 무관하게 면적만으로 낸다.
       · 발전량(kWh, 1년차) = 설치용량 × 일평균 발전시간 × 365.
     (이전 v0.4까지는 모듈 장수 × 장당 출력으로 용량을 냈지만, 실무는 면적÷12로 충분하다는 판단)
   숫자 출처:
     · 일평균 발전시간 3.82 h/일(울산미포, 시스템 손실 반영 환산치), 모듈 효율감소 0.5 %/yr
       → RMS 태양광 사업성 시뮬레이터 폼의 기본값(2026-08-19 사용자 화면). */

/** 설치용량 환산 — 지붕 가용면적(㎡) ÷ 이 값(㎡/kW) = 설치용량(kW). 2026-08-24 사용자 확정: 12 단일 규칙 */
export const M2_PER_KW = 12;

/* ── 사업 조건(사업성 시뮬레이터 폼과 같은 항목) ─────────────────────────────
   기준 = RMS 태양광 사업성 시뮬레이터 화면(2026-08-19 사용자 스크린샷) + 엑셀 v0.4 G6(요금제 고압A/B, 요금기준 25.4 기준/개편)
        + 엑셀 G16(PPA 계약정보: 수요기업, PPA 단가, 계약유형 직접/제3자, 계약기간).
   ⚠️ 여기엔 **입력값과 사칙연산(총사업비·국비·소비자 부담)** 만 있다.
      요금제 단가표로 절감액·회수기간을 내는 계산 엔진은 플랫폼 시뮬레이터 쪽 — 연결 자리만 둔다. */

export type PvMode = 'self' | 'ppa';
export const PV_MODE_LABEL: Record<PvMode, string> = { self: '자가소비용', ppa: 'OnSite PPA' };

/* ── 한전 산업용 요금제 구조 (한전 전기요금표, 2026-08-19 사용자·나 확인) ──
     종별(계약전력으로 갈림) → 전압 → 선택요금
       산업용(갑)Ⅰ : 계약전력 300kW 미만            저압 / 고압A(Ⅰ·Ⅱ) / 고압B(Ⅰ·Ⅱ)
       산업용(갑)Ⅱ : 300kW 미만, 시간대별 계량 고객   고압A / 고압B — 선택 Ⅰ·Ⅱ   ('26.8 표 확인: Ⅲ 없음)
       산업용(을)   : 계약전력 300kW 이상            고압A / 고압B / 고압C — 각각 선택 Ⅰ·Ⅱ·Ⅲ
     선택Ⅰ = 기본요금 낮고 전력량요금 높음 / Ⅱ·Ⅲ = 기본요금 높고 전력량요금 낮음(이용률 높은 고객에 유리)
     사업성 시뮬레이터 화면의 "고압A 선택II"는 산업용(을) 전제(헤더에 "한전 산업용(을)"). */
export const TARIFF_CLASSES = ['산업용(갑)Ⅰ', '산업용(갑)Ⅱ', '산업용(을)'] as const;
export type TariffClass = (typeof TARIFF_CLASSES)[number];
export const TARIFF_CLASS_NOTE: Record<TariffClass, string> = {
  '산업용(갑)Ⅰ': '계약전력 300kW 미만',
  '산업용(갑)Ⅱ': '300kW 미만 · 시간대별 계량',
  '산업용(을)': '계약전력 300kW 이상',
};
/** 종별 → 전압 → 선택요금 목록('' = 선택 없음, 저압) */
export const TARIFF_TREE: Record<TariffClass, Record<string, string[]>> = {
  '산업용(갑)Ⅰ': { 저압: [''], 고압A: ['선택Ⅰ', '선택Ⅱ'], 고압B: ['선택Ⅰ', '선택Ⅱ'] },
  '산업용(갑)Ⅱ': { 고압A: ['선택Ⅰ', '선택Ⅱ'], 고압B: ['선택Ⅰ', '선택Ⅱ'] },
  '산업용(을)': {
    고압A: ['선택Ⅰ', '선택Ⅱ', '선택Ⅲ'],
    고압B: ['선택Ⅰ', '선택Ⅱ', '선택Ⅲ'],
    고압C: ['선택Ⅰ', '선택Ⅱ', '선택Ⅲ'],
  },
};
/** 요금제 한 줄 이름 — 화면·단가표 키에 쓴다. 예) "산업용(을) 고압A 선택Ⅱ" */
export const tariffLabel = (t: { tariffClass: string; tariffVoltage: string; tariffOption: string }) =>
  [t.tariffClass, t.tariffVoltage, t.tariffOption].filter(Boolean).join(' ');
/** 단가표 기준 — 첫째 = 한전 공식 표(data/kepcoTariff.ts, 사용자 제공 PDF) / 둘째 = 사업성 시뮬레이터 결과에서 역산한 옛 값(비교용, 을 고압A 선택Ⅱ만) */
export const TARIFF_BASES = ["'26.8 시행 전기요금표 (한전)", "'25.4 확정단가 (시뮬레이터 역산)"];
export const PPA_CONTRACT_TYPES = ['직접 PPA', '제3자 PPA'];

export interface PvProject {
  mode: PvMode;
  /** 고객사명 (선택) */
  customer: string;
  /* 자가소비 · 설비/수요기업 */
  self: {
    contractKw: number;
    monthlyKwh: number;
    /** 한전 요금제 — 종별/전압/선택 (TARIFF_TREE) */
    tariffClass: TariffClass;
    tariffVoltage: string;
    tariffOption: string;
    tariffBasis: string;
    priceRisePctYr: number;
    peakCutPct: number;
    /** 분석기간(년) — 없으면 20 (2026-08-24: 발전량 시뮬에 기간 선택 복원용) */
    analysisYears?: number;
  };
  /* OnSite PPA · 계약 (엑셀 G16) */
  ppa: {
    buyer: string;
    priceKrwKwh: number;
    contractType: string;
    years: number;
  };
  /* 사업비 (국비 70%) */
  cost: {
    unitKrwPerKw: number;
    extraKrw: number;
    subsidyPct: number;
    omPctYr: number;
  };
}

/** 폼 기본값 = 스크린샷의 값 그대로. PPA 단가만 호출부가 시설 사양에서 넣는다 */
export function defaultProject(ppaPriceKrwKwh = 0): PvProject {
  return {
    mode: 'self',
    customer: '',
    self: {
      contractKw: 10_000,
      monthlyKwh: 3_000_000,
      tariffClass: '산업용(을)',
      tariffVoltage: '고압A',
      tariffOption: '선택Ⅱ',
      tariffBasis: TARIFF_BASES[0],
      priceRisePctYr: 2.5,
      peakCutPct: 30,
    },
    ppa: { buyer: '', priceKrwKwh: ppaPriceKrwKwh, contractType: PPA_CONTRACT_TYPES[0], years: 20 },
    cost: { unitKrwPerKw: 1_350_000, extraKrw: 20_000_000, subsidyPct: 70, omPctYr: 1.0 },
  };
}

/** 사업비 산정 — 폼 각주 그대로:
    총사업비 = 용량 × 설치단가(순수 설치비) + 추가 시공비 · 국비 = 순수 설치비 × 지원율(백만원 미만 절삭)
    · 소비자 부담 = 총사업비 − 국비 · 연간 O&M = 총사업비 × O&M% */
export function costOf(capacityKw: number, c: PvProject['cost']) {
  const install = capacityKw * c.unitKrwPerKw;
  const total = install + c.extraKrw;
  const subsidy = Math.floor((install * c.subsidyPct) / 100 / 1_000_000) * 1_000_000;
  return { install, total, subsidy, owner: total - subsidy, omYear: (total * c.omPctYr) / 100 };
}

/** 배치·발전 가정값 — 사업성 시뮬 폼과 같은 항목이라 나중에 그 폼과 한 값으로 묶는다 */
export interface PvAssumption {
  /** 일평균 발전시간 (h/일) */
  hoursPerDay: number;
  /** 모듈 효율감소 (%/yr, 2년차~) */
  degradePctYr: number;
}
export const DEFAULT_PV_ASSUMPTION: PvAssumption = { hoursPerDay: 3.82, degradePctYr: 0.5 };

/** 세운 건물에 붙는 태양광 계획 — 화면·목록·다음 단계(사업성 시뮬)가 이걸 받는다 */
export interface PvPlan {
  /** 지붕 가용면적 (㎡) */
  areaM2: number;
  assumption: PvAssumption;
  /** 설치용량 (kW) = 면적 ÷ M2_PER_KW(12) */
  capacityKw: number;
  /** 1년차 연간 발전량 (kWh) = 용량 × 일평균 발전시간 × 365 */
  yearKwh: number;
}

export function planPv(areaM2: number, a: PvAssumption = DEFAULT_PV_ASSUMPTION): PvPlan {
  const capacityKw = areaM2 / M2_PER_KW;
  const yearKwh = capacityKw * a.hoursPerDay * 365;
  return { areaM2, assumption: { ...a }, capacityKw, yearKwh };
}

/** 자가소비 비교 — 월평균 사용량만 넣으면 발전량이 그중 얼마인지 (사칙연산만).
    계약전력은 화면에서 뺐다(2026-08-19) — 사용량으로 자연스럽게 계산되면 충분 */
export function selfUseRatio(plan: PvPlan, self: PvProject['self']) {
  const yearUseKwh = self.monthlyKwh * 12;
  return {
    yearUseKwh,
    /** 자급률(%) = 연 발전량 ÷ 연 사용량 */
    supplyPct: yearUseKwh > 0 ? (plan.yearKwh / yearUseKwh) * 100 : 0,
    /** 자가소비율(%) = 발전량 중 실제로 자체 소비되는 몫. 월평균 기준 — 사용량이 발전량보다 크면 100.
        (왜 사용량이 필요한가: 발전이 사용보다 많으면 남는 전기는 절감이 안 되기 때문 — 절감액은 이 몫에만 붙는다) */
    selfUsePct: plan.yearKwh > 0 ? (Math.min(plan.yearKwh / 12, self.monthlyKwh) / (plan.yearKwh / 12)) * 100 : 0,
  };
}

/** n년차 발전량 — 2년차부터 매년 degradePctYr 만큼 줄어든다 */
export function yearKwhAt(plan: PvPlan, year: number): number {
  return plan.yearKwh * Math.pow(1 - plan.assumption.degradePctYr / 100, Math.max(0, year - 1));
}
