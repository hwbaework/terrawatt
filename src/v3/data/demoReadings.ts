/* ⚠️ 예시(가) 데이터 — 화면 모양을 보기 위한 것.

   실제 연동이 되면 **이 파일만 갈아끼우면 된다.** 화면 코드는 이 모양 그대로 값을 받는다.
   숫자는 울산미포 모니터링 화면의 한 시점을 참고해 만든 것이라 실제와 비슷하지만,
   고정값이므로 시간이 지나도 변하지 않는다. */

/* 인버터 1대 — LASEE 실제 수집 필드(2026-08-26 사용자 제공 스키마)에서 의미 있는 것만.
   ⚠️ %(전일·전년 대비)는 쓰지 않는다 — 비교군이 '어제의 나'인데 어제 맑고 오늘 흐리면 40%도 벌어진다.
      비교가 아니라 **사실**(용량·전원/통신·현재 발전량·고장여부)만 보여준다(사용자 확정). */
export interface InverterReading {
  id: string;
  /** 인버터 용량(kW) — 결선된 모듈 용량 또는 인버터 정격. 여기선 정격 110kW.
      ⚠️ 모듈 수·모델 같은 **불변 스펙은 specs.ts(PLANT_SPECS)** 에 있다 — 여긴 계측값만 */
  ratedKw: number;
  /** DC 전력(PV 전력, kW) — 현재 */
  dcKw: number;
  /** AC 전력(계통 전력, kW) — 현재 발전량 */
  acKw: number;
  /** 일 발전량(kWh) */
  todayKwh: number;
  /** 누적 발전량(kWh) */
  totalKwh: number;
  /** RTU↔인버터 통신 정상 여부(0 정상 → true) */
  comm: boolean;
  /** 고장여부 — 정상이면 빈 문자열, 아니면 상태 문자열(예: 'Checking') */
  fault: string;
  /** 종합 정상 여부 — ⚠️ 화면 색에는 더 이상 쓰지 않는다(2026-08-31 사용자 확정):
      순간 출력이 낮은 건 구름·새·지붕 방향일 수 있어 색을 칠하지 않는다.
      발전소 상세의 점 = 통신(comm), 예지보전의 점 = 5일 지속 결손 이벤트(INVERTER_HISTORY.verdict) */
  ok: boolean;
}

export interface PlantReading {
  /** 설비 상태 — 이름 앞 점으로만 표시한다 */
  rtuPower: boolean;
  rtuComm: boolean;
  inverterComm: string; // 예: '4/4'
  /** 발전 현황 */
  currentKw: number;
  loadPercent: number;
  todayKwh: number;
  todayHours: number;
  totalKwh: number;
  capacityKw: number;
  inverters: InverterReading[];
  /** 금일 누적 발전량 추이 — [시각(HH:MM), 누적 kWh] */
  todayCurve: [string, number][];
}

/** 시설 화면(홈)의 이달 실적 */
export interface FacilityReading {
  monthDemandKwh: number;
  monthReSupplyKwh: number;
  peakKw: number;
  reAchievedPercent: number;
}

export const FACILITY_DEMO: FacilityReading = {
  monthDemandKwh: 410500,
  monthReSupplyKwh: 119800,
  peakKw: 968,
  reAchievedPercent: 22.24,
};

/* 시설 화면의 "발전 실적" 카드 4장 — 예시값 (실연동 시 교체).
   ★ 서로 계산이 맞게 만들었다(설치용량 429.44kW — 2026-08-24 사용자 재확정) — 지어내더라도 아귀는 맞아야 한다:
     가동률 62.5% = 현재 출력 268.4 ÷ 429.44 (PLANT_DEMO 와 같은 값)
     이번달 49.0MWh = 8월 1~24일 누적 = 인버터 4대 이번달 합 49,000kWh (INVERTER_HISTORY, INV-002 급락 반영)
     이번달 절감액 7,722,400원 = 49,000kWh × 157.6원 → 772.2만원 */
export interface FacilityGenReading {
  /** 현재 출력 (kW) */
  currentKw: number;
  /** 가동률 (%) = 현재 출력 ÷ 설치용량 */
  loadPercent: number;
  /** 오늘 누적 발전량 (kWh) */
  todayKwh: number;
  /** 이번달 누적 발전량 (MWh) */
  monthMwh: number;
  /** 이번달 절감액 (만원) = 이번달 발전량(kWh) × 157.6원 */
  monthSaveManwon: number;
}
/* 연차별 실측 발전량(MWh) — 예시값(실연동 시 LASEE 연별 이력으로 교체).
   ★ 가동 스토리: 2024-01 가동 시작 → 지금(2026-08)은 3차년 진행 중. 지나간 1·2차년만 실측이 있고 3차년부터는 null.
   값의 근거(전부 서로 검산됨 — 연 예측 598.8MWh = 429.44kW × 3.82h × 365):
     1차년 597.5 = 예측 598.8 대비 −0.2% (정상 범위)
     2차년 582.7 = 예측(효율감소 반영 595.8) 대비 −2.2% (날씨 나쁜 해 + 오염)
     누적 정합: 597,500 + 582,700 + 올해 1~8월 427,200(아래 월별 실측 합) = 1,607,400 = PLANT_DEMO.totalKwh */
export const FACILITY_YEAR_ACTUAL_MWH: (number | null)[] = [
  597.5, 582.7, ...Array(18).fill(null),
];

/* 월별 실측 발전량(올해, kWh) — 예시값(실연동 시 LASEE 월별 이력으로 교체).
   ★ 지금이 8월이므로 실측은 1~8월까지만 — 9월부터는 null(아직 안 온 달, 차트에 점을 안 찍는다).
   값의 근거: 예측(월 32~75k)보다 3~8% 낮게 — 오염·음영 등 현실 손실 반영.
   8월(49,000)은 한 달치가 아니라 24일까지 누적이라 예측(≈66k)보다 낮은 게 정상 */
export const FACILITY_MONTH_ACTUAL_KWH: (number | null)[] = [
  31800, 42600, 46500, 65000, 62800, 59800, 69700, 49000, null, null, null, null,
];

export const FACILITY_GEN_DEMO: FacilityGenReading = {
  currentKw: 268.4,
  loadPercent: 62.5,
  todayKwh: 1202.4,
  monthMwh: 49.0,
  monthSaveManwon: 772.2,
};

/* ── 예지보전용: 인버터별 발전량 비교(DT-02 기준, 2026-08-26 사용자 확정) ──
   비교 기준을 **시계열(전월·작년)에서 동형 인버터**로 바꿨다.
   이유: 작년과 올해 날씨가 같다는 보장이 없어 시계열 비교는 근거가 약하다.
         같은 지붕의 인버터들은 **같은 날씨·같은 해**를 받으므로, 1대만 처지면 그건 날씨가 아니라 설비다.
   기준선 = 같은 지붕 나머지 인버터의 중앙값(median). 기준선 대비 결손이 5일 지속되면 이벤트 알림(DT-02).
   ⚠️ 인버터가 1대뿐인 지붕은 이웃 사이트 동형 설비와 비교(POC 범위 밖 — 화면 설계서에만 명시).
   실연동 시 LASEE 인버터별 일/월 발전량으로 교체. */
export interface InverterHistory {
  id: string;
  /** 이번 달 발전량 (kWh) */
  thisMonthKwh: number;
  /** 지난달 발전량 (kWh) — 참고용 보관 */
  lastMonthKwh: number;
  /** 작년 같은 달 발전량 (kWh) — 참고용 보관 */
  lastYearKwh: number;
  /** 연평균 저하율 (%/년) — 이력 추세에서 산출 */
  yearlyDeclinePercent: number;
  /** AI 진단 결과 */
  verdict: '정상' | '점검 필요' | '교체 검토';
  /** 예상 교체 검토 시기 (저하 추세 연장) — 급락 등으로 추정 불가면 생략 */
  replaceBy?: string;
  /** 기준선(동형 중앙값) 대비 결손이 며칠째 지속되는지 — 5일 이상이면 이벤트(DT-02). 정상이면 생략 */
  belowPeerDays?: number;
  note?: string;
}

/** 인버터 표기 — INV-001 → "인버터 #1" (2026-08-26 사용자 확정). 화면 전체 공통 */
export const invLabel = (id: string): string => `인버터 #${String(id).replace(/\D/g, '').replace(/^0+/, '') || id}`;

/** 동형 기준선 — 자신을 뺀 같은 지붕 인버터들의 중앙값(kWh). 비교 대상이 없으면 null */
export function peerBaselineKwh(id: string, list: InverterHistory[] = INVERTER_HISTORY): number | null {
  const peers = list.filter((h) => h.id !== id).map((h) => h.thisMonthKwh).sort((a, b) => a - b);
  if (peers.length === 0) return null;
  const m = Math.floor(peers.length / 2);
  return peers.length % 2 ? peers[m] : (peers[m - 1] + peers[m]) / 2;
}

/* ★ 429.44kW(인버터당 110kW) 기준(2026-08-24 사용자 재확정) — 인버터당 정상 월 발전량 ≈ 16~17,500kWh.
   이번달(8월, 24일까지 진행) 합 49,000kWh — INV-002 급락 반영, 시설 화면 "이번달 누적 발전량"·월별 실측 8월과 같아야 한다.
   지난달(7월) 합 69,700 = 월별 실측 7월과 정합 */
export const INVERTER_HISTORY: InverterHistory[] = [
  {
    id: 'INV-001',
    thisMonthKwh: 15200,
    lastMonthKwh: 17600,
    lastYearKwh: 16700,
    yearlyDeclinePercent: 1.2,
    verdict: '정상',
    replaceBy: '2031년',
  },
  {
    id: 'INV-002',
    thisMonthKwh: 4100,
    lastMonthKwh: 16900,
    lastYearKwh: 16300,
    yearlyDeclinePercent: 1.4,
    verdict: '점검 필요',
    belowPeerDays: 5, // 같은 지붕 다른 인버터는 정상인데 이것만 5일째 결손 → 날씨 아님, 설비 이상(DT-02 이벤트 조건)
    note: '점진적 노화가 아니라 급락 — 스트링 단선·그늘·고장 의심',
  },
  {
    id: 'INV-003',
    thisMonthKwh: 14900,
    lastMonthKwh: 17700,
    lastYearKwh: 16700,
    yearlyDeclinePercent: 1.5,
    verdict: '정상',
    replaceBy: '2030년',
  },
  {
    id: 'INV-004',
    thisMonthKwh: 14800,
    lastMonthKwh: 17500,
    lastYearKwh: 16500,
    yearlyDeclinePercent: 2.1,
    verdict: '정상',
    replaceBy: '2029년',
  },
];

/* ★ 설치용량 429.44kW 기준(2026-08-24 사용자 재확정 — 한때 99.84로 갔다가 되돌림).
   검산: 가동률 62.5% = 268.4 ÷ 429.44 / 금일 발전시간 2.8h = 1,202.4 ÷ 429.44
        누적 1,607,400kWh = 1차년 실측 597,500 + 2차년 582,700 + 올해(3차년) 1~8월 427,200 (FACILITY_YEAR/MONTH_ACTUAL 과 정합)
        인버터 합 = 현재 출력 268.4 · 금일 발전 1,202.4 (INV-002만 낮음 — 예지보전의 급락 스토리와 일치) */
export const PLANT_DEMO: PlantReading = {
  rtuPower: true,
  rtuComm: true,
  inverterComm: '4/4',

  currentKw: 268.4,
  loadPercent: 62.5,
  todayKwh: 1202.4,
  todayHours: 2.8,
  totalKwh: 1607400,
  capacityKw: 429.44,

  /* 인버터 4대(도면 INVERTER 구성 = ASW110K-LT 110kW × 4, 모듈 168/168/168/167장 = 671장).
     현재 합 = AC 268.4 · 일 1202.4 (검산 정합). 누적 합 = 1,607,400 (402,300+398,900+404,100+402,100).
     INV-002만 급락 — 고장여부 'Checking', 출력·일 발전량이 나머지의 1/4 (스트링 단선·그늘·고장 의심) */
  inverters: [
    { id: 'INV-001', ratedKw: 110, dcKw: 93.3, acKw: 91.5, todayKwh: 376.8, totalKwh: 402300, comm: true, fault: '', ok: true },
    { id: 'INV-002', ratedKw: 110, dcKw: 22.9, acKw: 22.4, todayKwh: 94.2, totalKwh: 398900, comm: true, fault: 'Checking', ok: false },
    { id: 'INV-003', ratedKw: 110, dcKw: 79.1, acKw: 77.6, todayKwh: 368.4, totalKwh: 404100, comm: true, fault: '', ok: true },
    { id: 'INV-004', ratedKw: 110, dcKw: 78.4, acKw: 76.9, todayKwh: 363.0, totalKwh: 402100, comm: true, fault: '', ok: true },
  ],

  // 아침부터 쌓여 온 누적 발전량 — 15:00 현재 1,202.4 (해가 뜨면 완만하게 올라가다 오후에 둔해지는 모양)
  todayCurve: [
    ['06:00', 0],
    ['07:00', 26],
    ['08:00', 103],
    ['09:00', 235],
    ['10:00', 419],
    ['11:00', 611],
    ['12:00', 795],
    ['13:00', 957],
    ['14:00', 1094],
    ['15:00', 1202.4],
  ],
};
