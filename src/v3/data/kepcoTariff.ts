/* 한전 전기요금표 — 산업용 (출처: "2026년도 8월 1일 시행 전기요금표(종합)" PDF, 사용자 제공 2026-08-19)
   ※ 표 각주: 산업용전력(을)·전기자동차 충전전력은 '26.4.16 시행, 그 외 종별은 '26.6.1 시행.
   숫자는 PDF 텍스트를 그대로 옮겼다(추정 없음). 다른 적용일자 표를 받으면 같은 모양으로 한 벌 더 추가하면 된다.

   구조: 종별(계약전력 300kW 기준) → 전압 → 선택요금
     산업용(갑)Ⅰ  300kW 미만                 : 저압 / 고압A(Ⅰ·Ⅱ) / 고압B(Ⅰ·Ⅱ) — 계절별 단일 단가
     산업용(갑)Ⅱ  300kW 미만 시간대별 계량 고객: 고압A(Ⅰ·Ⅱ) / 고압B(Ⅰ·Ⅱ)      — 시간대별 단가   ★ 선택Ⅲ 없음(표 확인)
     산업용(을)    300kW 이상                 : 고압A / 고압B / 고압C × 선택Ⅰ·Ⅱ·Ⅲ — 시간대별 단가
   전압: 저압 220/380V · 고압A 3,300~66,000V · 고압B 154,000V · 고압C 345,000V 이상
   선택: Ⅰ 기본요금 낮고 전력량 높음(사용시간 적은 고객) / Ⅱ 기본요금 다소 높고 전력량 낮음 / Ⅲ 기본요금 높고 전력량 낮음(월 500시간 초과) */

export type Season = 'summer' | 'spring' | 'winter';
export type Band = 'off' | 'mid' | 'peak';
export const SEASON_LABEL: Record<Season, string> = { summer: '여름철 (6~8월)', spring: '봄·가을철 (3~5월, 9~10월)', winter: '겨울철 (11~2월)' };
export const BAND_LABEL: Record<Band, string> = { off: '경부하', mid: '중간부하', peak: '최대부하' };
/** 월(1~12) → 계절 */
export const seasonOfMonth = (m: number): Season => (m >= 6 && m <= 8 ? 'summer' : m >= 11 || m <= 2 ? 'winter' : 'spring');

/** 시간대 구분 (표 각주, '26) — 시(0~23)가 어느 부하 시간대인지. 토·공휴일 특례는 반영 안 함 */
export function bandOfHour(season: Season, hour: number): Band {
  if (hour >= 22 || hour < 8) return 'off';
  if (season === 'winter') {
    // 중간 08~09, 12~16, 19~22 / 최대 09~12, 16~19
    if (hour < 9) return 'mid';
    if (hour < 12) return 'peak';
    if (hour < 16) return 'mid';
    if (hour < 19) return 'peak';
    return 'mid';
  }
  // 여름·봄가을: 중간 08~15, 21~22 / 최대 15~21
  if (hour < 15) return 'mid';
  if (hour < 21) return 'peak';
  return 'mid';
}
export const BAND_HOURS_TEXT: Record<Season, Record<Band, string>> = {
  summer: { off: '22:00~08:00', mid: '08:00~15:00, 21:00~22:00', peak: '15:00~21:00' },
  spring: { off: '22:00~08:00', mid: '08:00~15:00, 21:00~22:00', peak: '15:00~21:00' },
  winter: { off: '22:00~08:00', mid: '08:00~09:00, 12:00~16:00, 19:00~22:00', peak: '09:00~12:00, 16:00~19:00' },
};

export interface TariffRow {
  tariffClass: '산업용(갑)Ⅰ' | '산업용(갑)Ⅱ' | '산업용(을)';
  voltage: '저압' | '고압A' | '고압B' | '고압C';
  /** '' = 선택 없음(저압) */
  option: '' | '선택Ⅰ' | '선택Ⅱ' | '선택Ⅲ';
  /** 기본요금 (원/kW·월) */
  basicKrwKw: number;
  /** 전력량요금 (원/kWh). 시간대별이면 season→band, 단일이면 season→같은 값 3개 */
  energy: Record<Season, Record<Band, number>>;
  timeOfUse: boolean;
}

const flat = (summer: number, spring: number, winter: number): TariffRow['energy'] => ({
  summer: { off: summer, mid: summer, peak: summer },
  spring: { off: spring, mid: spring, peak: spring },
  winter: { off: winter, mid: winter, peak: winter },
});
/** 시간대별 — 표의 줄 순서 그대로: 경부하(여름,봄가을,겨울) / 중간부하(…) / 최대부하(…) */
const tou = (off: [number, number, number], mid: [number, number, number], peak: [number, number, number]): TariffRow['energy'] => ({
  summer: { off: off[0], mid: mid[0], peak: peak[0] },
  spring: { off: off[1], mid: mid[1], peak: peak[1] },
  winter: { off: off[2], mid: mid[2], peak: peak[2] },
});

export const KEPCO_TABLE_NAME = "'26.8 시행 전기요금표(종합) — 산업용(을) '26.4.16 시행";

export const KEPCO_INDUSTRIAL: TariffRow[] = [
  /* ── 산업용(갑)Ⅰ · 계약전력 300kW 미만 ── */
  { tariffClass: '산업용(갑)Ⅰ', voltage: '저압', option: '', basicKrwKw: 5_550, energy: flat(116.2, 94.4, 114.5), timeOfUse: false },
  { tariffClass: '산업용(갑)Ⅰ', voltage: '고압A', option: '선택Ⅰ', basicKrwKw: 6_490, energy: flat(124.8, 101.1, 124.7), timeOfUse: false },
  { tariffClass: '산업용(갑)Ⅰ', voltage: '고압A', option: '선택Ⅱ', basicKrwKw: 7_470, energy: flat(120.0, 96.5, 118.2), timeOfUse: false },
  { tariffClass: '산업용(갑)Ⅰ', voltage: '고압B', option: '선택Ⅰ', basicKrwKw: 6_000, energy: flat(123.6, 100.0, 123.2), timeOfUse: false },
  { tariffClass: '산업용(갑)Ⅰ', voltage: '고압B', option: '선택Ⅱ', basicKrwKw: 6_900, energy: flat(118.9, 95.4, 117.1), timeOfUse: false },

  /* ── 산업용(갑)Ⅱ · 300kW 미만 시간대별 구분계량기 설치고객 ── */
  { tariffClass: '산업용(갑)Ⅱ', voltage: '고압A', option: '선택Ⅰ', basicKrwKw: 6_490, energy: tou([95.7, 95.7, 103.1], [121.5, 100.5, 120.0], [155.0, 119.7, 149.4]), timeOfUse: true },
  { tariffClass: '산업용(갑)Ⅱ', voltage: '고압A', option: '선택Ⅱ', basicKrwKw: 7_470, energy: tou([90.8, 90.8, 98.2], [116.6, 95.6, 115.1], [150.1, 114.8, 144.5]), timeOfUse: true },
  { tariffClass: '산업용(갑)Ⅱ', voltage: '고압B', option: '선택Ⅰ', basicKrwKw: 6_000, energy: tou([92.5, 92.5, 99.7], [120.1, 99.1, 117.7], [153.9, 117.9, 146.4]), timeOfUse: true },
  { tariffClass: '산업용(갑)Ⅱ', voltage: '고압B', option: '선택Ⅱ', basicKrwKw: 6_900, energy: tou([88.0, 88.0, 95.2], [115.6, 94.6, 113.2], [149.4, 113.4, 141.9]), timeOfUse: true },

  /* ── 산업용(을) · 계약전력 300kW 이상 ── */
  { tariffClass: '산업용(을)', voltage: '고압A', option: '선택Ⅰ', basicKrwKw: 7_220, energy: tou([121.5, 121.5, 128.5], [169.3, 138.9, 169.5], [234.5, 156.4, 210.1]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압A', option: '선택Ⅱ', basicKrwKw: 8_320, energy: tou([116.0, 116.0, 123.0], [163.8, 133.4, 164.0], [229.0, 150.9, 204.6]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압A', option: '선택Ⅲ', basicKrwKw: 9_810, energy: tou([115.1, 115.1, 122.4], [163.2, 132.1, 163.4], [216.6, 142.6, 193.4]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압B', option: '선택Ⅰ', basicKrwKw: 6_630, energy: tou([131.4, 131.4, 138.4], [178.6, 148.6, 178.6], [242.9, 165.7, 217.9]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압B', option: '선택Ⅱ', basicKrwKw: 7_380, energy: tou([127.6, 127.6, 134.6], [174.8, 144.8, 174.8], [239.1, 161.9, 214.1]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압B', option: '선택Ⅲ', basicKrwKw: 8_190, energy: tou([125.9, 125.9, 133.0], [173.1, 143.2, 173.1], [237.5, 160.3, 212.4]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압C', option: '선택Ⅰ', basicKrwKw: 6_590, energy: tou([130.9, 130.9, 137.8], [178.7, 148.7, 178.3], [242.7, 165.9, 218.0]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압C', option: '선택Ⅱ', basicKrwKw: 7_520, energy: tou([126.2, 126.2, 133.1], [174.0, 144.0, 173.6], [238.0, 161.2, 213.3]), timeOfUse: true },
  { tariffClass: '산업용(을)', voltage: '고압C', option: '선택Ⅲ', basicKrwKw: 8_090, energy: tou([125.1, 125.1, 132.0], [172.9, 142.9, 172.5], [236.9, 160.1, 212.2]), timeOfUse: true },
];

export const findTariff = (tariffClass: string, voltage: string, option: string) =>
  KEPCO_INDUSTRIAL.find((r) => r.tariffClass === tariffClass && r.voltage === voltage && r.option === (option || ''));

/* ── 태양광 발전 시간대 가중평균 단가 ───────────────────────────────────────────
   절감되는 전기는 "태양광이 발전하는 시간"의 전기다. 시간대별 요금제면 그 시간들의 단가를
   **발전량 비중**으로 가중평균해야 한다. 발전 시간 분포 = 태양 고도(위도·월별 적위)로 계산한 맑은 날 모양.
   (실측 시간별 발전 데이터가 들어오면 그걸로 바꾼다 — 모양만 다르고 계산 틀은 같다)
   ★ '26 표는 최대부하가 15~21시(여름·봄가을)로 옮겨져 한낮 발전분이 대부분 "중간부하" 단가로 잡힌다 —
      예전 표(최대부하 11~12·13~18시)보다 태양광 kWh당 절감 단가가 낮게 나오는 게 맞다. */
const ULSAN_LAT = 35.53;
/** 월별 시간(0~23)별 발전 비중 — 합 1. 태양 고도 cos(천정각) 양수 부분 */
export function solarHourShares(month: number, latDeg = ULSAN_LAT): number[] {
  const dayOfYear = Math.round(30.4 * (month - 1) + 15);
  const decl = (23.44 * Math.PI / 180) * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const lat = (latDeg * Math.PI) / 180;
  const w = Array.from({ length: 24 }, (_, h) => {
    const ha = ((h + 0.5 - 12) * 15 * Math.PI) / 180; // 시 중심, 정오 기준 시각
    const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    return Math.max(0, cosZ);
  });
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
/** 월별 발전 비중(monthShares, 합 1)을 주면 그 요금제의 태양광 가중평균 전력량 단가(원/kWh) */
export function solarBlendedRate(row: TariffRow, monthShares?: number[]): number {
  const ms = monthShares && monthShares.length === 12 ? monthShares : Array(12).fill(1 / 12);
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    const season = seasonOfMonth(m);
    const hs = solarHourShares(m);
    let monthRate = 0;
    for (let h = 0; h < 24; h++) monthRate += hs[h] * row.energy[season][bandOfHour(season, h)];
    sum += ms[m - 1] * monthRate;
  }
  return sum;
}
/** 계절·시간대별 발전 비중(%) — 화면 설명용: "여름 중간부하 xx%, 최대부하 yy%" */
export function solarBandMix(monthShares?: number[]): Record<Season, Record<Band, number>> {
  const ms = monthShares && monthShares.length === 12 ? monthShares : Array(12).fill(1 / 12);
  const out: Record<Season, Record<Band, number>> = {
    summer: { off: 0, mid: 0, peak: 0 },
    spring: { off: 0, mid: 0, peak: 0 },
    winter: { off: 0, mid: 0, peak: 0 },
  };
  for (let m = 1; m <= 12; m++) {
    const season = seasonOfMonth(m);
    const hs = solarHourShares(m);
    for (let h = 0; h < 24; h++) out[season][bandOfHour(season, h)] += ms[m - 1] * hs[h] * 100;
  }
  return out;
}
