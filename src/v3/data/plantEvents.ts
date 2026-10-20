/* ── 설비 이벤트(알람) — "우리가 알 수 있는 것"만 울린다(2026-08-31 사용자 확정) ──
   발전량 0 자체는 이벤트가 아니다: 구름이 50일 이어질 수도 있고, 그게 하늘 탓인지
   설비 탓인지 발전량 숫자만으로는 구분할 수 없다.
   반면 아래 세 가지는 수집 API에 실제로 있는 신호라서, 이때만 "현장 확인" 팝업을 띄운다
   (ITS 명세 rtuPowerState·rtuConnectionState·inverters[].connectionState).

   시연 방식(2026-08-31 사용자 확정): 발전소 상세의 "설비 상태" 항목을 누르면
   그 신호가 왔을 때의 알림을 미리 보여준다 — 타이머 연출이 아니라 상태와 붙어 다니게.
   실연동 시 위 API 필드를 주기 폴링해 이벤트를 만들면 팝업 코드는 그대로다. */
/* 알람 3계열(2026-09-07 사용자 확정) — 전부 실제로 받을 수 있는 신호만:
   ① 설비(rtuPower·rtuComm·inverterComm) — ITS API 상태 필드
   ② 전기안전(safetyArc) — ITS API-006 전기안전지수 riskLevel·risks(arc·과열·누전). "화재 발생"이 아니라 **전조 위험** 알람
   ③ 기상(typhoon) — 기상청 기상특보 오픈 API(태풍·호우 등)
   POC에선 안전·화재 화면의 테스트 버튼으로 띄워 본다(실연동 시 폴링→자동) */
export type PlantEventKind = 'rtuPower' | 'rtuComm' | 'inverterComm' | 'safetyArc' | 'typhoon';

export interface PlantEvent {
  title: string;
  /** 무슨 일이 있었나 — 사람이 읽는 문장 */
  detail: string;
  /** 그래서 뭘 해야 하나 */
  action: string;
  /** 이벤트 판정 시각(HH:MM) — 마지막 수신 15:00(= PLANT_DEMO.todayCurve 끝)과 아귀 맞춤 */
  occurredAt: string;
  /** 좌상단 한일튜브 카드의 상태 배지 — 이벤트 중엔 "가동중" 대신 이걸 빨갛게(2026-08-31 사용자 확정) */
  badge: string;
}

export const PLANT_EVENTS: Record<PlantEventKind, PlantEvent> = {
  rtuPower: {
    title: 'RTU 전원 꺼짐',
    detail: '현장 RTU의 전원이 꺼졌습니다.',
    action: '정전·차단기·전원선 문제일 수 있습니다. 현장 전원 상태를 확인해 주세요.',
    occurredAt: '15:05',
    badge: '전원 꺼짐',
  },
  rtuComm: {
    title: 'RTU 통신 두절',
    detail: '15:00 마지막 수신 후 응답이 없습니다.',
    action: '발전 데이터가 들어오지 않고 있습니다. 현장의 RTU 전원·통신 상태를 확인해 주세요.',
    occurredAt: '15:15',
    badge: '통신 두절',
  },
  inverterComm: {
    title: '인버터 통신 두절',
    detail: '인버터 #2·#3이 RTU 호출에 응답하지 않습니다 (통신 2/4).',
    action: '해당 인버터의 전원·통신선 상태를 확인해 주세요. 나머지 2대는 정상 수집 중입니다.',
    occurredAt: '15:10',
    badge: '인버터 2/4',
  },
  safetyArc: {
    title: '전기화재 위험',
    /* 원인(아크·누설전류 등)은 적지 않는다(2026-09-09 사용자 확정) — 어느 항목 때문인지 단정하는 건
       진단이고, 화재와 얽힌 사안이라 더더욱 근거 없이 말할 수 없다. 등급이 떨어졌다는 사실까지만 알린다 */
    detail: '전기안전지수가 위험 등급으로 떨어졌습니다.',
    action: '전기화재의 전조 신호입니다. 해당 판넬의 차단 여부를 판단하고 현장 점검을 실시해 주세요.',
    occurredAt: '15:12',
    badge: '화재 위험',
  },
  typhoon: {
    title: '태풍경보 발효',
    detail: '기상청이 울산 지역에 태풍경보를 발효했습니다.',
    /* 조치를 시키지 않는다(2026-09-09 사용자 확정) — 모듈은 이미 고정되어 있고,
       현장에서 뭘 할지는 담당자가 안다. 우리는 경보가 났다는 사실과 주의만 전한다 */
    action: '강풍·폭우로 인한 설비 피해에 주의해 주세요.',
    occurredAt: '15:20',
    badge: '태풍경보',
  },
};

/* 인버터 통신 두절 이벤트에서 안 되는 2대 — 어떤 게 안 되는지 목록·값 0 표시까지(2026-08-31 사용자 확정).
   대상은 #2·#3 (2026-09-09 사용자 확정) */
export const INVERTER_COMM_DOWN = ['INV-002', 'INV-003'];
