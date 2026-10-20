import { FACILITIES } from './data/facilities';

/* v0.3의 기준점 = 내 건물.

   ⚠️ 좌표를 여기에 따로 적지 않는다. 예전에 v0.2 시절 카메라 좌표를 그대로 옮겨 적어뒀다가,
      배치 조절로 건물 좌표만 고쳐지면서 **둘이 약 69m 어긋났다**([한일튜브] 를 누르면
      건물이 화면 가운데가 아니라 위쪽에 잡히던 원인). 시설 목록표의 좌표를 그대로 따라간다. */

const HOME_FACILITY_ID = 'hanil-tube';
const f = FACILITIES.find((x) => x.id === HOME_FACILITY_ID);
if (!f) throw new Error(`facilities.ts 에 ${HOME_FACILITY_ID} 가 없습니다`);

export const HOME = {
  facilityId: HOME_FACILITY_ID,
  name: f.name,
  /** 건물과 같은 자리 — facilities.ts 를 고치면 카메라도 따라온다 */
  lng: f.lng,
  lat: f.lat,

  /** 카메라 조준점의 위도 — 건물 좌표에서 남쪽으로 45m 내려 조준(2026-08-26).
      건물 좌표가 지붕 북쪽에 치우쳐 있어, 그 점을 화면 정중앙에 두면 건물 덩어리는 아래로 처진다.
      좌표를 따로 적는 게 아니라 f.lat 에서 **유도**하므로 건물 좌표를 고치면 함께 따라온다(과거 69m 어긋남 재발 방지) */
  camLat: f.lat - 45 / 111_320,

  /** 브이월드 3D 카메라: 건물에서 이만큼 떨어져 내려다본다(m).
      각도 -40°라 실제 눈높이는 약 이 값의 0.64배 (320 → 지상 약 205m).
      400이었는데 "거리가 살짝 멀다"(2026-08-26 사용자)로 당김 */
  altitude: 320,
  tiltDeg: -40,

  /** 이보다 멀리는 못 간다(m) — 우주까지 나가버리는 것만 막는다.
      전에는 2,500m(내 건물 근처)였지만, 예정 자산(수소·ORC·ESS·V2G)이 산단 곳곳에
      흩어져 있어서 **울산미포산단 전체(약 48.5㎢, 남구~동구)가 한눈에 들어오는 높이**로 넓혔다.
      가까이 다가가는 쪽은 막지 않는다(건물을 살펴봐야 하므로). */
  maxDistanceM: 25_000,
} as const;

/* 산단 전체 뷰 — "위로 가기" 버튼이 데려가는 자리(2026-09-08 사용자 확정).
   개별 건물이 아니라 **발전소들의 분포**를 보는 높이 = 시연 흐름의 첫 장면
   (울산 산단 전체 → 발전소 고르기 → 한일튜브 상세).
   좌표는 울산미포산단의 대략적인 가운데. */
export const OVERVIEW = {
  lng: 129.335,
  lat: 35.508,
  altitude: 9_000,
  tiltDeg: -72,
} as const;

/* 누가 보고 있나 — 권한(2026-09-08 사용자 지적).
     admin(울산시·운영사) = 산단 전체와 모든 발전소를 본다
     owner(한일튜브 같은 사업주) = **자기 발전소만** 본다 — 남의 발전량은 영업정보라 보이면 안 된다
   지금은 로그인이 없는 POC라 여기 한 줄로 전환한다. 실제로는 로그인 계정의 권한으로 정해진다. */
export type ViewerRole = 'admin' | 'owner';
export const VIEWER_ROLE: ViewerRole = 'admin';
