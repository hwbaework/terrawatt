import { HOME } from '../home';

/* 설비 배치 — 인버터별 지붕 위치(2026-08-26 사용자 확정: 인버터를 누르면 그 자리로 카메라가 확대).

   ⚠️ 임시 좌표다. 한일튜브 지붕(약 78.8 × 126.4 m)에 4대를 사분면으로 대략 배치했다.
      도면(장비 배치도) 수령 후 실측 위치로 교체한다 — 그때 이 파일만 고치면 카메라·마커가 함께 따라온다.

   미터 오프셋 → 위경도 변환: 위도 1m ≈ 1/111,320° · 경도 1m ≈ 1/90,630°(울산 위도 cos 반영). */

const LAT_PER_M = 1 / 111_320;
const LNG_PER_M = 1 / 90_630;

interface Spot {
  /** 부지 중심(HOME) 기준 동쪽(+)/서쪽(−) 오프셋(m) */
  eastM: number;
  /** 부지 중심 기준 북쪽(+)/남쪽(−) 오프셋(m) */
  northM: number;
}

/** 인버터 id → 지붕 위 대략 위치(임시). demoReadings 의 인버터 id 와 맞춘다 */
export const INVERTER_SPOTS: Record<string, Spot> = {
  'INV-001': { eastM: -18, northM: -40 },
  'INV-002': { eastM: 18, northM: -40 },
  'INV-003': { eastM: -18, northM: 40 },
  'INV-004': { eastM: 18, northM: 40 },
};

/** 인버터 위치의 위경도 — 없는 id 면 null */
export function inverterLngLat(id: string): { lng: number; lat: number } | null {
  const s = INVERTER_SPOTS[id];
  if (!s) return null;
  return { lng: HOME.lng + s.eastM * LNG_PER_M, lat: HOME.lat + s.northM * LAT_PER_M };
}
