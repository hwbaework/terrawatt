/* 1단계 단가 항목 — energy-landing(/insight/trend) '단가' 카드와 동일 구성 (값은 mock).
   실서비스 교체: SMP=KPX/EPSIS, REC=신재생 원스톱 포털·공공데이터 API,
   탄소배출권(KAU25)=KRX 배출권 거래시장. */

export type PriceCard = {
  key: string;
  label: string;
  /** 항목 색 (energy-landing 차트 색과 통일) */
  color: string;
  value: string;
  unit: string;
  delta: string;
  /** true=상승(빨강) · false=하락(파랑) · null=변동 없음 */
  up: boolean | null;
  date: string;
};

/* 육지 기준 */
export const PRICE_CARDS_LAND: PriceCard[] = [
  { key: 'smp', label: 'SMP', color: '#06b6d4', value: '134.61', unit: '원/kWh', delta: '+6.27', up: true, date: '2026-07-13' },
  { key: 'rec', label: 'REC현물', color: '#22c55e', value: '71.67', unit: '원/kWh', delta: '+0.02', up: true, date: '2026-07-09' },
  { key: 'smp1rec', label: 'SMP+1REC', color: '#ec4899', value: '206.28', unit: '원/kWh', delta: '+6.29', up: true, date: '2026-07-13' },
  { key: 'longterm', label: '장기계약', color: '#f97316', value: '150.95', unit: '원/kWh', delta: '0', up: null, date: '2024-12-24' },
  { key: 're100', label: 'RE100용 REC', color: '#eab308', value: '75.25', unit: '원/kWh', delta: '+1.12', up: true, date: '2025-07-18' },
  { key: 'carbon', label: '탄소배출권', color: '#8b5cf6', value: '25,450', unit: '원', delta: '+100', up: true, date: '2026-07-13' },
];

/* 제주 — SMP 계열만 다르고(하루전시장 분리 운영) 나머지는 전국 단일가 */
export const PRICE_CARDS_JEJU: PriceCard[] = PRICE_CARDS_LAND.map((c) => {
  if (c.key === 'smp') return { ...c, value: '141.73', delta: '+4.85', up: true };
  if (c.key === 'smp1rec') return { ...c, value: '213.40', delta: '+4.87', up: true };
  return c;
});
