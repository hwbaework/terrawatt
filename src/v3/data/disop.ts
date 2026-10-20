/* ── 재난 대응 매뉴얼(DiSOP) — 지진·화재·태풍(호우·침수) 단계별 발령 기준·조치 ──
   출처: 「재난 대응 매뉴얼(DiSOP)」 표(2026-09-09 사용자 제공). 표의 내용을 그대로 옮긴다 —
   조치 항목·발령 기준·DT 연출·연계 코드·개발 단계 모두 우리가 지어낸 것이 아니라 문서의 값이다.

   레벨은 셋: 관심(Lv1) → 주의(Lv2) → 경계(Lv3). 화재는 표에 Lv1 이 없다(전파 접수 즉시 Lv2).
   ⚠️ DT 연출은 **유니티(DT-US)의 몫**이라 여기서는 "무엇을 보여줄지" 문구만 담는다. */

export type DisasterId = 'quake' | 'fire' | 'typhoon';
export type LevelNo = 1 | 2 | 3;

export interface DisopLevel {
  level: LevelNo;
  /** 관심 · 주의 · 경계 */
  name: string;
  /** 발령 기준 — "이 레벨은 어느 정도의 상황인가"만 짧게(2026-09-14 사용자 확정).
      표 원문을 요약했다 — 버튼·레벨 번호 같은 운영 방식은 빼고 상황의 크기만 남긴다 */
  trigger: string;
  /** 조치 항목 — 순서대로 진행한다.
      '구조·인명구조'는 쓰지 않는다(2026-09-14 사용자 확정) — 이 사업장 대응은 소방차(119)가 오는 데까지다.
      화재·지진은 연출에 119 진입이 있어 '출동'으로, 연출에 119가 없는 태풍은 '현장 통제'만 남겼다 */
  steps: string[];
  /** DT 연출(비주얼 액션) — 유니티에서 보여줄 장면 */
  scene: string;
  /** 개발 단계 (2차 / 3차) */
  phase: '2차' | '3차';
  /** 대피요령 영상 — 매뉴얼 DT 연출에 "(영상)"이 있는 레벨만.
      step = 영상이 나오는 조치 항목 순번(0부터). 연출 순서상 "대피로 표시" 다음이라 **대피 안내 단계**에 붙였다 */
  video?: { title: string; step: number };
}

export interface Disaster {
  id: DisasterId;
  name: string;
  /** 연계 기능 코드 */
  code: string;
  levels: DisopLevel[];
}

export const DISOP: Disaster[] = [
  {
    id: 'quake',
    name: '지진',
    code: 'DT-EQ-01~06',
    levels: [
      {
        level: 1,
        name: '관심',
        trigger: '반경 100km 안에서 규모 3.0 이상 지진',
        steps: ['지진 감지 및 경보', '대피 준비', '상황 종료'],
        scene: '진앙 위치 파동(리플)·규모 표시 → 종료',
        phase: '3차',
      },
      {
        level: 2,
        name: '주의',
        trigger: '반경 100km 안에서 규모 4.0 이상 지진',
        steps: ['지진 감지 및 경보', '즉시 안정 조치', '대피 안내 및 절차', '피해 구역 확인', '설비 점검'],
        scene: '진앙 위치 파동(리플)·규모 표시 → 건물·구조물 흔들림(진동)·낙하물 연출 → 대피로 표시 → 지진 종료 → 내부 점검(모듈)',
        phase: '3차',
      },
      {
        level: 3,
        name: '경계',
        trigger: '설비·인명 피해가 확인되거나 관계기관 경보가 발령된 상황',
        steps: [
          '지진 감지 및 경보',
          '즉시 안정 조치',
          '긴급 대피 및 이동 경로 안내',
          '피해 구역 확인',
          '119 출동',
          '설비 점검',
        ],
        scene:
          '진앙 위치 파동(리플)·규모 표시(2D UI) → 건물·구조물 흔들림(진동) → 대피로 표시 → 사람 지진 대피요령(영상) → 태양광 모듈 빨간불·피해 구역 표시 → 지진 종료 → 119 진입 → 내부 점검(모듈)',
        phase: '2차',
        video: { title: '지진 대피요령', step: 2 },
      },
    ],
  },
  {
    id: 'fire',
    name: '화재',
    code: 'DT-FIRE-01~05',
    levels: [
      {
        level: 2,
        name: '주의',
        trigger: '화재 발생이 접수된 상황',
        steps: [
          '화재 감지 및 경보',
          '발화 위치 및 위험요소 확인',
          '화재 확산 차단',
          '긴급 대피 및 이동 경로 안내',
          '진화 및 상황 종료',
        ],
        scene:
          '창문에서 연기·화재 시작 연출 → 발화 위치(UI 표시) → 연기 확산(풍하 방향 번짐) → 대피로 표시 → 작은 화재시 행동 강령(영상) → 진화(화염 소멸·연기 소산)',
        phase: '3차',
        video: { title: '작은 화재 시 행동 강령', step: 3 },
      },
      {
        level: 3,
        name: '경계',
        trigger: '불이 번져 인접 건물·위험물·다수 인명이 위험한 상황',
        steps: [
          '화재 감지 및 경보',
          '발화 위치 및 위험요소 확인',
          '화재 확산 차단',
          '긴급 대피 및 이동 경로 안내',
          '소방차 출동',
          '진화 및 상황 종료',
        ],
        scene:
          '창문에서 연기·화재 시작 연출 → 발화 위치(UI 표시) → 화염 확산(풍하 방향 번짐) → 대피로 표시 → 사람 대피요령(영상) → 119 소방차 진입(진입로 주행) → 진화(화염 소멸·연기 소산)',
        phase: '2차',
        video: { title: '화재 대피요령', step: 3 },
      },
    ],
  },
  {
    id: 'typhoon',
    name: '태풍·호우',
    code: 'DT-TYP-01~03',
    levels: [
      {
        level: 1,
        name: '관심',
        trigger: '3시간 45mm · 12시간 80mm 이상의 비',
        steps: ['기상 특보 감시 및 침수 위험 평가', '대피 준비', '상황 종료'],
        scene: '수위 상승(DEM 기반), 비바람·강풍 연출 → 대피로 표시 → 종료',
        phase: '3차',
      },
      {
        level: 2,
        name: '주의',
        trigger: '3시간 60mm · 12시간 110mm 이상의 비, 또는 호우·태풍주의보',
        steps: ['기상 특보 감시 및 침수 위험 평가', '대피 안내 및 절차', '현장 통제', '설비 점검'],
        scene: '수위 상승(DEM 기반), 비바람·강풍 연출 → 대피로 표시 → 사람 대피요령(영상) → 종료 → 내부 점검(모듈)',
        phase: '3차',
        video: { title: '호우·태풍 대피요령', step: 1 },
      },
      {
        level: 3,
        name: '경계',
        trigger: '3시간 90mm · 12시간 180mm 이상의 비, 또는 호우·태풍경보',
        steps: [
          '기상 특보 감시 및 침수 위험 평가',
          '대피 안내 및 절차',
          '피해 구역 확인',
          '현장 통제',
          '설비 점검',
        ],
        scene:
          '수위 상승(DEM 기반), 비바람·강풍 연출 → 대피로 표시 → 사람 대피요령(영상) → 모듈 파손 → 일부 모듈 빨간불 → 종료 → 내부 점검(모듈)',
        phase: '2차',
        video: { title: '호우·태풍 대피요령', step: 1 },
      },
    ],
  },
];

/** 레벨 색 — 표의 색을 그대로: 관심=노랑 / 주의=주황 / 경계=빨강 */
export const LEVEL_STYLE: Record<LevelNo, { on: string; off: string; text: string }> = {
  1: { on: 'bg-amber-400/25 text-amber-200 ring-1 ring-amber-400/50', off: 'bg-white/[0.04] text-slate-400', text: 'text-amber-300' },
  2: { on: 'bg-orange-500/25 text-orange-200 ring-1 ring-orange-400/50', off: 'bg-white/[0.04] text-slate-400', text: 'text-orange-300' },
  3: { on: 'bg-red-500/25 text-red-200 ring-1 ring-red-400/50', off: 'bg-white/[0.04] text-slate-400', text: 'text-red-300' },
};
