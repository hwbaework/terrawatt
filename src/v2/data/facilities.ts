/* 시설 목록표 — 지도에 세울 전력망 시설을 여기 한 곳에서 관리한다.
   새 시설 추가 = 이 배열에 한 줄 추가. 3D 모델(glb)이 있으면 model을 채우면
   지도에 건물이 서고, 없으면(모델 구하기 전) 자리만 잡아둘 수 있다.

   전력 흐름 체인: 발전소 → 송전(선) → 변전소 → 수용가
   + 분산에너지: ESS, 일사량 센서 등 (모델 구하는 대로 추가) */

export type FacilityType =
  | '발전소' // 태양광 등 발전 설비
  | '변전소' // 전압 변환 — 공장(수용가)은 변전소를 경유해 전기를 받는다
  | '수용가' // 전기를 쓰는 곳 (공장·기업)
  | 'ESS' // 에너지 저장장치 (분산에너지)
  | '센서' // 일사량 센서 등 계측기
  | '송전탑'; // 송전선 철탑 (지금은 선으로 표현 중)

export interface FacilityModel {
  url: string; // /models/*.glb
  targetSizeM?: number; // 최대 변 목표 크기(m) — 생략 시 buildingLayer 기본값(40m)
  rotationDeg?: number; // 정면 방향 보정
  natural?: boolean; // true = 실물 미터 단위로 만든 모델이라 크기 그대로 (서현진 과장님 모델들)
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
  // 타겟 회사 — 서현진 과장님 모델 (원본 78.8×22×126.4m)
  // 울산 남구 부곡동 273-6 (Plus Code G84J+49) — 최종 배치는 사용자가 조절 패널로 직접 맞춤(2026-07-22)
  {
    id: 'hanil-tube',
    type: '수용가',
    name: '한일튜브',
    lng: 129.33079,
    lat: 35.50515,
    model: { url: '/models/hanil-tube-opt.glb', targetSizeM: 115, rotationDeg: -25 },
  },
  // 울산변전소 (실존, 154kV 배전용) — 한일튜브 북동쪽 1.5km [129.34115, 35.51552]
  // 한전 계통 전기가 여기서 22.9kV로 낮아져 부곡동 공장들(한일튜브 포함)로 배전된다
  // 2026-07-22 사용자 지시로 3D 모델은 내림(위치 정보만 보관) — 필요해지면 주석 해제
  // {
  //   id: 'substation-ulsan',
  //   type: '변전소',
  //   name: '울산변전소',
  //   lng: 129.34115,
  //   lat: 35.51552,
  //   model: { url: '/models/SubstationBig-opt.glb', targetSizeM: 60 },
  // },
  // 한일튜브 옆 ESS — 모델은 임시로 변전소(SubstationBig) 사용, 컨테이너형 ESS 모델 구하면 교체
  // 최종 배치는 사용자가 조절 패널로 직접 맞춤(2026-07-22)
  {
    id: 'ess-hanil',
    type: 'ESS',
    name: '한일튜브 ESS',
    lng: 129.33074,
    lat: 35.5045,
    model: { url: '/models/SubstationBig-opt.glb', targetSizeM: 18, rotationDeg: 65 },
  },
  // 태양광 발전소(지붕형 공장) 3동 — 실위치 확정 전이라 지도에서 내림(2026-07-22).
  // 모델은 models-src/에 보관(배포 경량화로 public에서 뺌) — 쓸 때 public/models로 복사 후 주석 해제.
  // { id: 'solar-plant-1', type: '발전소', name: '태양광 발전소 1', lng: 0, lat: 0, model: { url: '/models/solar-plant-1-opt.glb', natural: true } },
  // { id: 'solar-plant-2', type: '발전소', name: '태양광 발전소 2', lng: 0, lat: 0, model: { url: '/models/solar-plant-2-opt.glb', natural: true } },
  // { id: 'solar-plant-3', type: '발전소', name: '태양광 발전소 3', lng: 0, lat: 0, model: { url: '/models/solar-plant-3-opt.glb', natural: true } },
  // ── 앞으로 추가 예정 (모델 구하면 model만 채우면 됨) ──
  // { id: 'ess-1', type: 'ESS', name: 'ESS 1호기', lng: ..., lat: ... },
  // { id: 'sensor-solar-1', type: '센서', name: '일사량 센서', lng: ..., lat: ... },
  // { id: 'pylon-1', type: '송전탑', name: '송전탑', lng: ..., lat: ... }, // EleLine 모델
];
