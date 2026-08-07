import { revenueWon, totalKwh, PR, type GenSimResult } from '../lib/genSim';
import { FACILITY_SPECS, MODEL_SPECS, PLANT_SPECS } from '../data/specs';
import { HOME } from '../home';
import { money } from './GenResultView';

/* 발전량 시뮬레이션 — 문서(보고서). [문서로 보기]로 연다.
   화면(어두운 앱)과 달리 **밝은 보고서**로, 한일튜브·투자자에게 보여주거나 인쇄/PDF 저장하는 용도.
   숫자는 결과 그대로, 계산 기준을 문서 안에 밝혀 둔다(신뢰). */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function DocReport({ result, onClose }: { result: GenSimResult; onClose: () => void }) {
  const { rows, capacityKw, ppaPrice, weatherYear } = result;
  const total = totalKwh(rows);
  const revenue = revenueWon(rows, ppaPrice);
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
      <div className="print-doc my-auto h-fit w-[210mm] max-w-full rounded-lg bg-white p-[16mm] text-slate-800 shadow-2xl print:my-0 print:rounded-none print:shadow-none">
        <header className="border-b-2 border-slate-800 pb-4">
          <div className="text-[11px] font-bold tracking-wide text-blue-600">TerraWatt · 에너지 디지털트윈</div>
          <h1 className="mt-1 text-[24px] font-extrabold text-slate-900">발전량 시뮬레이션 보고서</h1>
          <div className="mt-1 text-[13px] text-slate-500">
            {HOME.name} 울산공장 · 예측 기간 {first.year}.{first.month} ~ {last.year}.{last.month}
          </div>
        </header>

        {/* 요약 3칸 */}
        <section className="mt-6 grid grid-cols-3 gap-4">
          <SummaryBox label="예상 발전량" value={`${num(total)}`} unit="kWh" />
          <SummaryBox label="월평균" value={`${num(total / rows.length)}`} unit="kWh" />
          <SummaryBox label="예상 수익" value={money(revenue)} accent />
        </section>

        {/* 설비 정보 */}
        <section className="mt-8">
          <h2 className="mb-2 text-[14px] font-bold text-slate-900">설비 정보</h2>
          <table className="w-full text-[12.5px]">
            <tbody>
              <SpecRow label="사업장" value={`${HOME.name} 울산공장${spec ? ` · ${spec.address}` : ''}`} />
              {plant && <SpecRow label="태양광 설비" value={`${num(plant.capacityKw, 2)} kW · 인버터 ${plant.inverters.length}대`} />}
              {model?.dimensionsM && (
                <SpecRow label="건물" value={`${model.dimensionsM[0]} × ${model.dimensionsM[2]} m · 높이 ${model.dimensionsM[1]} m`} />
              )}
              {spec?.ppaPriceKrwKwh && <SpecRow label="PPA 단가" value={`${spec.ppaPriceKrwKwh} 원/kWh (${spec.ppaPriceFrom})`} />}
            </tbody>
          </table>
        </section>

        {/* 월별 표 */}
        <section className="mt-8">
          <h2 className="mb-2 text-[14px] font-bold text-slate-900">월별 예상 발전량</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b-2 border-slate-300 text-slate-500">
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
              <tr className="border-t-2 border-slate-800 font-bold">
                <td className="py-2">합계</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right">{num(total)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 계산 기준 */}
        <section className="mt-8 rounded-lg bg-slate-50 p-4">
          <h2 className="mb-2 text-[13px] font-bold text-slate-900">계산 기준</h2>
          <ul className="space-y-1 text-[11.5px] text-slate-600">
            <li>· 일사량 : NASA POWER 위성 관측 — {weatherYear}년 울산 지점 실측값</li>
            <li>· 발전량 : 설비 {num(capacityKw, 2)} kW × 일사량 × 일수 × 종합효율 {PR * 100}%</li>
            <li>· 종합효율(PR) {PR * 100}% : 인버터 손실·오염·온도 손실 포함 (태양광 업계 표준)</li>
            <li>· 예상 수익 : 발전량 × PPA 단가 {ppaPrice}원/kWh</li>
            <li className="text-slate-400">· PPA 단가는 계약값 기준입니다. 실제 계약 단가가 바뀌면 그에 맞춰집니다.</li>
          </ul>
        </section>

        <footer className="mt-6 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
          본 보고서는 예측 시뮬레이션 결과이며, 실제 발전량은 기상·설비 상태에 따라 달라질 수 있습니다.
        </footer>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-1 text-[20px] font-extrabold leading-tight ${accent ? 'text-emerald-600' : 'text-slate-900'}`}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-bold text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="w-32 py-2 text-slate-500">{label}</td>
      <td className="py-2 font-medium text-slate-800">{value}</td>
    </tr>
  );
}
