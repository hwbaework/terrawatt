/* 예정 자산 4종 — 수소연료전지·ORC·ESS·V2G (DT정리v0.2 엑셀 기준).

   아직 **완공 전이거나 위치가 확정되지 않은** 자산들이다. 엑셀도 "지금은 그릴 수 없음"이라 한다.
   그래도 POC에서 "눌러서 가보고, 무엇이 보일지"를 먼저 그려두기 위해 여기 정리한다.

   원칙 (specs.ts 와 동일):
     · 스펙(용량·주소·구성처럼 고정된 값) = 엑셀에 있는 그대로 적는다
     · 계측값(발전량·SOC·온도) = **절대 지어내지 않는다** — 패널에 "연동 후" 자리만 잡는다

   ⚠️ 좌표는 전부 임시다. 카메라를 그 동네까지 데려가는 용도일 뿐, 부지 확정값이 아니다.
      (수소·ORC는 주소(상개동 427-5)로 대략, ESS·V2G는 위치 자체가 미확정) */

export interface ExpectedItem {
  /** 표출 항목 이름 (예: 전기생산량) */
  label: string;
  unit?: string;
}

export interface ExpectedGroup {
  /** 데이터 묶음 이름 + 주기 (엑셀 3.데이터목록 기준) */
  group: string;
  items: ExpectedItem[];
}

export interface PlannedAsset {
  id: string;
  /** 버튼·패널 제목 */
  name: string;
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 엑셀 구성 ID (2.DT구성상세) — 패널 배지로 표시 */
  excelId: string;

  /** ⚠️ 임시 좌표 — 카메라 이동용 대략값 */
  lng: number;
  lat: number;
  /** 좌표가 얼마나 믿을 만한지 — 패널·이름표에 그대로 표시 */
  locationNote: string;

  /** 진행 상태 한 줄 (완공·검수 일정) */
  status: string;
  /** 고정 스펙 — 엑셀에 적힌 확정 정보만 */
  specs: { label: string; value: string }[];
  /** 완공·연동 후 이 패널에 보일 것들 — 지금은 자리만 */
  expected: ExpectedGroup[];
  /** 예지보전(DT-PM-01) 대상 설비 — 아이티공간 UYeG 분석이 붙는 단위 */
  pmTarget: string;
  /** 데이터를 어디서 받는지 · 협의 상태 */
  dataNote: string;
}

export const PLANNED_ASSETS: PlannedAsset[] = [
  {
    id: 'fc-eneroute',
    name: '수소연료전지',
    icon: 'gas_meter',
    excelId: 'AS-FC-01',
    // 남구 상개동 427-5 — 주소 기준 대략 (필지 좌표 아님)
    lng: 129.3,
    lat: 35.515,
    locationNote: '상개동 427-5 인근 (주소 기준 대략)',
    status: '건설중 — 12월 말 완공 예정 (2호 추가 제작중)',
    specs: [
      { label: '사업자', value: '롯데SK에너루트' },
      { label: '주소', value: '울산 남구 상개동 427-5' },
      { label: '설비용량', value: '39.6 MW (1·3호 합계)' },
      { label: '부지', value: '1호 3,128㎡ · 3호 3,615㎡' },
      { label: '계통연계', value: '22.9kV 송전선 약 4.7km → 매암변전소' },
    ],
    expected: [
      {
        group: '운전 (1분)',
        items: [
          { label: '가동상태' },
          { label: '전기생산량', unit: 'kWh' },
          { label: '열생산량', unit: 'Gcal' },
        ],
      },
      {
        group: '전기 (0.1초 → 1분 조정 검토)',
        items: [
          { label: '전류', unit: 'A' },
          { label: '전압', unit: 'V' },
          { label: '전력', unit: 'kW' },
          { label: '전력량', unit: 'kWh' },
        ],
      },
      {
        group: '안전 (1분)',
        items: [{ label: '열화상' }, { label: '연기감지' }, { label: '수소누수' }],
      },
    ],
    pmTarget: '연료전지 유닛 (유닛 수는 발전사 자료 확보 시 확정)',
    dataNote: '발전사 통신 I/F + 아이티공간(UYeG) — 수신 가능 데이터 협의중. 조감도·외관사진 요청 예정',
  },
  {
    id: 'orc-1',
    name: 'ORC 폐열발전',
    icon: 'heat_pump',
    excelId: 'AS-ORC-01',
    // 연료전지 공장 부지(전체 24,463㎡) 안 400㎡ — 수소 옆에 임시로
    lng: 129.3008,
    lat: 35.5143,
    locationNote: '연료전지 부지 내 (임시)',
    status: '3차년도 구축 — 시운전 → 정상운전',
    specs: [
      { label: '유형', value: '폐열회수발전 — 연료전지 배열 활용' },
      { label: '설비용량', value: '1.8 MW' },
      { label: '설치부지', value: '400㎡ (10×40m), 연료전지 부지 내' },
      { label: '계통연계', value: '연료전지 경로 공유 (매암변전소 경유)' },
    ],
    expected: [
      {
        group: '운전 (1분)',
        items: [
          { label: '가동상태 (시운전/정상운전)' },
          { label: '전기생산량', unit: 'kWh' },
          { label: '열생산량', unit: 'Gcal' },
        ],
      },
      {
        group: '전기 (0.1초 → 1분 조정 검토)',
        items: [
          { label: '전류', unit: 'A' },
          { label: '전압', unit: 'V' },
          { label: '전력', unit: 'kW' },
        ],
      },
      {
        group: '안전·알람 (1분)',
        items: [{ label: '열화상' }, { label: '연기감지' }, { label: '진동·온도 알람' }],
      },
    ],
    pmTarget: 'ORC 1기 — 터빈·펌프 등 회전기기',
    dataNote: '울산미포ORC발전1호·에스앤아이 확인 필요 — 수소와 동일 구조, 수소누수 항목만 없음',
  },
  {
    id: 'ess-v2g-st',
    name: 'ESS',
    icon: 'battery_charging_full',
    excelId: 'AS-ESS-01',
    // 위치 자체가 미확정 — 산단 안 임시 지점
    lng: 129.34,
    lat: 35.512,
    locationNote: '위치 미확정 — 임시 지점',
    status: 'V2G 스테이션과 한 묶음 구축 — 데이터 연계 확인 후 작업',
    specs: [
      { label: '구성', value: 'PCS 300kW / 배터리 270kWh' },
      { label: '소속', value: 'V2G 스테이션 (분산에너지자원 한 묶음)' },
      { label: '담당', value: '울산테크노파크' },
    ],
    expected: [
      {
        group: '운전 (1분, PCS/BMS I/F)',
        items: [
          { label: 'SOC (충전 잔량)', unit: '%' },
          { label: '충/방전 전력·방향', unit: 'kW' },
          { label: '배터리 온도', unit: '℃' },
        ],
      },
    ],
    pmTarget: 'PCS·배터리 1식',
    dataNote: '계획서에 별도 수집 항목이 없는 도출 항목 — V2G 스테이션 수집 경로 포함 여부 아이티공간 확인 필요',
  },
  {
    id: 'v2g-st',
    name: 'V2G 스테이션',
    icon: 'ev_station',
    excelId: 'AS-V2G-01',
    // ESS 와 같은 스테이션 — 바로 옆 임시 지점
    lng: 129.3403,
    lat: 35.5117,
    locationNote: '위치 미확정 — 임시 지점',
    status: '5월 계약 체결 — 9월 말 준공 검수 예정 (3차년도 고도화)',
    specs: [
      { label: '구성', value: '양방향 충전기 6대 — 급속 2 · 완속 4' },
      { label: '담당', value: '울산테크노파크' },
    ],
    expected: [
      {
        group: '운전 (1분)',
        items: [
          { label: '충전기별 충/방전 상태 · 차량 접속' },
          { label: '충전량', unit: 'kWh' },
          { label: '방전량', unit: 'kWh' },
        ],
      },
      {
        group: '전기 (0.1초 → 1분 조정 검토)',
        items: [
          { label: '전류', unit: 'A' },
          { label: '전압', unit: 'V' },
          { label: '전력', unit: 'kW' },
        ],
      },
      {
        // 3.데이터목록 No.12 — V2G 스테이션 단위 화재·안전
        group: '안전 (1분)',
        items: [{ label: '열화상' }, { label: '연기감지' }],
      },
    ],
    pmTarget: '양방향 충전기 6대',
    dataNote: '충전기 I/F + 아이티공간 수신 여부 확인 필요 — 조감도·외관사진은 울산테크노파크에 요청',
  },
];
