/* 울산 변전소 — 고객(수용가)이 물리는 배전용(154kV) 변전소 목록 + 한전 동별 담당 매핑.

   좌표 근거: OSM power=substation(배전용만, 345kV 송전용·경주권 제외).
   효문변전소는 카카오 장소 데이터와도 일치 확인(교차검증).
   매핑 근거: 한전 공공데이터 '지역별 공급가능 변전소' — 변전소 이름이 '울*'처럼
   가려져 있어 첫 글자로 실명과 맞췄다(울산 안에서는 첫 글자 충돌 없음).

   ※ 이 매핑은 "한전 기준 가장 유력한 후보"까지다. 100% 확정은 고객 전기요금
   고지서(공급 변전소 기재)나 한전 사이버지점 '접속가능 용량조회'로만 가능. */

export type Substation = { id: string; name: string; lng: number; lat: number };

export const SUBSTATIONS: Substation[] = [
  { id: 'ulsan', name: '울산변전소', lng: 129.34115, lat: 35.51552 },
  { id: 'maeam', name: '매암변전소', lng: 129.34616, lat: 35.5276 },
  { id: 'yongyeon', name: '용연변전소', lng: 129.35976, lat: 35.48234 },
  { id: 'cheoyong', name: '처용변전소', lng: 129.33777, lat: 35.46213 },
  { id: 'dangwol', name: '당월변전소', lng: 129.33644, lat: 35.41263 },
  { id: 'okdong', name: '옥동변전소', lng: 129.28071, lat: 35.53886 },
  { id: 'taehwa', name: '태화변전소', lng: 129.29023, lat: 35.56195 },
  { id: 'bukulsan', name: '북울산변전소', lng: 129.318, lat: 35.5806 },
  { id: 'hyomun', name: '효문변전소', lng: 129.37417, lat: 35.56877 },
  { id: 'bangeojin', name: '방어진변전소', lng: 129.42556, lat: 35.53881 },
  { id: 'ungchon', name: '웅촌변전소', lng: 129.21088, lat: 35.4646 },
  { id: 'eonyang', name: '언양변전소', lng: 129.09714, lat: 35.51365 },
  { id: 'bancheon', name: '반천변전소', lng: 129.15134, lat: 35.55522 },
  { id: 'jikdong', name: '직동변전소', lng: 129.13279, lat: 35.58029 },
  { id: 'ulsanhwaryeok', name: '울산화력변전소', lng: 129.37877, lat: 35.47521 },
];

/* 한전 표 그대로: "구|법정동" → 담당 변전소 후보 id들.
   빈 배열 = 한전 표에는 있으나 그 변전소 좌표를 못 찾은 경우(두왕·온산·매곡 등)
   → 가장 가까운 변전소로 폴백하고 '추정'으로 표시한다. */
export const DONG_TO_SUB: Record<string, string[]> = {
  // 남구
  '남구|두왕동': [], // 두왕변전소 — 좌표 미확인
  '남구|상개동': [],
  '남구|선암동': ['ulsan'], // 한전 표는 두왕·울산 — 두왕 좌표 미확인이라 울산만
  '남구|달동': ['maeam'],
  '남구|삼산동': ['maeam'],
  '남구|야음동': ['maeam'],
  '남구|여천동': ['maeam', 'ulsan'],
  '남구|신정동': ['okdong'],
  '남구|옥동': ['okdong'],
  '남구|고사동': ['yongyeon'],
  '남구|남화동': ['yongyeon'],
  '남구|성암동': ['yongyeon'],
  '남구|용연동': ['yongyeon'],
  '남구|용잠동': ['yongyeon'],
  '남구|황성동': ['yongyeon'],
  '남구|매암동': ['ulsan'],
  '남구|부곡동': ['ulsan'],
  // 중구
  '중구|남외동': ['bukulsan'],
  '중구|복산동': ['bukulsan'],
  '중구|서동': ['bukulsan'],
  '중구|성안동': ['bukulsan'],
  '중구|약사동': ['bukulsan'],
  '중구|장현동': ['bukulsan'],
  '중구|다운동': ['taehwa'],
  '중구|옥교동': ['taehwa'],
  '중구|우정동': ['taehwa'],
  '중구|유곡동': ['taehwa'],
  '중구|태화동': ['taehwa'],
  '중구|학성동': ['taehwa'],
  '중구|반구동': ['hyomun'],
  // 동구
  '동구|방어동': ['bangeojin'],
  '동구|일산동': ['bangeojin'],
  '동구|전하동': ['bangeojin'],
  '동구|화정동': ['bangeojin'],
  '동구|주전동': [], // 산하변전소 — 좌표 미확인
  // 북구
  '북구|염포동': ['bangeojin'],
  '북구|가대동': ['bukulsan'],
  '북구|시례동': ['bukulsan'],
  '북구|달천동': [], // 한전 표 '매*' — 북구 쪽은 매곡변전소로 추정되나 좌표 미확인
  '북구|매곡동': [],
  '북구|상안동': [],
  '북구|송정동': [],
  '북구|창평동': [],
  '북구|천곡동': [],
  '북구|호계동': [],
  '북구|구유동': [], // 산하변전소 — 좌표 미확인
  '북구|당사동': [],
  '북구|대안동': [],
  '북구|무룡동': [],
  '북구|산하동': [],
  '북구|신명동': [],
  '북구|신현동': [],
  '북구|어물동': [],
  '북구|정자동': [],
  '북구|명촌동': ['hyomun'],
  '북구|신천동': ['hyomun'],
  '북구|양정동': ['hyomun'],
  '북구|연암동': ['hyomun'],
  '북구|중산동': ['hyomun'],
  '북구|진장동': ['hyomun'],
  '북구|화봉동': ['hyomun'],
  '북구|효문동': ['hyomun'],
  // 울주군
  '울주군|온산읍': ['dangwol', 'cheoyong'], // 온산변전소 — 좌표 미확인이라 제외
  '울주군|온양읍': ['dangwol'],
  '울주군|청량읍': [], // 두왕변전소 — 좌표 미확인
  '울주군|서생면': [], // 명산·장안 — 좌표 미확인
  '울주군|삼남읍': ['bancheon', 'eonyang'],
  '울주군|삼동면': ['bancheon', 'eonyang'],
  '울주군|언양읍': ['bancheon', 'jikdong'],
  '울주군|두서면': ['jikdong'],
  '울주군|상북면': ['jikdong'],
  '울주군|웅촌면': ['ungchon'],
};

/* 발전소별 접속 변전소 — 각 발전소 소재 법정동을 카카오로 확인해 위 표에 대입한 결과.
   한일튜브·건호이엔씨=부곡동, 용인금속1·2·태성산업=여천동(후보 중 울산이 더 가까움), 한길=용연동 */
export const PLANT_SUB: Record<number, string> = {
  17511: 'ulsan',
  17558: 'ulsan',
  17512: 'ulsan',
  17514: 'ulsan',
  17513: 'ulsan',
  17515: 'yongyeon',
};

const KAKAO_KEY = (import.meta.env.VITE_KAKAO_REST_KEY as string | undefined) ?? '';

const dist = (s: Substation, lng: number, lat: number) =>
  Math.hypot((s.lng - lng) * 90630, (s.lat - lat) * 110574);

export type SupplySub = {
  sub: Substation;
  /** kepco = 한전 동별 표 기반 / nearest = 표에 없어 최근접 추정 / manual = 사용자 직접 선택(고지서 확인 등) */
  basis: 'kepco' | 'nearest' | 'manual';
  dong: string;
  /** 한전 표 기준 후보 id들 — 변전소 직접 선택 UI에서 '한전 추정' 뱃지 표시용 */
  kepcoIds: string[];
};

/** 거리순 변전소 목록 (변전소 직접 선택 UI용) */
export function substationsByDistance(lng: number, lat: number): (Substation & { km: number })[] {
  return SUBSTATIONS.map((s) => ({ ...s, km: dist(s, lng, lat) / 1000 })).sort((a, b) => a.km - b.km);
}

/** 좌표 → 담당 변전소 추정: 카카오로 법정동 확인 → 한전 표 대입(후보 여럿이면 가까운 쪽).
    동을 못 찾거나 표에 없으면 최근접 변전소로 폴백. */
export async function findSupplySubstation(lng: number, lat: number): Promise<SupplySub> {
  let dong = '';
  let gu = '';
  if (KAKAO_KEY) {
    try {
      const r = await fetch(
        `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
      );
      const j: { documents?: { region_type: string; region_2depth_name: string; region_3depth_name: string }[] } =
        await r.json();
      const b = j.documents?.find((d) => d.region_type === 'B');
      if (b) {
        gu = b.region_2depth_name.split(' ').pop() ?? '';
        dong = b.region_3depth_name.split(' ')[0] ?? '';
      }
    } catch {
      /* 조회 실패 → 최근접 폴백 */
    }
  }
  const ids = DONG_TO_SUB[`${gu}|${dong}`];
  const cands = (ids ?? [])
    .map((id) => SUBSTATIONS.find((s) => s.id === id))
    .filter((s): s is Substation => !!s)
    .sort((a, b) => dist(a, lng, lat) - dist(b, lng, lat));
  if (cands.length > 0) return { sub: cands[0], basis: 'kepco', dong, kepcoIds: cands.map((s) => s.id) };
  const nearest = [...SUBSTATIONS].sort((a, b) => dist(a, lng, lat) - dist(b, lng, lat))[0];
  return { sub: nearest, basis: 'nearest', dong, kepcoIds: [] };
}
