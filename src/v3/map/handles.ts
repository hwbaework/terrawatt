/* 배치 조절 손잡이 — 지도 위에 세운 시설을 밀고/돌리고/키우는 공통 창구.

   지도가 무엇으로 그려지든 **같은 모양의 손잡이를 여기 등록**해 두면 조절 패널은 시설 id 로만
   찾아 쓸 수 있다. (예전에 엔진이 둘이던 시절의 구조인데, 지금은 브이월드 3D 하나뿐이어도
   패널과 지도를 갈라놓는 역할은 그대로 쓸모가 있다)

   손잡이는 시설 id(예: 'hanil-tube') 로 등록한다 — 레이어 id가 아니라. */

export interface PlacementHandle {
  /** 동쪽(+)/서쪽(-), 북쪽(+)/남쪽(-)으로 미터 단위 이동 */
  move(eastM: number, northM: number): void;
  /** 시계방향(+) 회전, 도 단위 */
  rotate(dDeg: number): void;
  /** 크기 배율 (1.1 = 10% 크게) */
  resize(factor: number): void;
  state(): { lng: number; lat: number; rotationDeg: number; sizeM: number };
}

const handles = new Map<string, PlacementHandle>();

export function registerHandle(facilityId: string, h: PlacementHandle): void {
  handles.set(facilityId, h);
}
export function unregisterHandle(facilityId: string): void {
  handles.delete(facilityId);
}
export function getHandle(facilityId: string): PlacementHandle | undefined {
  return handles.get(facilityId);
}

/* 미터 ↔ 위경도 변환 (두 엔진이 공통으로 쓴다) */
export const metersToLng = (m: number, atLat: number) => m / (111320 * Math.cos((atLat * Math.PI) / 180));
export const metersToLat = (m: number) => m / 110574;
