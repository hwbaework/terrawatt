import { DX_SENSORS, PLANT_GROUP, SAFETY_MODEL, isDxTarget, type DxFeature, type DxLatest, type DxSafety, type DxSensor, type RiskLevel } from './umeiDx';

/* ── DX 데모 값 — UMEI 응답이 없을 때(키 없음 · 오류 · 빈 응답) 화면을 채운다(2026-10-29 사용자: POC 라 값이 있어야 한다) ──
   울산 플랫폼 데모 목업(src/mocks/poc/dxFixtures.ts)과 같은 식 · 같은 경우의 수 — 두 화면이 같은 숫자를 보인다.
   · 지금 시각의 해 높이로 만든다 — 낮엔 전류 · 전력이 오르고 밤엔 0, 역률은 무부하(밤)라 null(문서 5.4)
   · 정격 = 발전소 설비 용량 ÷ 센서 수(한일튜브 429.44 · 용인금속 152.32 · 태성산업 46.08 · 한길 90.88 · 건호이엔씨 33.92 kW)
   · 경우의 수: 정상 / 관찰(한일튜브3 — 전류 불평형) / 주의(용인금속03 — 누설전류) / 수집 중단 · 갱신 지연(용인금속04)
   · 전기안전지수 = 100 − 가장 높은 위험점수(문서 5.4 응답 예시), 위험점수는 정수. 등급 구간(60 · 80 · 90)은 데모용
   · 실제 API 처럼 연계 대상 9대만(한길 · 건호이엔씨는 응답 없음 → 미수신) */

const rnd = (a: number, b: number) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
/** 해 높이 0~1 — 6시~18시 산 모양(KST) */
const sunAt = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
};
/** 'YYYY-MM-DD HH:MM:SS'(KST) */
const kst = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
const RATED: Record<number, number> = { 17514: 429.44 / 4, 17511: 152.32 / 4, 17558: 152.32 / 4, 17512: 46.08, 17515: 90.88, 17513: 33.92 };
const PROFILE: Record<string, { unbalance?: number; leakage?: number; health: number; staleMin?: number }> = {
  한일튜브1: { health: 96.5 },
  한일튜브2: { health: 98.2 },
  한일튜브3: { health: 93.1, unbalance: 4.8 },
  한일튜브4: { health: 97.0 },
  용인금속01: { health: 97.4 },
  용인금속02: { health: 96.1 },
  용인금속03: { health: 89.6, leakage: 0.17 },
  용인금속04: { health: 95.0, staleMin: 132 },
  태성산업: { health: 97.8 },
};
const idx = (s: DxSensor) => DX_SENSORS.indexOf(s);
const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const profileOf = (s: DxSensor) => PROFILE[s.deviceName] ?? { health: 96 };

function latestOf(s: DxSensor, now: number): DxLatest {
  const p = profileOf(s);
  const at = now - (p.staleMin ?? 0) * 60_000 - 20_000;
  const i = idx(s);
  const sun = sunAt(at);
  const kw = (RATED[s.plantCode] ?? 50) * 0.82 * sun * (0.94 + rnd(i, at / 60_000) * 0.08);
  const amp = sun > 0 ? (kw * 1000) / (Math.sqrt(3) * 380 * 0.97) : 0;
  const ub = p.unbalance ?? 0.9 + rnd(i, 3) * 1.1;
  const hourStart = Math.floor((at + 9 * 3600_000) / 3600_000) * 3600_000 - 9 * 3600_000;
  return {
    plantCode: s.plantCode,
    macAddress: s.mac,
    deviceName: s.deviceName,
    observedAt: kst(at),
    receivedAt: kst(at + 1000),
    measurements: [
      { metricCode: 'current_rst', metricName: 'R/S/T 전류', value: [r(amp * (1 + ub / 200)), r(amp), r(amp * (1 - ub / 200))], unit: 'A' },
      { metricCode: 'voltage_rst', metricName: 'R/S/T 전압', value: [r(380.4 + rnd(i, 4)), r(379.6 + rnd(i, 5)), r(381.1 - rnd(i, 6))], unit: 'V' },
      { metricCode: 'active_power', metricName: '유효 전력', value: Math.round(kw * 1000), unit: 'W' },
      { metricCode: 'power_factor', metricName: '역률', value: sun > 0.05 ? r(96.4 + rnd(i, 7) * 2) : null, unit: '%' },
      { metricCode: 'frequency', metricName: '주파수', value: r(59.98 + rnd(i, at / 60_000) * 0.04, 2), unit: 'Hz' },
      { metricCode: 'ground_current', metricName: '누설/지락 전류', value: r(p.leakage ?? 0.01 + rnd(i, 8) * 0.03, 3), unit: 'A' },
      { metricCode: 'thdi', metricName: '전류 고조파 왜곡률', value: r(sun > 0.05 ? 2.6 + rnd(i, 9) * 2.2 : 7.5 + rnd(i, 9) * 2), unit: '%' },
      { metricCode: 'temperature', metricName: '온도, 습도', value: [r(27 + sun * 9 + rnd(i, 10) * 2), r(48 + rnd(i, 11) * 10)], unit: 'degC' },
      { metricCode: 'current_unbalance', metricName: '전류 불평형률', value: r(ub), unit: '%' },
    ],
    health: {
      healthIndex: p.health,
      peak: r(amp * 1.12),
      mean: r(amp * 0.9),
      maxGround: r((p.leakage ?? 0.03) * 1.2, 3),
      maxThdi: r(sun > 0.05 ? 5.1 : 9.6),
      maxTemp: r(29 + sun * 9),
      windowStartedAt: kst(hourStart - 3600_000),
      windowEndedAt: kst(hourStart),
    },
  };
}

function featureAt(s: DxSensor, t: number): DxFeature {
  const i = idx(s);
  const p = profileOf(s);
  const sun = sunAt(t);
  const kw = (RATED[s.plantCode] ?? 50) * 0.82 * sun * (0.94 + rnd(i, t / 300_000) * 0.08);
  const amp = sun > 0 ? (kw * 1000) / (Math.sqrt(3) * 380 * 0.97) : 0;
  const ub = p.unbalance ?? 0.9 + rnd(i, 3) * 1.1;
  return {
    macAddress: s.mac,
    observedAt: kst(t),
    windowEndedAt: kst(t + 300_000),
    sampleCount: 297 + Math.floor(rnd(i, t / 300_000) * 4),
    measurements: [
      { metricCode: 'current_rst', metricName: 'R/S/T 최대 전류', value: [r(amp * 1.04 * (1 + ub / 200)), r(amp * 1.04), r(amp * 1.04 * (1 - ub / 200))], unit: 'A' },
      { metricCode: 'voltage_mean', metricName: '평균 전압', value: r(380.3 + (rnd(i, t / 300_000) - 0.5) * 1.6), unit: 'V' },
      { metricCode: 'temperature', metricName: '평균 온도', value: r(27 + sun * 9 + rnd(i, t / 300_000) * 1.5), unit: 'degC' },
      { metricCode: 'thdi', metricName: '평균 전류 THD', value: r(sun > 0.05 ? 2.6 + rnd(i, t / 300_000) * 2 : 7.5 + rnd(i, t / 300_000) * 1.8), unit: '%' },
      { metricCode: 'ground_current', metricName: '평균 누설 전류', value: r(p.leakage ?? 0.01 + rnd(i, 8) * 0.03, 3), unit: 'A' },
      { metricCode: 'power_factor', metricName: '평균 역률', value: sun > 0.05 ? r(96.4 + rnd(i, t / 300_000) * 2) : null, unit: '%' },
    ],
  };
}

function safetyAt(s: DxSensor, t: number, now: number): DxSafety {
  const i = idx(s);
  const p = profileOf(s);
  const hoursAgo = (now - t) / 3600_000;
  const wave = Math.sin(t / 2_700_000 + i) * 0.9 + (rnd(i, Math.floor(t / 300_000)) - 0.5) * 0.6;
  const risks: DxSafety['risks'] = {
    current: Math.round(4.5 + rnd(i, 21) * 3 + wave),
    voltage: Math.round(1.5 + rnd(i, 22) * 2),
    leakage: Math.round(0.5 + rnd(i, 23) * 2),
    harmonic: Math.round(2 + rnd(i, 24) * 3),
    temperature: Math.round(1 + sunAt(t) * 3),
    powerQuality: sunAt(t) > 0.05 ? Math.round(1 + rnd(i, 25) * 2) : null,
    arc: null, // 아크 지수 제공 전까지 null(문서 6.4)
    communication: 0,
  };
  if (p.unbalance && hoursAgo < 3) risks.current = Math.round(11 + wave * 0.6);
  if (p.leakage && hoursAgo < 6) risks.leakage = Math.round(28 + wave);
  const top = Math.max(...Object.entries(risks).filter(([k, v]) => k !== 'communication' && typeof v === 'number').map(([, v]) => v as number));
  const index = 100 - top;
  const level: RiskLevel = index < 60 ? 'warning' : index < 80 ? 'caution' : index < 90 ? 'watch' : 'normal';
  const ws = Math.floor(t / 300_000) * 300_000;
  return {
    plantCode: s.plantCode,
    plantName: s.deviceName.replace(/\d+$/, ''),
    macAddress: s.mac,
    windowStartedAt: kst(ws),
    windowEndedAt: kst(ws + 300_000),
    diagnosedAt: kst(ws + 300_000 + 240_000),
    modelName: SAFETY_MODEL,
    modelVersion: 'v1',
    safetyIndex: index,
    riskLevel: level,
    risks,
  };
}

const targetsOf = (plantCode: number) => {
  const codes = PLANT_GROUP[plantCode] ?? [plantCode];
  return DX_SENSORS.filter((s) => isDxTarget(s.mac) && codes.includes(s.plantCode));
};
const sensorOf = (mac: string) => DX_SENSORS.find((s) => s.mac === mac && isDxTarget(s.mac));

/** 최신 조회(API-003 · 006)의 데모 — 발전소 단위 */
export function demoLatest(path: string, plantCode: number): unknown[] {
  const now = Date.now();
  const ss = targetsOf(plantCode);
  if (path === 'predictive/latest') return ss.map((s) => latestOf(s, now));
  if (path === 'safety/latest') return ss.map((s) => safetyAt(s, now - 600_000 - (profileOf(s).staleMin ?? 0) * 60_000, now));
  return [];
}
/** 이력 조회(API-005 · 007)의 데모 — 센서 하나, 5분 단위. 수집이 멈춘 센서는 멈춘 뒤 구간 없음 */
export function demoHistory(path: string, mac: string, hours: number): unknown[] {
  const s = sensorOf(mac);
  if (!s) return [];
  const now = Date.now();
  const late = (profileOf(s).staleMin ?? 0) * 60_000;
  const start = Math.floor((now - hours * 3600_000) / 300_000) * 300_000;
  const out: unknown[] = [];
  if (path === 'predictive/features/history') for (let t = start; t <= now - 300_000 - late; t += 300_000) out.push(featureAt(s, t));
  if (path === 'safety/history') for (let t = start; t <= now - 600_000 - late; t += 300_000) out.push(safetyAt(s, t, now));
  return out;
}
