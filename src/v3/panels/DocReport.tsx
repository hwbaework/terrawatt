import { useEffect } from 'react';
import { basicSaveWonPerMonth, revenueWon, totalKwh, PR, type GenSimResult } from '../lib/genSim';
import { FACILITY_SPECS, MODEL_SPECS, PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { money } from './GenResultView';

/* 발전량 시뮬레이션 — 문서(보고서). [문서로 보기]로 연다.
   화면(어두운 앱)과 달리 **밝은 보고서**로, 한일튜브·투자자에게 보여주거나 인쇄/PDF 저장하는 용도.
   숫자는 결과 그대로, 계산 기준을 문서 안에 밝혀 둔다(신뢰). */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function DocReport({ result, onClose, autoPrint }: { result: GenSimResult; onClose: () => void; autoPrint?: boolean }) {
  const { rows, capacityKw, ppaPrice, weatherYear } = result;

  /* [PDF로 저장]으로 열렸을 때 — 문서가 그려지자마자 저장(인쇄) 대화상자를 바로 띄우고,
     대화상자가 닫히면(저장했든 취소했든) 문서도 같이 닫는다(2026-08-24 사용자 확정) */
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    const done = () => onClose();
    window.addEventListener('afterprint', done);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [autoPrint, onClose]);
  const total = totalKwh(rows);
  /* 절감액 = 전력량 + 기본요금 — 결과 팝업과 같은 식(2026-08-24) */
  const revenue = revenueWon(rows, ppaPrice) + basicSaveWonPerMonth(capacityKw) * rows.length;
  const spec = FACILITY_SPECS[HOME.facilityId];
  const plant = PLANT_SPECS[HOME.facilityId];
  const model = MODEL_SPECS[HOME.facilityId];
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur print:bg-white print:p-0">
      {/* 화면 위 컨트롤 — 인쇄 시엔 숨김 */}
      <div className="fixed right-6 top-6 z-10 flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-blue-500"
        >
          인쇄 · PDF 저장
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white/15 px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-white/25"
        >
          닫기
        </button>
      </div>

      {/* 보고서 본문 */}
      <div className="print-doc my-auto h-fit w-[210mm] max-w-full rounded-lg bg-white p-[16mm] text-black shadow-2xl print:my-0 print:rounded-none print:shadow-none">
        {/* 문서는 색 없이 전부 검정(2026-08-24 사용자 확정) — 브랜드 줄도 뺐다 */}
        <header className="border-b-2 border-black pb-4">
          <h1 className="text-[24px] font-extrabold text-black">발전량 시뮬레이션 보고서</h1>
          <div className="mt-1 text-[13px] text-black">
            {HOME.name} 울산공장 · 예측 기간 {first.year}.{first.month} ~ {last.year}.{last.month}
          </div>
        </header>

        {/* 요약 3칸 */}
        <section className="mt-6 grid grid-cols-3 gap-4">
          <SummaryBox label="예상 발전량" value={`${num(total)}`} unit="kWh" />
          <SummaryBox label="월평균" value={`${num(total / rows.length)}`} unit="kWh" />
          <SummaryBox label="예상 절감액" value={money(revenue)} accent />
        </section>

        {/* 설비 정보 */}
        <section className="mt-8">
          <h2 className="mb-2 text-[14px] font-bold text-black">설비 정보</h2>
          <table className="w-full text-[12.5px]">
            <tbody>
              <SpecRow label="사업장" value={`${HOME.name} 울산공장${spec ? ` · ${spec.address}` : ''}`} />
              {plant && <SpecRow label="태양광 설비" value={`${num(plant.capacityKw, 2)} kW · 인버터 ${plant.inverters.length}대`} />}
              {model?.dimensionsM && (
                <SpecRow label="건물" value={`${model.dimensionsM[0]} × ${model.dimensionsM[2]} m · 높이 ${model.dimensionsM[1]} m`} />
              )}
            </tbody>
          </table>
        </section>

        {/* 월별 표 */}
        <section className="mt-8">
          <h2 className="mb-2 text-[14px] font-bold text-black">월별 예상 발전량</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b-2 border-black text-black">
                <th className="py-2 text-left font-semibold">월</th>
                <th className="py-2 text-right font-semibold">일사량 (kWh/㎡/일)</th>
                <th className="py-2 text-right font-semibold">예상 발전량 (kWh)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.year}-${r.month}`} className="border-b border-slate-200">
                  <td className="py-2">{r.year}.{String(r.month).padStart(2, '0')}</td>
                  <td className="py-2 text-right">{num(r.irr, 2)}</td>
                  <td className="py-2 text-right font-semibold">{num(r.kwh)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-black font-bold">
                <td className="py-2">합계</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right">{num(total)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 계산 기준 */}
        <section className="mt-8 rounded-lg bg-slate-50 p-4">
          <h2 className="mb-2 text-[13px] font-bold text-black">계산 기준</h2>
          <ul className="space-y-1 text-[11.5px] text-black">
            <li>· 일사량 : NASA POWER 위성 관측 — {weatherYear}년 울산 지점 실측값</li>
            <li>· 발전량 : 설비 {num(capacityKw, 2)} kW × 일사량 × 일수 × 종합효율 {PR * 100}%</li>
            <li>· 종합효율(PR) {PR * 100}% : 인버터 손실·오염·온도 손실 포함 (태양광 업계 표준)</li>
            <li>· 예상 절감액 : 전력량(발전량 × {num(ppaPrice, 1)}원/kWh) + 기본요금(설치용량 × 피크감축 30% × 8,320원 × 개월수)</li>
          </ul>
        </section>

        <footer className="mt-6 border-t border-slate-200 pt-3 text-[10px] text-black">
          본 보고서는 예측 시뮬레이션 결과이며, 실제 발전량은 기상·설비 상태에 따라 달라질 수 있습니다.
        </footer>
      </div>
    </div>
  );
}

/* 문서는 전부 검정 — accent 도 색 대신 테두리 굵기로만 구분(2026-08-24 사용자 확정) */
function SummaryBox({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg bg-white p-4 ${accent ? 'border-2 border-black' : 'border border-slate-300'}`}>
      <div className="text-[11px] text-black">{label}</div>
      <div className="mt-1 text-[20px] font-extrabold leading-tight text-black">
        {value}
        {unit && <span className="ml-1 text-[11px] font-bold text-black">{unit}</span>}
      </div>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-32 py-2 text-black">{label}</td>
      <td className="py-2 font-medium text-black">{value}</td>
    </tr>
  );
}
