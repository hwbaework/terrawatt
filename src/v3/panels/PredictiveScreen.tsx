import { DxSensorsSection } from './DxSensorsSection';

/* 예지보전 — DX 스마트센서(아이티공간 연계 v1.1)가 본체: 설비 상태(Health Index) → 인버터별 현황(값 · 추이).
   RTU 전원·통신은 예지보전 항목이 아니라 뺐다(2026-10-20 사용자 확정 — 발전소 상세에 있다).
   AI 진단도 뺐다(2026-10-29 사용자 확정). */

export function PredictiveScreen({ plantCode }: { plantCode?: number }) {
  return <DxSensorsSection plantCode={plantCode} />;
}
