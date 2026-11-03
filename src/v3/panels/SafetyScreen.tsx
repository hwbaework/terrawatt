import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MIcon } from '../../v2/lib/MIcon';
import {
  RISK_ITEMS,
  RISK_LEVEL_LABEL,
  RISK_ORDER,
  hhmm,
  invName,
  isSafetyLate,
  isDxTarget,
  sensorsOf,
  topRisk,
  useDxSafety,
  useDxSafetyHistory,
  type DxSafety,
  type RiskLevel,
} from '../data/umeiDx';
import { Section } from './Drawer';
import { InverterRow, Line, Note, ScoreSummary, TrendEmpty, ValueList } from './DxScoreParts';
import { TrendChart } from './TrendChart';

/* 안전 — 전기안전지수(아이티공간 연계 v1.1 API-006 · 007, 5분). 화면 모양은 예지보전과 같다(DxScoreParts.tsx).
   · 예지보전은 점수만, 안전은 점수 + 등급 5가지(2026-11-03 사용자: 등급은 안전에 있어야 한다).
     센서가 잰 값(℃ · A · %)은 예지보전에 있다 — 여기 넣지 않는다
   · 위 = 인버터 중 가장 나쁜 지수 · 등급([등급]을 누르면 팝업으로 5가지), 아크 지수(판정 보류)
   · 센서별 전기안전지수 = 번호 순(이름은 인버터 #1), 줄 = 지수 · 등급, 누르면 항목별 위험점수(가장 높은 항목 amber) · 산출 시각 · 24시간 추이(올리면 시각 · 지수 · 등급)
   · 계산식은 화면에 쓰지 않는다. 15분 넘게 멈추면 '갱신 지연'(문서 6.2)
   · 등급 색은 울산과 같게 — 위험 · 경고 빨강, 주의 amber, 관찰 회색, 정상 초록 */

const fx = (v: number | null | undefined, d = 1) =>
  v == null ? null : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

const LEVEL_PILL: Record<RiskLevel, string> = {
  danger: 'bg-red-500/15 text-red-300',
  warning: 'bg-red-500/15 text-red-300',
  caution: 'bg-amber-500/15 text-amber-300',
  watch: 'bg-white/10 text-slate-300',
  normal: 'bg-emerald-500/15 text-emerald-300',
};
const LEVEL_HEX: Record<RiskLevel, string> = { danger: '#ef4444', warning: '#ef4444', caution: '#f59e0b', watch: '#64748b', normal: '#10b981' };

function Pill({ level, late }: { level: RiskLevel; late?: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[13px] font-bold ${late ? 'bg-white/10 text-slate-300' : LEVEL_PILL[level]}`}>
      {late ? '갱신 지연' : RISK_LEVEL_LABEL[level]}
    </span>
  );
}

/** [등급] 팝업 — 등급 5가지(riskLevel 코드, 문서 5.4). 서랍의 흐림 효과 안에서는 화면 전체를 덮지 못해 body 로 뺀다.
 *  닫기: X · 바깥 누르기 · Esc */
function LevelsPopup({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="전기안전지수 등급"
        onClick={(e) => e.stopPropagation()}
        className="w-[22rem] max-w-full overflow-hidden rounded-xl border border-white/15 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-[15px] font-extrabold text-white">전기안전지수 등급</h3>
          <button type="button" onClick={onClose} title="닫기" className="rounded-md p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white">
            <MIcon name="close" size={17} />
          </button>
        </div>
        <div className="space-y-2.5 px-4 py-3.5">
          {RISK_ORDER.map((l) => (
            <div key={l} className="flex items-center justify-between text-[14px]">
              <Pill level={l} />
              <span className="font-mono text-slate-300">{l}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-[14px]">
            <Pill level="normal" late />
            <span className="text-slate-300">15분 넘게 산출 없음</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 센서들 중 가장 나쁜 안전 결과— 갱신 중인 것 중 등급이 나쁜 것, 같으면 지수가 낮은 것 */
function worstSafety(xs: DxSafety[]) {
  return xs
    .filter((x) => !isSafetyLate(x))
    .sort((a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel) || (a.safetyIndex ?? 101) - (b.safetyIndex ?? 101))[0];
}

/** 항목별 위험점수 0~100(정수) — 가장 높은 항목(지수를 낮춘 항목)은 amber(문서 6.2), 아크는 제공 전까지 '-' */
function RiskLines({ sf }: { sf: DxSafety }) {
  const top = topRisk(sf);
  const late = isSafetyLate(sf);
  return (
    <>
      {RISK_ITEMS.map((it) => {
        const v = sf.risks[it.key];
        return <Line key={it.key} label={it.label} value={typeof v === 'number' ? fx(v, 0) : null} hot={!late && top?.label === it.label} />;
      })}
    </>
  );
}

/** 인버터 하나 — 전기안전지수 5분 추이(API-007, 최근 24시간). 등급이 바뀐 시각만 그 등급 색 점 */
function SafetyTrend({ mac }: { mac: string }) {
  const hist = useDxSafetyHistory(mac, 24);
  const pts = hist.items.filter((x) => x.safetyIndex != null).map((x) => ({ at: x.windowStartedAt, v: x.safetyIndex as number, l: x.riskLevel }));
  const marks = pts.filter((p, i) => i > 0 && p.l !== pts[i - 1]!.l).map((p) => ({ ...p, color: LEVEL_HEX[p.l] }));
  return (
    <div className="mt-3">
      {pts.length ? (
        <TrendChart
          pts={pts}
          tip={(p) => (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-bold">{fx(p.v)} 점</span>
              <Pill level={p.l} />
            </span>
          )}
          max={100}
          min={Math.max(0, Math.floor(Math.min(...pts.map((p) => p.v)) / 10) * 10 - 10)}
          marks={marks}
          unit="전기안전지수 · 5분 · 점 = 등급이 바뀐 시각"
          label="전기안전지수 24시간 추이"
        />
      ) : (
        <TrendEmpty loading={hist.status === 'loading'} />
      )}
    </div>
  );
}

export function SafetyScreen({ plantCode }: { plantCode: number | undefined }) {
  const sensors = plantCode == null ? [] : sensorsOf(plantCode);
  const safety = useDxSafety(sensors.length ? plantCode : undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);

  const worst = worstSafety(safety.items);
  // 결과가 있는데 모두 15분 넘게 멈췄으면 '갱신 지연'(문서 6.2)
  const allLate = !worst && safety.items.length > 0;

  return (
    <>
      <Section title="전기안전지수">
        <ScoreSummary
          label="전기안전지수"
          labelExtra={
            <button
              type="button"
              onClick={() => setLevelsOpen((v) => !v)}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] font-bold text-slate-200 ring-1 ring-white/15 hover:bg-white/[0.12]"
            >
              등급
            </button>
          }
          value={fx(worst?.safetyIndex)}
          badge={worst ? <Pill level={worst.riskLevel} /> : allLate ? <Pill level="normal" late /> : null}
          notes={['전기안전 점수 0~100, 높을수록 양호', `5분 갱신${worst ? ` · 산출 ${hhmm(worst.diagnosedAt)}` : ''}`]}
        />
        {levelsOpen && <LevelsPopup onClose={() => setLevelsOpen(false)} />}
        {/* 아크 지수 — 시범 산출 중이라 외부 제공 전(문서 6.4) */}
        <div className="mt-1 border-t border-white/5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-slate-200">아크 지수</span>
            <span className="text-[14px] font-bold text-slate-300">판정 보류</span>
          </div>
          <Note className="mt-1">시범 산출 중</Note>
        </div>
      </Section>

      {/* 인버터별 — 번호 순. 줄 = 지수 · 등급, 누르면 항목별 위험점수 · 추이 */}
      <Section title="센서별 전기안전지수">
        <div className="space-y-1.5">
          {sensors.map((s) => {
            const sf = safety.items.find((x) => x.macAddress === s.mac);
            const late = isSafetyLate(sf);
            const target = isDxTarget(s.mac);
            const score = fx(sf?.safetyIndex);
            return (
              <InverterRow
                key={s.mac}
                name={invName(s)}
                dot={!target || safety.status !== 'ok' ? 'none' : !sf || late ? 'stop' : 'on'}
                score={score}
                status={sf ? (late ? <Pill level={sf.riskLevel} late /> : null) : target ? null : '미수신'}
                badge={sf && !late ? <Pill level={sf.riskLevel} /> : null}
                open={open === s.mac}
                onToggle={() => setOpen(open === s.mac ? null : s.mac)}
              >
                {sf ? (
                  <>
                    <ValueList>
                      <Line label="전기안전지수" value={score} />
                    </ValueList>
                    <Note className="mb-1.5 mt-3">항목별 위험점수 (0~100, 높을수록 위험)</Note>
                    <ValueList>
                      <RiskLines sf={sf} />
                      <Line label="산출 시각" value={hhmm(sf.diagnosedAt)} />
                    </ValueList>
                  </>
                ) : (
                  <Note>{target ? '-' : '미수신'}</Note>
                )}
                {target && <SafetyTrend mac={s.mac} />}
              </InverterRow>
            );
          })}
        </div>
      </Section>
    </>
  );
}
