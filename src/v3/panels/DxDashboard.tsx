import { useState, type ReactNode } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { InfoHint } from './InfoHint';
import {
  DX_PLANTS,
  RISK_ITEMS,
  RISK_LEVEL_LABEL,
  RISK_ORDER,
  hhmm,
  isSafetyLate,
  isStale,
  minutesSince,
  stopLabel,
  sensorsOf,
  topRisk,
  useDxLatest,
  useDxSafety,
  useDxSafetyHistory,
  type DxLatest,
  type DxSafety,
  type RiskLevel,
} from '../data/umeiDx';

/* 예지보전·안전 통합 대시보드 — 아이티공간 연계 문서 v1.1 7장 구성안 그대로:
   요약 카드 4개 → 설비별 상태 표 · 발전량 실측·예측 추이 → 선택 센서 항목별 위험점수 · 선택 센서 추이.
   · 모든 값에 산출 시각(KST), 갱신 지연이면 회색
   · 값이 없으면 0이 아니라 '미산출', 외부 제공 전 지표(발전량 예측 · 아크)는 '제공 전'
   · Health Index 는 최신값(API-003)만 있고 이력 API가 없어 추이선은 전기안전지수(API-007)만 그린다
   · 색은 셋뿐(사용자 규칙 — 노란색 금지): 초록 정상 / 빨강 위험·경고 / 회색 그 사이·미산출 */

const NONE = '미산출';
const fx = (v: number | null | undefined, d = 1) =>
  v == null ? null : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

const LEVEL_DOT: Record<RiskLevel, string> = {
  danger: 'bg-red-400',
  warning: 'bg-red-400',
  caution: 'bg-slate-400',
  watch: 'bg-slate-400',
  normal: 'bg-emerald-400',
};
const levelBadge = (l: RiskLevel | undefined, late = false) =>
  late || !l
    ? 'border-white/15 text-slate-400'
    : l === 'normal'
      ? 'border-emerald-400/40 text-emerald-300'
      : l === 'danger' || l === 'warning'
        ? 'border-red-400/50 text-red-300'
        : 'border-white/25 text-slate-200';

/** 카드 — 설명(info)은 제목 옆 (i) 에 올리면 보인다 */
function Card({ title, info, children, className = '' }: { title: string; info?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-extrabold text-slate-100">
        {title}
        {info && <InfoHint text={info} label={title} />}
      </h3>
      {children}
    </section>
  );
}
const Note = ({ children }: { children: ReactNode }) => <p className="text-[12px] leading-relaxed text-slate-500">{children}</p>;

type Row = { mac: string; name: string; sf?: DxSafety; lt?: DxLatest };
const rank = (r: Row) => (r.sf && !isSafetyLate(r.sf) ? RISK_ORDER.indexOf(r.sf.riskLevel) : 9);

export function DxDashboard({ onClose, initialPlant = 17514 }: { onClose: () => void; initialPlant?: number }) {
  const [plant, setPlant] = useState(initialPlant);
  const sensors = sensorsOf(plant);
  const latest = useDxLatest(plant);
  const safety = useDxSafety(plant);
  const [picked, setPicked] = useState<string | null>(null);

  const rows: Row[] = sensors
    .map((s) => ({
      mac: s.mac,
      name: s.deviceName,
      sf: safety.items.find((x) => x.macAddress === s.mac),
      lt: latest.items.find((x) => x.macAddress === s.mac),
    }))
    .sort((a, b) => rank(a) - rank(b) || (a.sf?.safetyIndex ?? 101) - (b.sf?.safetyIndex ?? 101));
  const sel = rows.find((r) => r.mac === picked) ?? rows[0];

  // 요약 — 센서 중 가장 나쁜(낮은) 값
  const worst = rows.find((r) => r.sf && !isSafetyLate(r.sf))?.sf;
  // 센서 결과가 모두 15분 넘게 멈췄으면 '미산출'이 아니라 '갱신 지연'(연계 문서 6.2)
  const allLate = !worst && rows.some((r) => r.sf) && rows.every((r) => !r.sf || isSafetyLate(r.sf));
  const many = sensors.length > 1;
  const healths = rows
    .filter((r) => !isStale(r.lt) && r.lt?.health?.healthIndex != null)
    .map((r) => r.lt!.health!)
    .sort((a, b) => (a.healthIndex as number) - (b.healthIndex as number));
  const lowHealth = healths[0];
  const codes = plant === 17511 ? '17511 · 17558' : String(plant);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/[0.97] backdrop-blur-sm">
      <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-5">
        {/* 머리 — 발전소 선택 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.05] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-[16px] font-extrabold text-white">예지보전·안전 대시보드</h2>
            {DX_PLANTS.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => {
                  setPlant(p.code);
                  setPicked(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors ${
                  plant === p.code ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-300 hover:bg-white/10'
                }`}
              >
                {p.name}
              </button>
            ))}
            <span className="text-[12px] text-slate-500">발전소 코드 {codes}</span>
          </div>
          <div className="flex items-center gap-3">
            <InfoHint text="모든 시각은 한국 표준시(KST)입니다. 갱신이 멈춘 값은 회색으로 표시합니다." label="대시보드" align="right" />
            <button type="button" onClick={onClose} title="닫기" className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white">
              <MIcon name="close" size={18} />
            </button>
          </div>
        </div>

        {(latest.status === 'error' || safety.status === 'error') && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[13px] text-slate-400">
            DX 연동 대기 · {safety.message ?? latest.message}
          </div>
        )}

        {/* 요약 카드 4개 */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card
            title="전기안전지수"
            info={`0~100, 높을수록 양호합니다.${many ? ' 센서 중 가장 낮은 값입니다.' : ''} 5분마다 갱신됩니다. 당사 운영 기준의 상태 지표이며 법정 · 표준 판정이 아닙니다. 보호계전기 동작을 대신하지 않습니다.`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className={`text-[30px] font-extrabold leading-none ${worst ? 'text-white' : 'text-slate-500'}`}>{fx(worst?.safetyIndex) ?? (allLate ? '-' : NONE)}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[12px] font-bold ${levelBadge(worst?.riskLevel, allLate)}`}>
                {worst ? RISK_LEVEL_LABEL[worst.riskLevel] : allLate ? '갱신 지연' : '판정 없음'}
              </span>
            </div>
            {worst && <Note>산출 {hhmm(worst.diagnosedAt)}</Note>}
          </Card>
          <Card
            title="설비 상태 (Health Index)"
            info={`설비 상태 점수 0~100, 높을수록 양호합니다.${many ? ' 센서 중 가장 낮은 값입니다.' : ''} 1시간마다 갱신됩니다. 경보 · 등급 판단은 전기안전지수로 합니다.`}
          >
            <div className="mb-2 flex items-baseline gap-1">
              <span className={`text-[30px] font-extrabold leading-none ${lowHealth ? 'text-white' : 'text-slate-500'}`}>{fx(lowHealth?.healthIndex) ?? NONE}</span>
              {lowHealth && <span className="text-[13px] text-slate-500">/ 100</span>}
            </div>
            {lowHealth && <Note>{`${hhmm(lowHealth.windowStartedAt)}~${hhmm(lowHealth.windowEndedAt)}`}</Note>}
          </Card>
          <Card
            title="발전량 예측"
            info="다음 1시간 P50 예측값입니다. 외부 제공 방식(MQTT / API)이 정해지면 연계합니다. P10~P90 은 확률 구간이 아닌 참고 범위입니다."
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[30px] font-extrabold leading-none text-slate-500">제공 전</span>
            </div>
          </Card>
          <Card
            title="아크 지수"
            info="시범 산출 중이라 아직 값이 없고, 0이나 정상으로 표시하지 않습니다. 아크 발생 확률이나 화재 가능성 판정이 아니며, 아크 차단기를 대신하지 않습니다."
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[30px] font-extrabold leading-none text-slate-500">미산출</span>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[12px] font-bold text-slate-400">판정 보류</span>
            </div>
          </Card>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {/* 설비별 상태 표 */}
          <Card title={`설비별 상태 (${rows.length})`} info="등급이 나쁜 순입니다. 줄을 누르면 아래 상세가 그 센서로 바뀝니다.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-[13px]">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[12px] text-slate-500">
                    <th className="py-2 pr-3 font-semibold">센서</th>
                    <th className="py-2 pr-3 font-semibold">전기안전지수</th>
                    <th className="py-2 pr-3 font-semibold">등급</th>
                    <th className="py-2 pr-3 font-semibold">Health</th>
                    <th className="py-2 font-semibold">가장 높은 위험 항목</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const late = isSafetyLate(r.sf);
                    const stale = isStale(r.lt);
                    const t = topRisk(r.sf);
                    const on = sel?.mac === r.mac;
                    return (
                      <tr
                        key={r.mac}
                        onClick={() => setPicked(r.mac)}
                        className={`cursor-pointer border-b border-white/5 last:border-0 ${on ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                      >
                        <td className="py-2 pr-3 font-bold text-slate-100">{r.name}</td>
                        <td className={`py-2 pr-3 font-bold ${r.sf && !late ? 'text-slate-100' : 'text-slate-500'}`}>{fx(r.sf?.safetyIndex) ?? NONE}</td>
                        <td className="py-2 pr-3">
                          {r.sf ? (
                            <span className="flex items-center gap-1.5 text-slate-200">
                              <span className={`h-2 w-2 rounded-full ${late ? 'bg-slate-600' : LEVEL_DOT[r.sf.riskLevel]}`} />
                              {late ? '갱신 지연' : RISK_LEVEL_LABEL[r.sf.riskLevel]}
                            </span>
                          ) : (
                            <span className="text-slate-500">{NONE}</span>
                          )}
                        </td>
                        <td className={`py-2 pr-3 ${!stale && r.lt?.health?.healthIndex != null ? 'text-slate-200' : 'text-slate-500'}`}>
                          {stale ? stopLabel(r.mac, latest.status === 'ok') : (fx(r.lt?.health?.healthIndex) ?? NONE)}
                        </td>
                        <td className="py-2 text-slate-300">{t ? t.label : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 발전량 실측 · 예측 추이 — 예측 외부 제공 전 */}
          <Card
            title="발전량 실측 · 예측 추이"
            info="제공되면 실측은 실선, P50 은 점선, P10~P90 참고 범위는 음영으로 지난 24시간과 향후 36시간을 그리고, 최근 7일 오차율을 함께 보여 줍니다."
          >
            <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[13px] text-slate-500">
              발전량 예측 제공 전
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <RiskBars row={sel} />
          <SafetyTrend row={sel} />
        </div>
      </div>
    </div>
  );
}

/** 선택 센서 — 항목별 위험점수 0~100, 가장 높은 항목 강조 */
function RiskBars({ row }: { row?: Row }) {
  const sf = row?.sf;
  const top = topRisk(sf);
  return (
    <Card title={`선택 센서 상세${row ? `: ${row.name}` : ''} · 항목별 위험점수`} info="항목별 위험점수 0~100, 높을수록 위험합니다. 가장 높은 항목을 강조합니다. 아크는 제공 전까지 미산출입니다.">
      <div className="space-y-2">
        {RISK_ITEMS.map((it) => {
          const v = sf?.risks[it.key];
          const isTop = top?.label === it.label;
          return (
            <div key={it.key} className="flex items-center gap-3 text-[13px]">
              <span className={`w-14 shrink-0 ${isTop ? 'font-bold text-white' : 'text-slate-400'}`}>{it.label}</span>
              {typeof v === 'number' ? (
                <>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className={`h-full rounded-full ${isTop ? 'bg-red-400' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-bold text-slate-200">{fx(v, 0)}</span>
                </>
              ) : (
                <span className="text-slate-500">{NONE}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        {sf && <Note>산출 {hhmm(sf.diagnosedAt)}</Note>}
      </div>
    </Card>
  );
}

/** 선택 센서 — 전기안전지수 5분 추이(최근 24시간). 등급이 바뀐 시각은 점 */
function SafetyTrend({ row }: { row?: Row }) {
  const hist = useDxSafetyHistory(row?.mac ?? null, 24);
  const pts = hist.items
    .filter((x) => x.safetyIndex != null)
    .map((x) => ({ m: minutesSince(x.windowStartedAt) ?? 0, v: x.safetyIndex as number, l: x.riskLevel }));
  const W = 560;
  const H = 180;
  const L = 34;
  const lo = pts.length ? Math.max(0, Math.floor(Math.min(...pts.map((p) => p.v)) / 10) * 10 - 10) : 0;
  const X = (m: number) => L + ((24 * 60 - m) / (24 * 60)) * (W - L - 8);
  const Y = (v: number) => 10 + ((100 - v) / (100 - lo || 1)) * (H - 34);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.m).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const changes = pts.filter((p, i) => i > 0 && p.l !== pts[i - 1]!.l);
  const ticks = [100, Math.round((100 + lo) / 2), lo];
  return (
    <Card title={`선택 센서 추이${row ? `: ${row.name}` : ''}`} info="전기안전지수(5분) 최근 24시간입니다. 등급이 바뀐 시각은 점으로 표시합니다. Health Index 는 이력 API 가 없어 위 카드의 최신값만 있습니다.">
      {pts.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="전기안전지수 24시간 추이">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - 8} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,.08)" />
              <text x={L - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{t}</text>
            </g>
          ))}
          <path d={path} fill="none" stroke="#e2e8f0" strokeWidth="1.6" />
          {changes.map((p, i) => (
            <circle key={i} cx={X(p.m)} cy={Y(p.v)} r="4" fill={p.l === 'normal' ? '#34d399' : p.l === 'danger' || p.l === 'warning' ? '#f87171' : '#94a3b8'} />
          ))}
          <text x={L} y={H - 4} fontSize="11" fill="#64748b">24시간 전</text>
          <text x={W - 8} y={H - 4} textAnchor="end" fontSize="11" fill="#64748b">현재</text>
        </svg>
      ) : (
        <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[13px] text-slate-500">
          {hist.status === 'loading' ? '불러오는 중' : NONE}
        </div>
      )}
    </Card>
  );
}
