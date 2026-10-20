import { useEffect, useState } from 'react';

/* ── UMEI 외부 연계 API — DX 스마트센서(예지보전 · 전기안전지수) ──
   근거: 아이티공간 「울산에자자_예지보전_데이터_연계_정리_v1.1」(2026-10).
   · API-003 /dx/predictive/latest — 장비마다 최신 측정 1건 + 직전 1시간 Health Index
   · API-006 /dx/safety/latest     — 장비마다 최신 전기안전지수 1건(5분)
   API 키는 브라우저에 두지 않는다. 같은 출처의 '/umei-api' 로 부르면
   개발은 vite 프록시, 배포는 Workers(worker/index.ts)가 키(UMEI_API_KEY)를 붙여 넘긴다.
   키가 없거나 응답이 없으면 값은 '미산출' — 0이나 정상으로 보이지 않게 한다(문서 6.2·7). */

const BASE = '/umei-api/api/v1/external/dx';

/** 대상 DX 센서 — 문서 3장 9대 + 한길 · 건호이엔씨(들어온다고 가정) */
export interface DxSensor {
  plantCode: number;
  deviceName: string;
  mac: string;
}
export const DX_SENSORS: DxSensor[] = [
  { plantCode: 17514, deviceName: '한일튜브1', mac: 'F4:69:D5:38:12:D1' },
  { plantCode: 17514, deviceName: '한일튜브2', mac: 'F4:69:D5:38:12:DF' },
  { plantCode: 17514, deviceName: '한일튜브3', mac: 'F4:69:D5:38:12:D3' },
  { plantCode: 17514, deviceName: '한일튜브4', mac: 'F4:69:D5:38:12:CF' },
  { plantCode: 17511, deviceName: '용인금속01', mac: 'F4:69:D5:38:12:CA' },
  { plantCode: 17511, deviceName: '용인금속02', mac: 'F4:69:D5:38:12:CE' },
  { plantCode: 17558, deviceName: '용인금속03', mac: 'F4:69:D5:38:12:C3' },
  { plantCode: 17558, deviceName: '용인금속04', mac: 'F4:69:D5:38:12:C8' },
  { plantCode: 17512, deviceName: '태성산업', mac: 'F4:69:D5:38:12:D4' },
  // 한길(17515) · 건호이엔씨(17513) — 연계 문서 v1.1 센서 목록에 아직 없음. 들어온다고 가정한 자리(MAC 은 받으면 교체)
  { plantCode: 17515, deviceName: '한길', mac: 'PENDING:17515:01' },
  { plantCode: 17513, deviceName: '건호이엔씨', mac: 'PENDING:17513:01' },
];
/** 사업장 하나에 발전소 코드가 둘인 곳(용인금속 17511·17558)은 둘 다 조회해 합친다 */
export const PLANT_GROUP: Record<number, number[]> = { 17511: [17511, 17558], 17558: [17511, 17558] };
export const sensorsOf = (plantCode: number) => {
  const codes = PLANT_GROUP[plantCode] ?? [plantCode];
  return DX_SENSORS.filter((s) => codes.includes(s.plantCode));
};

/* ── 응답 형식(문서 5장) ── */
export interface DxMeasurement {
  metricCode: string;
  metricName?: string;
  value: number | number[] | null;
  unit?: string;
}
export interface DxHealth {
  healthIndex: number | null;
  peak?: number | null;
  mean?: number | null;
  minVolt?: number | null;
  maxGround?: number | null;
  maxThdi?: number | null;
  maxTemp?: number | null;
  windowStartedAt: string | null;
  windowEndedAt: string | null;
}
export interface DxLatest {
  plantCode: number | null;
  macAddress: string;
  deviceName: string | null;
  observedAt: string;
  receivedAt: string;
  measurements: DxMeasurement[];
  health: DxHealth | null;
}
export type RiskLevel = 'danger' | 'warning' | 'caution' | 'watch' | 'normal';
export type RiskKey = 'current' | 'voltage' | 'leakage' | 'harmonic' | 'temperature' | 'powerQuality' | 'arc' | 'communication';
export interface DxSafety {
  plantCode: number | null;
  plantName: string | null;
  macAddress: string;
  windowStartedAt: string;
  windowEndedAt: string;
  diagnosedAt: string;
  modelName: string;
  modelVersion: string;
  safetyIndex: number | null;
  riskLevel: RiskLevel;
  risks: Partial<Record<RiskKey, number | null>>;
}

/* ── 표시 규칙 ── */
/** 등급 5단계(문서 5.4) — 이름만 그대로 */
export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  danger: '위험',
  warning: '경고',
  caution: '주의',
  watch: '관찰',
  normal: '정상',
};
/** 나쁜 순서 — 요약은 센서 중 가장 나쁜 값(문서 7장) */
export const RISK_ORDER: RiskLevel[] = ['danger', 'warning', 'caution', 'watch', 'normal'];
/** 화면에 보여 줄 위험 항목 — communication 은 참고용이라 뺀다 */
export const RISK_ITEMS: { key: RiskKey; label: string }[] = [
  { key: 'current', label: '전류' },
  { key: 'voltage', label: '전압' },
  { key: 'leakage', label: '누설' },
  { key: 'harmonic', label: '고조파' },
  { key: 'temperature', label: '온도' },
  { key: 'powerQuality', label: '역률' },
  { key: 'arc', label: '아크' },
];
/** 화면에 쓰는 산출 모델은 하나(문서 5.4) */
export const SAFETY_MODEL = 'umei_integrated_safety';

/** 측정값 하나 — 배열이면 그대로, 없으면 null */
export function metric(m: DxLatest | undefined, code: string): number | number[] | null {
  return m?.measurements.find((x) => x.metricCode === code)?.value ?? null;
}
/** 숫자 하나로 — temperature 는 [온도, 습도] 라 첫 값 */
export const firstNum = (v: number | number[] | null): number | null =>
  v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;

/** 'YYYY-MM-DD HH:MM:SS'(KST) → 경과 분 */
export function minutesSince(kst: string | null | undefined, now = Date.now()): number | null {
  if (!kst) return null;
  const t = Date.parse(kst.replace(' ', 'T') + '+09:00');
  return Number.isNaN(t) ? null : (now - t) / 60000;
}
/** 수집 중단 — 최신 receivedAt 이 5분 넘게 멈춤(문서 8-4) */
export const isStale = (d: DxLatest | undefined) => {
  const m = minutesSince(d?.receivedAt);
  return m == null || m > 5;
};
/** 갱신 지연 — diagnosedAt 이 15분 넘게 지남(문서 6.2) */
export const isSafetyLate = (s: DxSafety | undefined) => {
  const m = minutesSince(s?.diagnosedAt);
  return m == null || m > 15;
};
/** 가장 높은 위험 항목(판정 근거) — 값 없는 항목은 '미산출'이라 제외 */
export function topRisk(s: DxSafety | undefined): { label: string; score: number } | null {
  if (!s) return null;
  let best: { label: string; score: number } | null = null;
  for (const it of RISK_ITEMS) {
    const v = s.risks[it.key];
    if (typeof v === 'number' && (!best || v > best.score)) best = { label: it.label, score: v };
  }
  return best;
}
/** 'HH:MM' — 산출 시각 표시용 */
export const hhmm = (kst: string | null | undefined) => (kst ? kst.slice(11, 16) : '');

/* ── 조회 ── */
type Envelope<T> = { success: boolean; message?: string; data?: { items?: T[] } };

async function getItems<T>(path: string, plantCode: number): Promise<T[]> {
  const res = await fetch(`${BASE}/${path}?plantCode=${plantCode}`);
  // 파라미터 오류도 HTTP 500 으로 오므로 success 를 먼저 본다(문서 8-5)
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!body?.success) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body.data?.items ?? [];
}

export type DxState<T> = { status: 'loading' | 'ok' | 'error'; items: T[]; message?: string };

function usePoll<T>(path: string, plantCode: number | undefined, everyMs: number, filter?: (x: T) => boolean): DxState<T> {
  const [state, setState] = useState<DxState<T>>({ status: 'loading', items: [] });
  useEffect(() => {
    if (plantCode == null) return;
    let alive = true;
    const codes = PLANT_GROUP[plantCode] ?? [plantCode];
    const run = async () => {
      try {
        const all = (await Promise.all(codes.map((c) => getItems<T>(path, c)))).flat();
        if (alive) setState({ status: 'ok', items: filter ? all.filter(filter) : all });
      } catch (e) {
        if (alive) setState({ status: 'error', items: [], message: (e as Error).message });
      }
    };
    void run();
    const t = window.setInterval(run, everyMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [path, plantCode, everyMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/** API-003 — 권장 호출 1분 */
export const useDxLatest = (plantCode: number | undefined) =>
  usePoll<DxLatest>('predictive/latest', plantCode, 60_000);
/** API-006 — 권장 호출 5분, 종합 모델 행만 */
export const useDxSafety = (plantCode: number | undefined) =>
  usePoll<DxSafety>('safety/latest', plantCode, 300_000, (x) => x.modelName === SAFETY_MODEL);

/* ── API-007 전기안전지수 이력 — 선택 센서 추이(최근 24시간 기본, 7일까지) ── */
/** 지금부터 hours 시간 전 ~ 지금, 'YYYYMMDDHHMMSS'(KST) */
function kstStamp(ms: number) {
  return new Date(ms + 9 * 3600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
export function useDxSafetyHistory(mac: string | null, hours = 24): DxState<DxSafety> {
  const [state, setState] = useState<DxState<DxSafety>>({ status: 'loading', items: [] });
  useEffect(() => {
    if (!mac) return;
    let alive = true;
    const run = async () => {
      const now = Date.now();
      const q = new URLSearchParams({
        macAddress: mac,
        startAt: kstStamp(now - hours * 3600_000),
        endAt: kstStamp(now),
        limit: '5000',
      });
      try {
        const res = await fetch(`${BASE}/safety/history?${q}`);
        const body = (await res.json().catch(() => null)) as Envelope<DxSafety> | null;
        if (!body?.success) throw new Error(body?.message ?? `HTTP ${res.status}`);
        // 같은 구간에 여러 모델 행이 오므로 종합 모델만(문서 5.5)
        const items = (body.data?.items ?? []).filter((x) => x.modelName === SAFETY_MODEL);
        if (alive) setState({ status: 'ok', items });
      } catch (e) {
        if (alive) setState({ status: 'error', items: [], message: (e as Error).message });
      }
    };
    setState({ status: 'loading', items: [] });
    void run();
    const t = window.setInterval(run, 300_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [mac, hours]);
  return state;
}

/** DX 센서가 있는 사업장 — 대시보드 발전소 선택 */
export const DX_PLANTS: { code: number; name: string }[] = [
  { code: 17514, name: '한일튜브' },
  { code: 17511, name: '용인금속' },
  { code: 17512, name: '태성산업' },
  { code: 17515, name: '한길' },
  { code: 17513, name: '건호이엔씨' },
];
