/* 설비 등록 정보(스펙) — 시간에 따라 변하지 않는 고정값.
   계측값(현재 발전량·충전율 등 실시간으로 변하는 것)은 여기 두지 않는다. LASEE 연동 후 별도 표시.

   ⚠️ 용량 숫자는 아직 실제 확인 전 임시값 — 실제 스펙 받으면 이 표만 고치면 전 화면에 반영됨. */

export interface PlantSpec {
  capacityKw: number; // 설비 용량 (kW)
  type: string; // 설비 유형
  address: string; // 소재지
  confirmed: boolean; // true = 실제 확인된 값
}

export const PLANT_SPECS: Record<number, PlantSpec> = {
  17514: { capacityKw: 998, type: '지붕형 태양광', address: '울산 남구 부곡동 273-6', confirmed: false },
  17511: { capacityKw: 870, type: '지붕형 태양광', address: '울산 남구', confirmed: false },
  17558: { capacityKw: 780, type: '지붕형 태양광', address: '울산 남구', confirmed: false },
  17512: { capacityKw: 690, type: '지붕형 태양광', address: '울산 남구', confirmed: false },
  17513: { capacityKw: 600, type: '지붕형 태양광', address: '울산 남구 용잠로74번길 48', confirmed: false },
  17515: { capacityKw: 540, type: '지붕형 태양광', address: '울산 울주군', confirmed: false },
};

export const ESS_SPEC = {
  name: '한일튜브 ESS',
  capacityMwh: 2.0, // 저장 용량
  powerMw: 1.0, // 정격 출력
  address: '울산 남구 부곡동 273-6',
  confirmed: false,
};

/* ── 표시용 고정 스냅샷 ──
   화면 구성을 보여주기 위한 값. **절대 시간에 따라 변하지 않는다**(타이머·계산 없음).
   LASEE 실시간 연동이 열리면 이 값들을 실측값으로 교체한다. */

export interface PlantReading {
  currentOutputKw: number;
  dailyEnergyKwh: number;
  status: '정상 발전' | '점검' | '정지';
}

export const PLANT_READINGS: Record<number, PlantReading> = {
  17514: { currentOutputKw: 627, dailyEnergyKwh: 3180, status: '정상 발전' },
  17511: { currentOutputKw: 542, dailyEnergyKwh: 2760, status: '정상 발전' },
  17558: { currentOutputKw: 489, dailyEnergyKwh: 2480, status: '정상 발전' },
  17512: { currentOutputKw: 431, dailyEnergyKwh: 2190, status: '정상 발전' },
  17513: { currentOutputKw: 374, dailyEnergyKwh: 1900, status: '정상 발전' },
  17515: { currentOutputKw: 336, dailyEnergyKwh: 1710, status: '정상 발전' },
};

export const ESS_READING = {
  soc: 82, // 충전율 %
  mode: '충전' as const,
  powerMw: 0.5, // 현재 충방전 출력
  storedMwh: 1.63,
  chargedTodayMwh: 1.0,
  dischargedTodayMwh: 0,
  tempC: 27,
  fireOk: true,
};

/** 설비 상태 목록 (고정) */
export const EQUIPMENT_STATUS = [
  { name: '인버터', ok: true },
  { name: 'ESS 배터리', ok: true },
  { name: '패널 어레이', ok: true },
  { name: '화재 감지', ok: true },
];

/** kW → 보기 좋은 표기 (1,000kW 이상은 MW) */
export function formatCapacity(kw: number): string {
  return kw >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${kw} kW`;
}
