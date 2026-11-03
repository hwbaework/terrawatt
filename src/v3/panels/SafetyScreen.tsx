import { useState } from 'react';
import {
  RISK_ITEMS,
  hhmm,
  invName,
  isSafetyLate,
  isDxTarget,
  sensorsOf,
  topRisk,
  useDxSafety,
  useDxSafetyHistory,
  type DxSafety,
} from '../data/umeiDx';
import { Section } from './Drawer';
import { InverterRow, Line, Note, ScoreSummary, TrendEmpty, ValueList } from './DxScoreParts';
import { TrendChart } from './TrendChart';

/* 안전 — 전기안전지수(아이티공간 연계 v1.1 API-006 · 007, 5분). 화면 모양은 예지보전과 같다(DxScoreParts.tsx).
   · 0~100 점수만 — 정상 · 관찰 같은 등급은 표시하지 않는다(2026-11-03 사용자). 응답의 riskLevel 은 받기만 한다
     센서가 잰 값(℃ · A · %)은 예지보전에 있다 — 여기 넣지 않는다
   · 위 = 인버터 중 가장 낮은 지수, 아크 지수(판정 보류)
   · 센서별 전기안전지수 = 번호 순(이름은 인버터 #1), 줄 = 지수, 누르면 항목별 위험점수(가장 높은 항목 amber) · 산출 시각 · 24시간 추이
   · 계산식은 화면에 쓰지 않는다. 15분 넘게 멈추면 '갱신 지연'(문서 6.2) */

const fx = (v: number | null | undefined, d = 1) =>
  v == null ? null : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 갱신 중인 센서 중 가장 낮은 지수 */
function worstSafety(xs: DxSafety[]) {
  return xs
    .filter((x) => !isSafetyLate(x) && x.safetyIndex != null)
    .sort((a, b) => (a.safetyIndex as number) - (b.safetyIndex as number))[0];
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

/** 인버터 하나 — 전기안전지수 5분 추이(API-007, 최근 24시간) */
function SafetyTrend({ mac }: { mac: string }) {
  const hist = useDxSafetyHistory(mac, 24);
  const pts = hist.items.filter((x) => x.safetyIndex != null).map((x) => ({ at: x.windowStartedAt, v: x.safetyIndex as number }));
  return (
    <div className="mt-3">
      {pts.length ? (
        <TrendChart
          pts={pts}
          tip={(p) => `${fx(p.v)} 점`}
          max={100}
          min={Math.max(0, Math.floor(Math.min(...pts.map((p) => p.v)) / 10) * 10 - 10)}
          unit="전기안전지수 · 5분"
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

  const worst = worstSafety(safety.items);

  return (
    <>
      <Section title="전기안전지수">
        <ScoreSummary
          label="전기안전지수"
          value={fx(worst?.safetyIndex)}
          notes={['전기안전 점수 0~100, 높을수록 양호', `5분 갱신${worst ? ` · 산출 ${hhmm(worst.diagnosedAt)}` : ''}`]}
        />
        {/* 아크 지수 — 시범 산출 중이라 외부 제공 전(문서 6.4) */}
        <div className="mt-1 border-t border-white/5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-slate-200">아크 지수</span>
            <span className="text-[14px] font-bold text-slate-300">판정 보류</span>
          </div>
          <Note className="mt-1">시범 산출 중</Note>
        </div>
      </Section>

      {/* 인버터별 — 번호 순. 줄 = 지수, 누르면 항목별 위험점수 · 추이 */}
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
                status={sf ? (late ? '갱신 지연' : null) : target ? null : '미수신'}
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
