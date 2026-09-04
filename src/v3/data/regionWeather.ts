/* 지역(구·군) 판별 + 지역별 날씨 — BG-02(주야/날씨)의 첫 단추.

   ★ API 연결 안 함(2026-08-19 사용자 지시) — 날씨 값은 **샘플**이고 화면에도 "샘플"로 표시한다.
     나중에 기상청 API허브(dtScreens '기상 관측' 항목)가 연결되면 SAMPLE_WEATHER 만 실측으로 갈아끼우면 된다.

   지역 판별: 울산 5개 구·군의 중심 좌표에서 **가장 가까운 곳**이 현재 지역(행정경계 폴리곤 없이 근사).
   경계 넘어갈 때 날씨가 뚝 바뀌지 않도록, 기온·풍속·습도는 **거리 역제곱 가중 평균**으로 섞는다 —
   경계에 가까울수록 이웃 구 값이 섞여 서서히 변하고, 중심에 가까우면 그 구 값이 지배한다(사용자 요구).
   날씨 상태(맑음 등)는 섞을 수 없으니 가장 가까운 구의 것을 쓴다. */

export interface GuRegion {
  id: string;
  name: string;
  /** 구청·군청 부근 중심 좌표 (근사) */
  lng: number;
  lat: number;
}

/** 울산광역시 구·군 — 중심은 구청 소재지 부근 근사값 */
export const ULSAN_GUS: GuRegion[] = [
  { id: 'jung', name: '중구', lng: 129.3325, lat: 35.5695 },
  { id: 'nam', name: '남구', lng: 129.3301, lat: 35.5438 },
  { id: 'dong', name: '동구', lng: 129.4166, lat: 35.5049 },
  { id: 'buk', name: '북구', lng: 129.3611, lat: 35.5827 },
  { id: 'ulju', name: '울주군', lng: 129.1424, lat: 35.5223 },
];

/* 표기 체계 = 맑음/비/눈 (2026-08-19 확정 — 기상청 초단기실황 강수형태 PTY 매핑: 0 없음→맑음 · 1,5 비 · 2,3,6,7 눈/진눈깨비→눈) */
export type SkyCondition = 'clear' | 'rain' | 'snow';
export const SKY_LABEL: Record<SkyCondition, string> = { clear: '맑음', rain: '비', snow: '눈' };

export interface GuWeather {
  condition: SkyCondition;
  tempC: number;
  windMs: number;
  /** 풍향(16방위 약칭) */
  windDir: string;
  humidityPct: number;
}

/** ⚠️ 자리표시 — 8월 오후의 그럴듯한 값. 실측 아님(기상청 연동 전).
    습도·풍향은 화면에 안 그리지만 데이터로 유지 — 예지보전(결로·부식·PID)·발전량 보정에 쓰일 값이라 수집 대상 */
export const SAMPLE_WEATHER: Record<string, GuWeather> = {
  jung: { condition: 'clear', tempC: 31.2, windMs: 2.1, windDir: '남남서', humidityPct: 62 },
  nam: { condition: 'clear', tempC: 31.8, windMs: 2.8, windDir: '남서', humidityPct: 58 },
  dong: { condition: 'rain', tempC: 28.9, windMs: 4.6, windDir: '남동', humidityPct: 84 },
  buk: { condition: 'clear', tempC: 30.4, windMs: 3.2, windDir: '남', humidityPct: 66 },
  ulju: { condition: 'clear', tempC: 32.5, windMs: 1.7, windDir: '서남서', humidityPct: 52 },
};

const distKm = (aLng: number, aLat: number, bLng: number, bLat: number): number => {
  const kx = 111.32 * Math.cos((aLat * Math.PI) / 180);
  const ky = 111.32;
  return Math.hypot((aLng - bLng) * kx, (aLat - bLat) * ky);
};

export interface RegionWeather {
  region: GuRegion;
  /** 가장 가까운 구 중심까지 거리 (km) — 너무 멀면(울산 밖) 표시 안 하는 판단용 */
  distanceKm: number;
  condition: SkyCondition;
  /** 거리 가중 혼합값 — 경계 부근에서 이웃 구 값이 섞여 서서히 변한다 */
  tempC: number;
  windMs: number;
  humidityPct: number;
  windDir: string;
}

/** 현재 위치의 지역·날씨 — lng/lat 는 카메라가 보고 있는 지면 좌표 */
export function regionWeatherAt(lng: number, lat: number): RegionWeather {
  let nearest = ULSAN_GUS[0];
  let nearestD = Infinity;
  let wSum = 0;
  let temp = 0;
  let wind = 0;
  let hum = 0;
  for (const gu of ULSAN_GUS) {
    const d = distKm(lng, lat, gu.lng, gu.lat);
    if (d < nearestD) {
      nearestD = d;
      nearest = gu;
    }
    const w = 1 / Math.max(0.25, d * d); // 역제곱 가중(0.5km 이내는 포화 — 0으로 나눔 방지)
    const sample = SAMPLE_WEATHER[gu.id];
    wSum += w;
    temp += sample.tempC * w;
    wind += sample.windMs * w;
    hum += sample.humidityPct * w;
  }
  const near = SAMPLE_WEATHER[nearest.id];
  return {
    region: nearest,
    distanceKm: nearestD,
    condition: near.condition,
    tempC: temp / wSum,
    windMs: wind / wSum,
    humidityPct: hum / wSum,
    windDir: near.windDir,
  };
}
