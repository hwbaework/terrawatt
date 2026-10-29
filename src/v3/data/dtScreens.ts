/* 디지털트윈 화면 정의.

   ★ 기준 문서 = "RMS_울산에자자 플랫폼 기능_사업계획서 3차년도 기준.xlsx" (2026-07-31 사용자 제공).
     기능별 구현여부·담당·마감이 명시된 공식 표. DT 관련 행:
       #8  분산에너지 효율화-시뮬레이션 (일부완료 — 태양광 시뮬만, 기타 분산자원 미적용)
       #15 통합관제-DT: 안전예방(과열 감시) + 재해 시뮬레이션 (미구현, 10월 초)
       #16 통합관제-예지보전·안전: AI 예지보전·과열 감지·연기 감지 (미구현, 10월 초)
       #17 디지털 SOP (미구현, 10월 초) · #14 DiSOP 자체가 하반기 개발 예정
       #18 주요 적용기술-디지털트윈: 안전관리·설비 상태 확인·설비 효율/예지보전 (일부완료, 10월 초)
       #19~24 디지털트윈(상세) 6종 (활용계획 — 추가 개발 범위)
       #25 후보지 추천 (완료, 플랫폼 측)

   ⚠️ 여기 있는 값들은 **거의 전부 계측값**이다(전류·전압, 건전성 지수, 발전량, 열화상 …).
      실제로 재야 나오는 숫자라 임의로 채우지 않는다. 대신 **무엇을 어디서 얼마 주기로
      받아올지**를 확정해 둔다 — 연동이 되면 이 파일의 status 만 바꾸면 화면이 켜진다.

   화면에 항목을 더하거나 빼려면 이 파일만 고치면 된다. */

export type DtStatus =
  /** 아직 데이터 공급원이 없음 — 값 자리만 보여준다 */
  | 'waiting'
  /** 실제로 값이 들어오고 있음 */
  | 'live'
  /** 시간에 따라 변하지 않는 고정 정보 — 지금도 표시 가능 */
  | 'spec';

export interface DtItem {
  label: string;
  unit?: string;
  /** 이 값을 어디서 받아오는가 */
  source: string;
  /** 갱신 주기 */
  period?: string;
  status: DtStatus;
  note?: string;
  /** 지금도 보여줄 수 있는 값 (status가 'spec'일 때만) */
  value?: string;
}

export interface DtGroup {
  title: string;
  items: DtItem[];
}

export interface DtScreen {
  id: string;
  name: string;
  /** 아이콘 — 폰트 서브셋에 있는 것만 쓸 수 있다(index.css 주석 참고) */
  icon: string;
  /** 계획서 근거 쪽수 */
  pages: string;
  /** 한 줄 설명 */
  summary: string;
  /** 서랍 폭 — 표·그래프가 들어가는 화면은 'wide' */
  width?: 'normal' | 'wide';
  /** 인버터 표를 붙일지 (발전소 상세 전용) */
  inverterTable?: boolean;
  /** true면 아이콘 바에 안 뜬다 — 정의는 남기고 나중에 다루려는 화면 */
  deferred?: boolean;
  groups: DtGroup[];
}

/** 지금 화면에 띄울 것들 */
export const ACTIVE_SCREENS = () => DT_SCREENS.filter((s) => !s.deferred);

export const DT_SCREENS: DtScreen[] = [
  /* ── 발전소 상세 — **한일튜브 본인이 보는 화면**.
        통합관제(관리자가 울산미포 전체를 보는 것)와 대상이 다르다.
        항목은 울산미포 모니터링 '발전소 상세' 화면을 기준으로 잡았다. ── */
  {
    id: 'plant',
    name: '발전소 상세',
    icon: 'solar_power',
    pages: '',
    summary: '내 발전소 하나를 깊게 본다',
    groups: [
      {
        title: '설비 상태',
        items: [
          { label: 'RTU 전원', source: 'LASEE', period: '60초', status: 'waiting' },
          { label: 'RTU 통신', source: 'LASEE', period: '60초', status: 'waiting' },
          { label: '인버터 통신', source: 'LASEE', period: '60초', status: 'waiting', note: '4대 기준' },
          { label: '마지막 수집 시각', source: 'LASEE', period: '60초', status: 'waiting' },
        ],
      },
      {
        title: '발전 현황',
        items: [
          { label: '현재 출력', unit: 'kW', source: 'LASEE', period: '60초', status: 'waiting' },
          { label: '가동률', unit: '%', source: '현재 출력 ÷ 설비 용량', period: '60초', status: 'waiting' },
          { label: '금일 발전량', unit: 'kWh', source: 'LASEE', period: '60초', status: 'waiting' },
          { label: '금일 발전시간', unit: 'h', source: 'LASEE', period: '60초', status: 'waiting' },
          { label: '누적 발전량', unit: 'kWh', source: 'LASEE', period: '60초', status: 'waiting' },
          {
            label: '설비 용량',
            unit: 'kW',
            source: '설비 사양',
            status: 'spec',
            value: '429.44',
            note: '인버터 4대',
          },
        ],
      },
      {
        title: '추이 그래프',
        items: [
          { label: '금일 발전량 추이', source: 'LASEE 누적 발전량', period: '60초', status: 'waiting' },
          { label: '실시간 출력 추이', source: 'LASEE AC·DC 전력', period: '60초', status: 'waiting' },
          { label: '24시간 출력 추이', source: 'LASEE AC 출력', period: '1분', status: 'waiting' },
        ],
      },
      {
        title: '이상감지',
        items: [{ label: '최근 7일 이상 감지 내역', source: '이상감지 분석', status: 'waiting' }],
      },
    ],
  },

  /* ── ⑤ 통합관제 — **관리자(울산미포 전체)가 보는 화면**. 한일튜브 본인이 보는 '발전소 상세'와 대상이 다르다.
        2026-07-29 사용자 지시로 잠시 내려둠(정의는 유지). 다시 띄우려면 deferred 를 지우면 된다. ── */
  {
    id: 'control',
    name: '통합관제',
    icon: 'factory',
    pages: 'p.160',
    summary: '발전량·기후·시장가격을 한 화면에서 본다',
    deferred: true,
    groups: [
      {
        title: '발전량',
        items: [
          { label: '금일 발전량', unit: 'kWh', source: 'LASEE', period: '1분', status: 'waiting' },
          { label: '전일 발전량', unit: 'kWh', source: 'LASEE', period: '1일', status: 'waiting' },
          { label: '주간 발전량', unit: 'kWh', source: 'LASEE', period: '1일', status: 'waiting' },
          { label: '월간 발전량', unit: 'kWh', source: 'LASEE', period: '1일', status: 'waiting' },
          { label: '연간 발전량', unit: 'kWh', source: 'LASEE', period: '1일', status: 'waiting' },
        ],
      },
      {
        title: '발전원별',
        items: [
          { label: '태양광', unit: 'kW', source: 'LASEE', period: '1분', status: 'waiting' },
          { label: '연료전지', unit: 'kW', source: 'LASEE', period: '1분', status: 'waiting', note: '설비 도입 시' },
          { label: 'ORC', unit: 'kW', source: 'LASEE', period: '1분', status: 'waiting', note: '설비 도입 시' },
          { label: 'V2G', unit: 'kW', source: 'LASEE', period: '1분', status: 'waiting', note: '설비 도입 시' },
        ],
      },
      {
        title: '가동 상태',
        items: [
          { label: '가동상태', source: 'LASEE', period: '1분', status: 'waiting' },
          { label: '전기생산량', unit: 'kWh', source: 'LASEE', period: '1분', status: 'waiting' },
          { label: '열생산량', unit: 'kWh', source: 'LASEE', period: '1분', status: 'waiting' },
        ],
      },
      {
        title: '외부 데이터',
        items: [
          { label: '기상 관측', source: '기상청 API허브', period: '1시간', status: 'waiting', note: '키 발급 필요' },
          { label: 'SMP', unit: '원/kWh', source: '한전 KPX / EPSIS', period: '5분', status: 'waiting' },
          { label: 'REC', unit: '원/kWh', source: '한전 KPX / EPSIS', period: '1일', status: 'waiting' },
        ],
      },
      {
        title: '융합 표출',
        items: [
          { label: 'RE100 달성률', unit: '%', source: '발전량 ÷ 사용량', period: '1분', status: 'waiting' },
          { label: 'FEMS 사용량', unit: 'kWh', source: '입주기업 FEMS(협약)', period: '1분', status: 'waiting' },
          { label: 'DiSOP 워크플로 상태', source: 'DiSOP 연동', status: 'waiting' },
          { label: '설비 장애·위험 조치 이력', source: 'DiSOP 연동', status: 'waiting' },
        ],
      },
    ],
  },

  /* ── ① 예지보전 ── */
  {
    id: 'predictive',
    name: '예지보전',
    icon: 'power',
    pages: 'p.160·161·167·171',
    summary: '설비가 언제 고장 날지 미리 본다',
    groups: [
      {
        /* 출처 재확정(2026-08-26) — ITS v1.2 명세: 수집 1초 내외(grp0), 외부 조회 10초 이상 */
        title: '실시간 전기 데이터 (DX 전기설비)',
        items: [
          { label: '전류 R/S/T', unit: 'A', source: 'DX API-003 current_rst', period: '10초', status: 'waiting' },
          { label: '전압 R/S/T', unit: 'V', source: 'DX API-003 voltage_rst', period: '10초', status: 'waiting' },
          { label: '전력', unit: 'W', source: 'DX API-003 active_power', period: '10초', status: 'waiting' },
          { label: '역률·주파수', source: 'DX API-003 power_factor·frequency', period: '10초', status: 'waiting' },
        ],
      },
      {
        /* 잔여수명·정비 이상 시기 예측은 뺐다(2026-08-26) — API 명세에 소스가 없어 사용할 수 없는 데이터.
           Health Index 추세로 파생 가능해지면 그때 되살린다 */
        /* 등급(API-006 riskLevel)은 0~100 점수 쪽이라 안전으로(2026-10-29 사용자 — 울산 플랫폼 기준) */
        title: '설비 상태',
        items: [
          { label: '건전성 지수 (Health Index)', source: 'DX API-003 health', period: '1시간', status: 'waiting', note: 'peak/mean/area 통계' },
          { label: '발전량 예측', source: '아이티공간 발전량 예측(문서 6.3)', period: '15분', status: 'waiting', note: '외부 제공 전' },
        ],
      },
      {
        title: '알람·상태',
        items: [
          { label: '이상탐지 알람', source: '모니터링 S/W(p.165)', status: 'waiting' },
          { label: '알람 조회', source: '모니터링 S/W(p.165)', status: 'waiting' },
          { label: '데이터 통신 상태', source: '모니터링 S/W(p.165)', status: 'waiting' },
          { label: '설비 상태', source: '모니터링 S/W(p.165)', status: 'waiting' },
        ],
      },
    ],
  },

  /* ── ② 안전예방·화재 ──
        ★ 2026-08-26 재정리: ITS_울산_에자자_수집데이터_API_명세서_v1.2 로 **실제 받을 수 있는 값**과
          아닌 것을 갈랐다. 안전 = DX 전기안전지수(API-006/007) 0~100 점수만(2026-10-29 — 센서가 잰 값은 예지보전).
          열화상 카메라·연기 감지는 명세에 없다 — 별도 센서 도입 전엔 못 받는 값이라 그렇게 표기. ── */
  {
    id: 'safety',
    name: '안전·화재 DiSOP',
    icon: 'warning',
    pages: 'p.160~162',
    summary: '과열·연기·누수를 미리 잡는다',
    groups: [
      {
        title: '전기안전지수 (DX)',
        items: [
          { label: '전기안전지수', source: 'DX API-006 safetyIndex', period: '5분', status: 'waiting', note: '0~100' },
          { label: '등급', source: 'DX API-006 riskLevel', period: '5분', status: 'waiting', note: '5단계 danger/warning/caution/watch/normal (연계 v1.1)' },
          { label: '항목별 위험점수', source: 'DX API-006 risks', period: '5분', status: 'waiting', note: '전류·전압·누설·고조파·온도·역률·아크, 0~100 정수' },
          { label: '아크 지수', source: '아이티공간 아크 지수(문서 6.4)', status: 'waiting', note: '시범 산출 중 · 판정 보류' },
        ],
      },
      /* ⚠️ 화면에서 뺀 항목(2026-08-26 사용자 확정 — "데이터가 없으면 사용할 수 없는 데이터"):
           열화상(셀·접속함·인버터) / 연기 감지 / 연료전지 수소 누수.
           사업계획서 #16에는 있으나 API 명세(v1.2)에 데이터 소스가 없다(전 시트 전수 검색 0건).
           센서·API 경로가 확정되면 그때 항목으로 되살린다 — 아이티공간에 공급 경로 확인 필요. */
    ],
  },

  /* ── ③ 효율화 시뮬레이션 ──
        ★ 3차년도 기능표 #8이 정의를 준다: "물리적 분산에너지 자원 **발전량 등의 성능을 가상화하여
          시뮬레이션**, 최적 에너지 Mix 도출(DT 적용)" — 구현여부 '일부완료: 태양광 기준 시뮬만'.
          즉 이 화면의 실체 = **태양광 발전량 시뮬레이션**. v0.2의 날씨 기반 발전 시뮬
          (월별 시나리오·주 단위 재생, NASA 실측 날씨)이 정확히 이것이라 이식 후보.

        ⚠️ 2026-07-29: 옥상 태양광 **증설 검토**로 만들었다가 폐기한 이력 있음 —
           "설치 용량을 늘려라"는 내용은 어떤 자료에도 없고 숫자를 지어냈었다. 반복 금지. ── */
  {
    id: 'efficiency',
    name: '효율화 시뮬',
    icon: 'payments',
    deferred: true,
    pages: 'p.157~158·171',
    summary: '최적 에너지 Mix 도출 (내용 미정)',
    groups: [],
  },

  /* ── ④ 재해 시뮬레이션 ──
        ★ 2026-07-31 최종 정리: 여기서 재해 = **지진·홍수·태풍(자연재해)이 맞음**(사용자 확인).
          단, 이 시뮬은 우리가 개발하지 않는다 — **인천에서 개발된 것을 가져와 그대로 붙일 예정**.
          우리 개발 범위 아님. (그 전에 만들었던 계통도 장애 시뮬은 해석이 달라 폐기함) ── */
  {
    id: 'disaster',
    name: '재해 시뮬레이션',
    icon: 'pause',
    deferred: true, // 인천 개발물 도입 대기 — 우리 화면 없음
    pages: 'p.160·171',
    summary: '지진·홍수·태풍 시뮬 (인천 개발물 도입 예정)',
    groups: [],
  },
];

/** 전체 항목 수 / 연동된 항목 수 — 진행 상황을 한눈에 보기 위해 */
export function dtProgress(screen: DtScreen): { total: number; ready: number } {
  const items = screen.groups.flatMap((g) => g.items);
  return { total: items.length, ready: items.filter((i) => i.status !== 'waiting').length };
}
