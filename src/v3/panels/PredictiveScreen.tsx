import { INVERTER_HISTORY, invLabel } from '../data/demoReadings';
import { Section } from './Drawer';
import { DxSensorsSection } from './DxSensorsSection';

/* 예지보전 — DX 스마트센서(아이티공간 연계 v1.1)가 본체.
   RTU 전원·통신, 인버터별 현황은 예지보전 항목이 아니라 뺐다(2026-10-20 사용자 확정 — 발전소 상세에 있다).
   AI 진단은 아래에 그대로 둔다(같은 날 확정). */

const VERDICT_STYLE: Record<string, string> = {
  /* 색은 둘뿐(2026-08-31 사용자 확정 — 노란색 금지, 헷갈린다):
       초록 = 정상 / 빨강 = 오류(DX riskLevel 연동 후에만).
       그 사이(점검 필요·교체 검토·통신 없음)는 **회색** — "확실히 좋다고 말할 수 없음"은 무채색으로 */
  정상: 'bg-emerald-500/15 text-emerald-300',
  '점검 필요': 'bg-white/10 text-slate-300',
  '교체 검토': 'bg-white/10 text-slate-300',
};

export function PredictiveScreen({ plantCode }: { plantCode?: number }) {
  const attention = INVERTER_HISTORY.filter((h) => h.verdict !== '정상');

  return (
    <>
      {/* DX 센서별 — Health Index · 전기 측정값 */}
      <DxSensorsSection plantCode={plantCode} />

      <Section title="AI 진단">
        {attention.length > 0 ? (
          attention.map((h) => (
            <div key={h.id} className="rounded-lg bg-white/[0.06] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold text-slate-100">{invLabel(h.id)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${VERDICT_STYLE[h.verdict]}`}>{h.verdict}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-[13px] text-slate-400">모든 인버터가 정상 범위 안에 있습니다.</p>
        )}
      </Section>
    </>
  );
}
