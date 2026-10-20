import { FACILITIES } from '../data/facilities';
import { FACILITY_GEN_DEMO, OTHER_PLANT_DEMO } from '../data/demoReadings';
import { FACILITY_SPECS, PLANT_SPECS } from '../data/specs';
import { Drawer, Row, Section } from './Drawer';

/* 시설 정보 — 오른쪽에서 밀려 나오는 패널.

   화면에 넣는 것 = **대표님이 볼 실제 수치**만.
   좌표·모델 출처처럼 만드는 사람이 확인하려고 보던 값은 넣지 않는다(2026-07-29 지시). */

const fmt = (n: number, d = 0) =>
  n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 실적 타일 — accent(절감액)는 초록 톤으로 도드라지게.
    글자 크기는 어르신도 읽게(2026-08-24 사용자 지적: 라벨·각주가 너무 작아 안 보임) */
function MetricTile({ label, value, unit, sub, accent }: { label: string; value: string; unit: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-3 ${accent ? 'bg-emerald-500/10' : 'bg-white/[0.04]'}`}>
      <div className={`text-[12px] ${accent ? 'text-emerald-200/80' : 'text-slate-400'}`}>{label}</div>
      <div className={`mt-1 text-[20px] font-extrabold leading-tight ${accent ? 'text-emerald-300' : 'text-white'}`}>
        {value}
        <span className={`ml-1 text-[12px] font-bold ${accent ? 'text-emerald-200/70' : 'text-slate-500'}`}>{unit}</span>
      </div>
      {sub && <div className={`mt-1 text-[13px] ${accent ? 'text-emerald-200/70' : 'text-slate-500'}`}>{sub}</div>}
    </div>
  );
}

export function FacilityPanel({ facilityId, onClose }: { facilityId: string; onClose: () => void }) {
  const f = FACILITIES.find((x) => x.id === facilityId);
  const spec = FACILITY_SPECS[facilityId];
  const plant = PLANT_SPECS[facilityId];
  const g = FACILITY_GEN_DEMO;
  if (!f) return null;

  /* 두 번째 발전소 — 한일튜브만큼 상세 도면이 없어 설비 구성 대신 계측값만 보여준다.
     값은 예시(OTHER_PLANT_DEMO) — 상태 낱말은 화면 전체와 같은 정상/오류 둘뿐이다 */
  const other = OTHER_PLANT_DEMO[facilityId];
  if (!plant) {
    return (
      <Drawer title={f.name} onClose={onClose}>
        <Section title="시설 정보">
          <div className="divide-y divide-white/5">
            <Row label="유형">{f.type}</Row>
            {other && <Row label="설치용량">{fmt(other.capacityKw, 2)} kW</Row>}
            {f.plantCode && <Row label="발전소 코드">{f.plantCode}</Row>}
            {other && (
              <Row label="상태">
                <span className={other.status === '정상' ? 'text-emerald-400' : 'text-red-400'}>● {other.status}</span>
              </Row>
            )}
          </div>
        </Section>
        {other && (
          <Section title="발전 실적">
            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="현재 출력" value={fmt(other.currentKw, 1)} unit="kW" />
              <MetricTile label="오늘 누적 발전량" value={fmt(other.todayKwh, 1)} unit="kWh" />
            </div>
          </Section>
        )}
      </Drawer>
    );
  }

  return (
    <Drawer
      title={`${f.name} 울산공장`}
      onClose={onClose}
    >
      {spec && (
          <Section title="시설 정보">
            <div className="divide-y divide-white/5">
              <Row label="유형">{spec.type}</Row>
              <Row label="주소">{spec.address}</Row>
              {/* 자가소비 시설의 핵심 수치 — 계약전력(한전에서 사오는 양)보다 먼저 보여준다 */}
              {plant && <Row label="설치용량">{fmt(plant.capacityKw, 2)} kW</Row>}
              {spec.rePercent != null && <Row label="RE 비율">{spec.rePercent}%</Row>}
              {spec.status && (
                <Row label="상태">
                  {/* 정상이면 초록, 오류면 빨강 — 화면 전체가 이 두 낱말만 쓴다 */}
                  <span className={spec.status === '정상' ? 'text-emerald-400' : 'text-red-400'}>
                    ● {spec.status}
                  </span>
                </Row>
              )}
            </div>
          </Section>
        )}

        {/* 카드가 지금·오늘·이번달을 다 담아 "이달 실적"이라는 이름과 안 맞아 "발전 실적"으로 */}
        <Section title="발전 실적">
          {/* 카드 4장 — 두 안을 섞은 확정안(2026-08-24): 시간축(지금 → 오늘 → 이번달 → 돈).
              순간값은 "출력"(kW) · 돈은 자가소비 절감액(× 157.6원). 값은 예시(demoReadings, 429.44kW 기준 아귀 맞음).
              이전의 수요·RE 공급 카드는 서로 계산이 안 맞아(22.24% ≠ 공급÷수요) 걷어냈다 */}
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="현재 출력" value={fmt(g.currentKw, 1)} unit="kW" />
            <MetricTile label="오늘 누적 발전량" value={fmt(g.todayKwh, 1)} unit="kWh" />
            <MetricTile label="이번달 누적 발전량" value={fmt(g.monthMwh, 1)} unit="MWh" />
            <MetricTile label="이번달 절감액" value={fmt(g.monthSaveManwon, 1)} unit="만원" sub="발전량 × 157.6원" accent />
          </div>
          {/* RE100 진행 막대는 뺐다(2026-08-24) — 달성률(=RE 공급 ÷ 사용량)의 분모인 사용량이
              FEMS 연동 전까지 없고, 쓰던 22.24%는 검산이 안 맞는 예시값이었다. FEMS 연동 시 복귀 */}
        </Section>

        {/* 건물 크기·높이·설치 면적은 제거(2026-09-07 사용자 확정) — 부가 정보 정리. 설비 구성만 남긴다 */}
        <Section title="설비">
          <div className="divide-y divide-white/5">
            {/* 인버터 = 대수·용량 / 모듈 = 모델명만(2026-09-07 사용자 확정) — 그 외 수치는 걷어냄 */}
            {plant && (
              <Row label="인버터">
                {plant.inverters.length}대 · {plant.inverters[0].ratedKw}kW
              </Row>
            )}
            {plant && <Row label="모듈">{plant.module.model}</Row>}
          </div>
      </Section>
    </Drawer>
  );
}
