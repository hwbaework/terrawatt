/* v0.3 시설 목록표 — 지도에 세울 것을 여기 한 곳에서 관리한다.
   **새 시설 추가 = 이 배열에 한 줄 추가.** 3D 모델(glb)이 있으면 model을 채우면 지도에 건물이 서고,
   없으면(모델 구하기 전) 자리만 잡아둘 수 있다.

   v0.3은 "한 회사 타겟" — 한일튜브 부지를 디테일하게 만든 뒤 넓혀간다.
   전력 흐름 체인(발전소 → 송전 → 변전소 → 수용가 + ESS·센서)은 실좌표가 확정되는 대로 추가.

   좌표·회전·크기는 v0.2에서 위성사진 대조 + 배치 조절 패널로 직접 맞춘 확정값이다. */

export type FacilityType = '발전소' | '변전소' | '수용가' | 'ESS' | '센서' | '송전탑';

export interface FacilityModel {
  url: string; // /models/*.glb
  targetSizeM?: number; // 최대 변 목표 크기(m) — 모델마다 단위가 제각각이라 이 크기로 자동 맞춤
  rotationDeg?: number; // 정면 방향 보정
  natural?: boolean; // true = 실물 미터 단위로 만든 모델이라 크기 그대로 씀

  /* ── 브이월드 3D 화면용 ──
     그쪽 엔진은 바운딩박스 자동 맞춤이 없어서 **배율(scale)로 직접** 맞춰야 한다.
     모델이 실측 미터 단위면 1이 맞고, 어긋나면 이 값만 고치면 된다. */
  scale3d?: number;
  /** 브이월드 3D에서의 정면 방향(도).
      두 엔진은 회전 기준이 달라서 같은 숫자를 넣어도 다르게 보인다.
      비워두면 위 rotationDeg 를 그대로 쓴다 — 어긋날 때만 여기에 따로 적는다. */
  rotation3dDeg?: number;
  /** 지면 기준 높이(m). 모델 원점이 바닥이 아니면 여기서 보정 */
  elevationM?: number;
}

export interface Facility {
  id: string; // 레이어 id에 쓰임 — 영문 소문자/숫자/하이픈
  type: FacilityType;
  name: string;
  lng: number;
  lat: number;
  model?: FacilityModel;
}

export const FACILITIES: Facility[] = [
  // 타겟 회사 — 서현진 과장님 실측 모델 (원본 78.8×22×126.4m)
  // 울산 남구 부곡동 273-6 (Plus Code G84J+49)
  {
    id: 'hanil-tube',
    type: '수용가',
    name: '한일튜브',
    // 2026-07-29 사용자가 배치 조절 패널로 직접 맞춘 확정값
    lng: 129.33089,
    lat: 35.50522,
    // 원본 실측 78.8×22×126.4m — 미터 단위로 만들어진 모델이라 브이월드 3D에선 배율 1
    model: { url: '/models/hanil-tube-opt.glb', targetSizeM: 115, rotationDeg: -65, scale3d: 1 },
  },
  // 한일튜브 ESS는 2026-07-29 사용자 지시로 내림(모델이 변전소 임시 대용이었음).
  // 컨테이너형 ESS 모델을 구하면 여기에 다시 추가하면 된다 — glb는 public/models에 보관 중.
  // {
  //   id: 'ess-hanil',
  //   type: 'ESS',
  //   name: '한일튜브 ESS',
  //   lng: 129.33074,
  //   lat: 35.5045,
  //   model: { url: '/models/SubstationBig-opt.glb', targetSizeM: 18, rotationDeg: 65, scale3d: 1 },
  // },
];

/** 모델이 있어 지도에 세울 수 있는 시설만 */
export const MODELED_FACILITIES = FACILITIES.filter((f) => f.model);
