/* 시설 스펙 — **안 변하는 정보**만 여기 둔다.

   v0.2에서 세운 원칙을 그대로 잇는다:
     · 스펙(계약전력·주소·단가처럼 고정된 값) = 표시한다
     · 계측값(이달 수요, 최대수요, 발전량처럼 시간에 따라 변하는 값) = **절대 지어내지 않는다**
       실데이터가 연결되기 전까지는 자리만 잡고 "연동 후"라고 밝힌다.

   `confirmed: false` = 아직 계약서/고지서로 확정하지 않은 값. 화면에 그렇게 표시된다. */

export interface FacilitySpec {
  /** 디지털트윈 모델 식별자 — 화면 상단 배지 */
  dtModel: string;
  type: string;
  address: string;
  /** 계약전력 (kW) */
  contractKw?: number;
  /** 공급 방식 — 직접 PPA / 제3자 PPA */
  supply?: string;
  /** PPA 단가 (원/kWh) + 적용 시작 */
  ppaPriceKrwKwh?: number;
  ppaPriceFrom?: string;
  /** 계약상 재생에너지 비율(%) */
  rePercent?: number;
  status?: string;
  /** RE100 목표(%) — 진행 막대의 기준 */
  reTargetPercent?: number;
  /** 위 값들이 계약서로 확정된 것인지 */
  confirmed: boolean;
}

export const FACILITY_SPECS: Record<string, FacilitySpec> = {
  'hanil-tube': {
    dtModel: 'dt:model:haniltube',
    type: '수용가 공장 (지붕태양광)',
    address: '울산광역시 남구 사평로 203 (부곡동)',
    contractKw: 1200,
    supply: 'PPA (발전량 × 단가)',
    ppaPriceKrwKwh: 92.6,
    ppaPriceFrom: '2026.4~',
    rePercent: 18.7,
    status: '가동 중',
    reTargetPercent: 30,
    // ⚠️ 참고 화면에서 옮겨온 값 — 계약서·고지서로 대조해 확정할 것
    confirmed: false,
  },
};

/* ── 발전 설비 스펙 ──
   출처: 울산미포 모니터링 화면(발전소 상세, LASEE 연동)에서 확인.
   설비 용량·인버터 구성은 **시간에 따라 변하지 않으므로 지금도 표시할 수 있다.**
   (현재 출력·발전량 같은 계측값은 연동 전까지 비워 둔다) */

export interface InverterSpec {
  id: string;
  /** 정격 용량(kW) */
  ratedKw: number;
}

export interface PlantSpec {
  /** 설비 용량(kW) */
  capacityKw: number;
  type: string;
  inverters: InverterSpec[];
  /** LASEE 수집 주기 안내 */
  collectPeriod: string;
}

export const PLANT_SPECS: Record<string, PlantSpec> = {
  'hanil-tube': {
    capacityKw: 429.44,
    type: '태양광',
    inverters: [
      { id: 'INV-001', ratedKw: 110 },
      { id: 'INV-002', ratedKw: 110 },
      { id: 'INV-003', ratedKw: 110 },
      { id: 'INV-004', ratedKw: 110 },
    ],
    collectPeriod: 'LASEE 60초 간격',
  },
};

/** 3D 모델 자체의 제원 — 설비 관점 카드에 쓴다 */
export interface ModelSpec {
  source: string;
  /** 원본 실측 치수 (가로×높이×세로, m) */
  dimensionsM?: [number, number, number];
}

export const MODEL_SPECS: Record<string, ModelSpec> = {
  'hanil-tube': {
    source: '서현진 과장 실측 모델',
    dimensionsM: [78.8, 22, 126.4],
  },
};
