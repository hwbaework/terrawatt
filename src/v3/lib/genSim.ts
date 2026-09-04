/* 발전량 예측 시뮬레이션 — 3차년도 기능표 #8 "발전량 등의 성능을 가상화하여 시뮬레이션".

   계산 근거(전부 실측·표준):
     · 일사량 = NASA POWER 의 울산 지점 **작년 실측값** (위성 관측, 키 불필요, 브라우저에서 직접 호출 가능)
     · 발전량(kWh) = 설비용량(kW) × 일사량(kWh/㎡/일 ≈ 하루 최대발전 환산시간) × 일수 × 종합효율(PR)
     · PR 0.8 = 태양광 업계 표준 종합효율(인버터 손실·오염·온도 손실 포함)
   지어내는 숫자 없음 — 조건이 같으면 결과가 같다. */

import { SELF_TARIFF } from './bizSim';

/** 종합효율 (Performance Ratio) */
export const PR = 0.8;
/** 일사량 기준 연도 — 마지막으로 1년 치가 다 있는 해 */
export const WEATHER_YEAR = 2025;

/** NASA POWER 월별 일사량(kWh/㎡/일)을 받아온다. 월(1~12) → 값 */
export async function fetchMonthlyIrradiance(lng: number, lat: number): Promise<Record<number, number>> {
  const url =
    `https://power.larc.nasa.gov/api/temporal/monthly/point` +
    `?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&start=${WEATHER_YEAR}&end=${WEATHER_YEAR}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER 응답 ${res.status}`);
  const j = (await res.json()) as {
    properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: Record<string, number> } };
  };
  const raw = j.properties?.parameter?.ALLSKY_SFC_SW_DWN ?? {};
  const out: Record<number, number> = {};
  for (const [key, val] of Object.entries(raw)) {
    // 키는 "202501" 형태. "13"은 연평균이라 버린다. -999 = 결측.
    const m = Number(key.slice(4));
    if (m >= 1 && m <= 12 && val > 0) out[m] = val;
  }
  return out;
}

export interface MonthForecast {
  /** 표시용 연·월 */
  year: number;
  month: number;
  /** 그 달 일사량 (kWh/㎡/일) */
  irr: number;
  /** 예상 발전량 (kWh) */
  kwh: number;
}

/** 발전량 예측 결과 — 단가와 무관하다([시작]으로 한 번만 계산) */
export interface GenForecast {
  rows: MonthForecast[];
  capacityKw: number;
  weatherYear: number;
}

/** 발전량 + 계약 단가 — 결과 화면·문서가 이걸 받는다 */
export interface GenSimResult extends GenForecast {
  /** PPA 계약 단가 (원/kWh) — 조건 칸에서 입력, 바꿔도 발전량은 재계산 안 함 */
  ppaPrice: number;
}

export const totalKwh = (rows: MonthForecast[]) => rows.reduce((s, r) => s + r.kwh, 0);

/** 전력량 절감(원) = 발전량 × 자가소비 단가(157.6원) */
export const revenueWon = (rows: MonthForecast[], ppaPrice: number) => totalKwh(rows) * ppaPrice;

/** 기본요금 절감(원/월) = 설치용량 × 피크감축 반영률 30% × 기본요금 8,320원.
    사업성 검토(bizSim)와 같은 식 — 단기 예측이라 요금 상승률·효율감소는 안 태운다(몇 개월엔 영향 미미) */
export const basicSaveWonPerMonth = (capacityKw: number) => capacityKw * 0.3 * SELF_TARIFF.basicKrwKw;

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

/** 다음 달부터 n개월의 발전량을 예측한다. 각 달에 작년 같은 달의 실측 일사량을 적용. */
export function forecast(
  capacityKw: number,
  irrByMonth: Record<number, number>,
  startYear: number,
  startMonth: number,
  n: number,
): MonthForecast[] {
  const out: MonthForecast[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < n; i++) {
    const irr = irrByMonth[m] ?? 0;
    out.push({ year: y, month: m, irr, kwh: capacityKw * irr * daysInMonth(y, m) * PR });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
