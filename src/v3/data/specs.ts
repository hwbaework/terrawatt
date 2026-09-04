/* 시설 스펙 — **안 변하는 정보**만 여기 둔다.

   v0.2에서 세운 원칙을 그대로 잇는다:
     · 스펙(계약전력·주소·단가처럼 고정된 값) = 표시한다
     · 계측값(이달 수요, 최대수요, 발전량처럼 시간에 따라 변하는 값) = **절대 지어내지 않는다**
       실데이터가 연결되기 전까지는 자리만 잡고 "연동 후"라고 밝힌다.

   `confirmed: false` = 아직 계약서/고지서로 확정하지 않은 값. 화면에 그렇게 표시된다. */

export interface FacilitySpec {
  type: string;
  address: string;
  /** 계약전력 (kW) */
  contractKw?: number;
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
    type: '자가소비',
    address: '울산광역시 남구 사평로 203 (부곡동)',
    contractKw: 1200,
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
  /** 결선된 모듈 수(장) — 도면 INVERTER 구성 실측 */
  modules: number;
}

export interface ModuleSpec {
  /** 모델명 */
  model: string;
  /** 장당 출력(Wp) */
  wp: number;
  /** 실측 치수 L×H×D (mm) */
  sizeMm: [number, number, number];
}

export interface PlantSpec {
  /** 설비 용량(kW) */
  capacityKw: number;
  type: string;
  /** 인버터 모델명 — 4대 동일 */
  inverterModel: string;
  inverters: InverterSpec[];
  /** 태양전지 모듈 스펙 */
  module: ModuleSpec;
  /** LASEE 수집 주기 안내 */
  collectPeriod: string;
}

export const PLANT_SPECS: Record<string, PlantSpec> = {
  'hanil-tube': {
    // ★ 429.44kW — 사용자 재확정(2026-08-24 최종). 한때 건물 목록표의 99.84로 고쳤다가 되돌림
    //   (99.84는 한일튜브 전체 용량이 아니었음). 인버터 110kW×4(=440)와도 앞뒤가 맞는다
    capacityKw: 429.44,
    type: '태양광',
    /* ★ 도면 실측(한일튜브 태양광_(02.06).pdf, 2026-08-31 확인):
         INVERTER 구성 = ASW110K-LT 110kW × 4대, 모듈 168/168/168/167장(합 671장 = 429.44kWp)
         태양전지모듈 = S-Energy 640W (L2,465 × H1,133 × D30mm)
       화재 피해·예지보전 등 여러 화면이 이 값을 공유한다 — 여기만 고치면 전부 따라온다 */
    inverterModel: 'ASW110K-LT',
    inverters: [
      { id: 'INV-001', ratedKw: 110, modules: 168 },
      { id: 'INV-002', ratedKw: 110, modules: 168 },
      { id: 'INV-003', ratedKw: 110, modules: 168 },
      { id: 'INV-004', ratedKw: 110, modules: 167 },
    ],
    module: { model: 'S-Energy 640W', wp: 640, sizeMm: [2465, 1133, 30] },
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
