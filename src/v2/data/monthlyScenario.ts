/* 월별 시나리오 — "작년 날씨가 반복된다면 이만큼" 프레임.
   미래 예측치는 '무슨 근거냐'는 반문을 부르지만 작년 실측 날씨는 반박 불가.

   데이터: NASA POWER(위성 관측 실측, 키 불필요, 위치별) 2025년 월별
   일사량(kWh/m²/일)·강수(mm/일)·운량(%). 조회 실패 시 울산 스냅샷 폴백.
   ※ 기상청 지상관측(ASOS)으로 교체하려면 공공데이터포털 인증키 필요 — 이 모듈만 갈아끼우면 됨. */

export type MonthWx = {
  m: number; // 1~12월
  ghi: number; // 일사량 kWh/m²/일 (월평균)
  rainMmDay: number; // 강수 mm/일 (월평균)
  cloudPct: number; // 운량 %
};

/* 울산(한일튜브 좌표) 2025년 실측 — 2026-07-27 NASA POWER 조회값. 오프라인 폴백용 */
export const ULSAN_2025: MonthWx[] = [
  { m: 1, ghi: 2.7293, rainMmDay: 0.41, cloudPct: 60.49 },
  { m: 2, ghi: 3.7867, rainMmDay: 0.85, cloudPct: 53.79 },
  { m: 3, ghi: 4.0462, rainMmDay: 2.13, cloudPct: 63.89 },
  { m: 4, ghi: 5.7271, rainMmDay: 1.89, cloudPct: 52.18 },
  { m: 5, ghi: 5.3957, rainMmDay: 4.73, cloudPct: 60.98 },
  { m: 6, ghi: 5.3952, rainMmDay: 6.71, cloudPct: 66.95 },
  { m: 7, ghi: 6.1954, rainMmDay: 4.66, cloudPct: 47.14 },
  { m: 8, ghi: 5.4619, rainMmDay: 6.66, cloudPct: 53.49 },
  { m: 9, ghi: 3.6454, rainMmDay: 5.76, cloudPct: 75.9 },
  { m: 10, ghi: 2.5289, rainMmDay: 4.57, cloudPct: 77.26 },
  { m: 11, ghi: 2.9606, rainMmDay: 0.76, cloudPct: 49.96 },
  { m: 12, ghi: 2.3746, rainMmDay: 1.17, cloudPct: 60.67 },
];

const YEAR = 2025;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const PR = 0.8; // 성능비 — 인버터 손실·온도·오염 등 (업계 표준 가정)

/** 해당 위치의 작년 월별 실측 날씨 — 실패하면 울산 스냅샷 폴백 */
export async function fetchMonthlyWx(
  lng: number,
  lat: number,
): Promise<{ rows: MonthWx[]; source: 'nasa' | 'fallback' }> {
  try {
    const url =
      `https://power.larc.nasa.gov/api/temporal/monthly/point` +
      `?parameters=ALLSKY_SFC_SW_DWN,PRECTOTCORR,CLOUD_AMT&community=RE` +
      `&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${YEAR}&end=${YEAR}&format=JSON`;
    const j = await fetch(url).then((r) => r.json());
    const p = j?.properties?.parameter;
    const rows: MonthWx[] = [];
    for (let m = 1; m <= 12; m++) {
      const k = `${YEAR}${String(m).padStart(2, '0')}`;
      const ghi = Number(p?.ALLSKY_SFC_SW_DWN?.[k]);
      const rain = Number(p?.PRECTOTCORR?.[k]);
      const cloud = Number(p?.CLOUD_AMT?.[k]);
      if (!Number.isFinite(ghi) || ghi < 0) throw new Error('missing');
      rows.push({ m, ghi, rainMmDay: Math.max(0, rain), cloudPct: Math.max(0, cloud) });
    }
    return { rows, source: 'nasa' };
  } catch {
    return { rows: ULSAN_2025, source: 'fallback' };
  }
}

/** 월별 예상 발전량(kWh) = 설비 kWp × 일사량(kWh/m²/일) × 일수 × 성능비 80% */
export function monthlyKwh(kwp: number, r: MonthWx): number {
  return Math.round(kwp * r.ghi * DAYS[r.m - 1] * PR);
}

/** 월 강수량(mm) — 일평균 × 일수 */
export function monthRainMm(r: MonthWx): number {
  return Math.round(r.rainMmDay * DAYS[r.m - 1]);
}

/* ── 일별 실측 — 시뮬레이션용. 하루 재생 = 실제 1주:
   그 주에 진짜 비 온 날 차례에만 비가 내리고, 그날은 일사량도 실제로 낮아 계기판이 느려진다 ── */

export type DayWx = {
  m: number; // 월
  d: number; // 일
  ghi: number; // 그날 일사량 kWh/m²
  rainMm: number; // 그날 강수 mm
};

/** 해당 위치의 작년 365일 실측 — 실패하면 월평균으로 하루하루 합성(폴백) */
export async function fetchDailyWx(
  lng: number,
  lat: number,
): Promise<{ days: DayWx[]; source: 'nasa' | 'fallback' }> {
  try {
    const url =
      `https://power.larc.nasa.gov/api/temporal/daily/point` +
      `?parameters=ALLSKY_SFC_SW_DWN,PRECTOTCORR&community=RE` +
      `&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${YEAR}0101&end=${YEAR}1231&format=JSON`;
    const j = await fetch(url).then((r) => r.json());
    const p = j?.properties?.parameter;
    const ghis = p?.ALLSKY_SFC_SW_DWN ?? {};
    const rains = p?.PRECTOTCORR ?? {};
    const days: DayWx[] = [];
    for (const k of Object.keys(ghis)) {
      const ghi = Number(ghis[k]);
      if (!Number.isFinite(ghi) || ghi < 0) continue; // -999 = 결측
      days.push({
        m: Number(k.slice(4, 6)),
        d: Number(k.slice(6, 8)),
        ghi,
        rainMm: Math.max(0, Number(rains[k]) || 0),
      });
    }
    if (days.length < 300) throw new Error('incomplete');
    return { days, source: 'nasa' };
  } catch {
    // 폴백: 월평균으로 매일을 채움 — 비는 월평균이 1.5mm/일 이상이면 격일로 흩뿌림
    const days: DayWx[] = [];
    for (const r of ULSAN_2025) {
      for (let d = 1; d <= DAYS[r.m - 1]; d++) {
        const rainy = r.rainMmDay >= 1.5 && d % 2 === 0;
        days.push({ m: r.m, d, ghi: r.ghi, rainMm: rainy ? r.rainMmDay * 2 : 0 });
      }
    }
    return { days, source: 'fallback' };
  }
}

/** 하루 발전량(kWh) = kWp × 그날 일사량 × 성능비 */
export function dayKwh(kwp: number, day: DayWx): number {
  return kwp * day.ghi * PR;
}
