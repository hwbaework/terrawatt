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

  /** 브이월드 3D 카메라: 건물에서 이만큼 떨어져 내려다본다(m).
      각도 -40°라 실제 눈높이는 약 이 값의 0.64배 (400 → 지상 약 255m) */
  altitude: 400,
  tiltDeg: -40,

  /** 이보다 멀리는 못 간다(m) — 너무 멀어지면 내 건물을 잃어버린다.
      가까이 다가가는 쪽은 막지 않는다(건물을 살펴봐야 하므로). */
  maxDistanceM: 2500,
} as const;
