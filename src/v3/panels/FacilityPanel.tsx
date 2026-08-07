import { FACILITIES } from '../data/facilities';
import { FACILITY_DEMO } from '../data/demoReadings';
import { FACILITY_SPECS, MODEL_SPECS, PLANT_SPECS } from '../data/specs';
import { Drawer, Row, Section } from './Drawer';

/* 시설 정보 — 오른쪽에서 밀려 나오는 패널.

   화면에 넣는 것 = **대표님이 볼 실제 수치**만.
   좌표·모델 출처처럼 만드는 사람이 확인하려고 보던 값은 넣지 않는다(2026-07-29 지시). */

const fmt = (n: number, d = 0) =>
  n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 실적 타일 */
function MetricTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[16px] font-extrabold leading-tight text-white">
        {value}
        <span className="ml-1 text-[10px] font-bold text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

export function FacilityPanel({ facilityId, onClose }: { facilityId: string; onClose: () => void }) {
  const f = FACILITIES.find((x) => x.id === facilityId);
  const spec = FACILITY_SPECS[facilityId];
  const model = MODEL_SPECS[facilityId];
  const plant = PLANT_SPECS[facilityId];
  const m = FACILITY_DEMO;
  if (!f) return null;

  return (
    <Drawer
      title={`${f.name} 울산공장`}
      onClose={onClose}
      subtitle={
        spec && (
          <span className="flex flex-wrap items-center gap-1.5">
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">{spec.dtModel}</code>
            <span className="text-slate-500">3D 트윈 모델</span>
          </span>
        )
      }
    >
      {spec && (
          <Section title="시설 정보">
            <div className="divide-y divide-white/5">
              <Row label="유형">{spec.type}</Row>
              <Row label="주소">{spec.address}</Row>
              {spec.contractKw && <Row label="계약전력">{fmt(spec.contractKw)} kW</Row>}
              {spec.supply && <Row label="공급방식">{spec.supply}</Row>}
              {spec.ppaPriceKrwKwh && (
                <Row label="PPA 단가">
                  ₩{spec.ppaPriceKrwKwh}/kWh{' '}
                  <span className="font-normal text-slate-500">({spec.ppaPriceFrom})</span>
                </Row>
              )}
              {spec.rePercent != null && <Row label="RE 비율">{spec.rePercent}%</Row>}
              {spec.status && (
                <Row label="상태">
                  <span className="text-emerald-400">● {spec.status}</span>
                </Row>
              )}
            </div>
          </Section>
        )}

        <Section title="이달 실적">
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="이달 수요" value={fmt(m.monthDemandKwh)} unit="kWh" />
            <MetricTile label="이달 공급 (RE)" value={fmt(m.monthReSupplyKwh)} unit="kWh" />
            <MetricTile label="최대수요" value={fmt(m.peakKw)} unit="kW" />
            <MetricTile label="RE 달성률" value={fmt(m.reAchievedPercent, 2)} unit="%" />
          </div>

          <div className="mt-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-slate-400">RE100 진행</span>
              {spec?.reTargetPercent && (
                <span className="text-[10px] text-slate-500">목표 {spec.reTargetPercent}%</span>
              )}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-blue-500"
                style={{
                  width: `${Math.min(100, (m.reAchievedPercent / (spec?.reTargetPercent ?? 100)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </Section>

        <Section title="건물">
          <div className="divide-y divide-white/5">
            {model?.dimensionsM && (
              <>
                <Row label="건물 크기">
                  {model.dimensionsM[0]} × {model.dimensionsM[2]} m
                </Row>
                <Row label="높이">{model.dimensionsM[1]} m</Row>
                <Row label="지붕 면적">
                  {fmt(model.dimensionsM[0] * model.dimensionsM[2])} ㎡
                </Row>
              </>
            )}
            {plant && (
              <>
                <Row label="태양광 설비">{fmt(plant.capacityKw, 2)} kW</Row>
                <Row label="인버터">{plant.inverters.length}대 · {plant.inverters[0].ratedKw}kW</Row>
              </>
            )}
          </div>
      </Section>
    </Drawer>
  );
}
