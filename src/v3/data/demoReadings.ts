/* ⚠️ 예시(가) 데이터 — 화면 모양을 보기 위한 것.

   실제 연동이 되면 **이 파일만 갈아끼우면 된다.** 화면 코드는 이 모양 그대로 값을 받는다.
   숫자는 울산미포 모니터링 화면의 한 시점을 참고해 만든 것이라 실제와 비슷하지만,
   고정값이므로 시간이 지나도 변하지 않는다. */

export interface InverterReading {
  id: string;
  ratedKw: number;
  dcKw: number;
  acKw: number;
  todayKwh: number;
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

/* ── 예지보전용: 인버터별 발전량 비교군 ──
   "얼마나 나빠졌나"는 비교 대상이 있어야 보인다 — 저번달, 그리고 작년 같은 달.
   실연동 시 LASEE 월별 이력으로 교체. */
export interface InverterHistory {
  id: string;
  /** 이번 달 발전량 (kWh) */
  thisMonthKwh: number;
  /** 지난달 발전량 (kWh) */
  lastMonthKwh: number;
  /** 작년 같은 달 발전량 (kWh) */
  lastYearKwh: number;
  /** 연평균 저하율 (%/년) — 이력 추세에서 산출 */
  yearlyDeclinePercent: number;
  /** AI 진단 결과 */
  verdict: '정상' | '점검 필요' | '교체 검토';
  /** 예상 교체 검토 시기 (저하 추세 연장) — 급락 등으로 추정 불가면 생략 */
  replaceBy?: string;
  note?: string;
}

export const INVERTER_HISTORY: InverterHistory[] = [
  {
    id: 'INV-001',
    thisMonthKwh: 13900,
    lastMonthKwh: 14200,
    lastYearKwh: 14800,
    yearlyDeclinePercent: 1.2,
    verdict: '정상',
    replaceBy: '2031년',
  },
  {
    id: 'INV-002',
    thisMonthKwh: 4400,
    lastMonthKwh: 12800,
    lastYearKwh: 14100,
    yearlyDeclinePercent: 1.4,
    verdict: '점검 필요',
    note: '점진적 노화가 아니라 급락 — 스트링 단선·그늘·고장 의심',
  },
  {
    id: 'INV-003',
    thisMonthKwh: 14100,
    lastMonthKwh: 14300,
    lastYearKwh: 15000,
    yearlyDeclinePercent: 1.5,
    verdict: '정상',
    replaceBy: '2030년',
  },
  {
    id: 'INV-004',
    thisMonthKwh: 13600,
    lastMonthKwh: 14000,
    lastYearKwh: 14900,
    yearlyDeclinePercent: 2.1,
    verdict: '정상',
    replaceBy: '2029년',
  },
];

export const PLANT_DEMO: PlantReading = {
  rtuPower: true,
  rtuComm: true,
  inverterComm: '4/4',

  currentKw: 104.4,
  loadPercent: 24,
  todayKwh: 2031,
  todayHours: 4.7,
  totalKwh: 285074,
  capacityKw: 429.44,

  inverters: [
    { id: 'INV-001', ratedKw: 110, dcKw: 28.1, acKw: 27.7, todayKwh: 610.9, ok: true },
    { id: 'INV-002', ratedKw: 110, dcKw: 10.3, acKw: 10.3, todayKwh: 190.9, ok: true },
    { id: 'INV-003', ratedKw: 110, dcKw: 31.5, acKw: 31.6, todayKwh: 615.7, ok: true },
    { id: 'INV-004', ratedKw: 110, dcKw: 34.8, acKw: 34.8, todayKwh: 613.5, ok: true },
  ],

  // 아침부터 쌓여 온 누적 발전량 (해가 뜨면 완만하게 올라가다 오후에 둔해지는 모양)
  todayCurve: [
    ['06:00', 0],
    ['07:00', 38],
    ['08:00', 142],
    ['09:00', 330],
    ['10:00', 585],
    ['11:00', 872],
    ['12:00', 1160],
    ['13:00', 1425],
    ['14:00', 1642],
    ['15:00', 1815],
    ['16:00', 1938],
    ['17:00', 2031],
  ],
};
