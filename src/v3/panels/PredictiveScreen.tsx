import { INVERTER_HISTORY, PLANT_DEMO } from '../data/demoReadings';
import { Section } from './Drawer';

/* 예지보전 — "얼마나 나빠졌나 → 언제 바꿔야 하나".

   전류·전압을 나열하지 않는다. 핵심은 **비교**다:
     · 지난달 대비 / 작년 같은 달 대비 — 비교군이 있어야 저하가 보인다
     · 저하 추세를 연장해 교체 검토 시기를 낸다
   통신·설비 상태는 위에 점으로만 둔다.

   값은 예시(demoReadings.ts) — LASEE 월별 이력이 열리면 그 파일만 교체. */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 변화율 표시 — 내려가면 빨강, 미미하면 회색 */
function Delta({ nowV, baseV }: { nowV: number; baseV: number }) {
  const pct = baseV > 0 ? ((nowV - baseV) / baseV) * 100 : 0;
  const bad = pct <= -10;
  return (
    <span className={`text-[11px] font-bold ${bad ? 'text-red-400' : pct < 0 ? 'text-slate-400' : 'text-emerald-400'}`}>
      {pct > 0 ? '+' : ''}
      {num(pct, 1)}%
    </span>
  );
}

const VERDICT_STYLE: Record<string, string> = {
  정상: 'bg-emerald-500/15 text-emerald-300',
  '점검 필요': 'bg-red-500/15 text-red-300',
  '교체 검토': 'bg-amber-500/15 text-amber-300',
};

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`}
    />
  );
}

export function PredictiveScreen() {
  const d = PLANT_DEMO;
  const attention = INVERTER_HISTORY.filter((h) => h.verdict !== '정상');

  return (
    <>
      {/* 통신·설비 상태 — 점으로만 */}
      <Section title="설비 상태">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
          <span className="flex items-center">
            <Dot ok={d.rtuPower} />
            RTU 전원
          </span>
          <span className="flex items-center">
            <Dot ok={d.rtuComm} />
            RTU 통신
          </span>
          <span className="flex items-center">
            <Dot ok />
            인버터 통신 {d.inverterComm}
          </span>
        </div>
      </Section>

      {/* 결론부터 — 뭘 봐야 하나 */}
      <Section title="AI 진단">
        {attention.length > 0 ? (
          attention.map((h) => (
            <div key={h.id} className="rounded-lg bg-red-500/10 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-red-300">{h.id}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${VERDICT_STYLE[h.verdict]}`}>
                  {h.verdict}
                </span>
              </div>
              {h.note && <p className="mt-1 text-[10px] leading-relaxed text-red-200/80">{h.note}</p>}
            </div>
          ))
        ) : (
          <p className="text-[11px] text-slate-400">모든 인버터가 정상 저하 범위 안에 있습니다.</p>
        )}
      </Section>

      {/* 비교군 — 저번달·작년 같은 달 */}
      <Section title="발전량 비교 (월)">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-white/10 text-[9.5px] text-slate-500">
              <th className="py-1.5 text-left font-semibold">인버터</th>
              <th className="py-1.5 text-right font-semibold">이번 달</th>
              <th className="py-1.5 text-right font-semibold">전월 대비</th>
              <th className="py-1.5 text-right font-semibold">작년 대비</th>
            </tr>
          </thead>
          <tbody>
            {INVERTER_HISTORY.map((h) => (
              <tr key={h.id} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-left">
                  <span className="flex items-center font-bold text-slate-200">
                    <Dot ok={h.verdict === '정상'} />
                    {h.id}
                  </span>
                </td>
                <td className="py-2 text-right font-bold text-slate-300">{num(h.thisMonthKwh)}</td>
                <td className="py-2 text-right">
                  <Delta nowV={h.thisMonthKwh} baseV={h.lastMonthKwh} />
                </td>
                <td className="py-2 text-right">
                  <Delta nowV={h.thisMonthKwh} baseV={h.lastYearKwh} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 저하 추세 → 교체 검토 시기 */}
      <Section title="교체 검토 시기">
        <div className="divide-y divide-white/5">
          {INVERTER_HISTORY.map((h) => (
            <div key={h.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-[11px] text-slate-400">{h.id}</span>
              <span className="text-right text-[12px] font-bold text-slate-100">
                {h.replaceBy ?? '점검 후 판단'}
                <span className="ml-2 text-[9.5px] font-normal text-slate-500">
                  연 −{num(h.yearlyDeclinePercent, 1)}%
                </span>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
