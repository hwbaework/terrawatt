import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { fetchMonthlyIrradiance } from '../lib/genSim';
import { PV_MODE_LABEL, planPv } from '../lib/pvPlan';
import { runBiz, sensitivity, tariffRateOf, type BizResult } from '../lib/bizSim';
import type { SketchBuilding } from '../map/buildSketch';

/* 사업성 시뮬 결과 팝업 — RMS 태양광 사업성 시뮬레이터 결과 화면(2026-08-19 스크린샷)과 같은 구성·톤:
     밝은 종이 위 흰 카드, 큰 글자. KPI 4장 → 월별 예상 발전량 / 누적 곡선 → 종합 요약 → 민감도 → 연차 표
   ★ 살아 있는 팝업: 오른쪽 "건물 세우기" 폼에서 값을 바꾸면 여기 숫자·그래프가 그 자리에서 바뀐다.
   ★ 창 내리기: [내리기] 로 접으면 사라지는 게 아니라 **결과함(BizDock, 브랜드 카드 아래)** 에 한 줄로 남는다 —
     건물을 지우기 전까지. 시뮬레이션을 돌린 건물마다 한 줄, 누르면 다시 펼친다(2026-08-19 사용자).
   ★ 자리: 큰 창 = 왼쪽 브랜드 카드와 오른쪽 서랍 사이 전체(사용자: 이게 좋았다).
   ⚠️ 사업비·국비·회수기간·J커브 카드는 뺐다(비용은 계약 단계에서 따로). 계산 근거는 lib/bizSim.ts 머리 주석. */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** 원 → "1.0 억원" / "9,773 만원" */
function krw(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${num(n / 1e8, 1)} 억원`;
  if (abs >= 1e4) return `${num(n / 1e4)} 만원`;
  return `${num(n)} 원`;
}

/* NASA 월 일사량 캐시 — 좌표가 같으면 다시 안 부른다 */
const irrCache = new Map<string, Record<number, number>>();
const irrKey = (b: SketchBuilding) => `${b.ring[0].lng.toFixed(2)},${b.ring[0].lat.toFixed(2)}`;
/** 건물 위치의 NASA 월 일사량 — 캐시에 있으면 바로, 없으면 받아서 넣고 onReady */
function useIrradiance(b: SketchBuilding): Record<number, number> | undefined {
  const key = irrKey(b);
  const [irr, setIrr] = useState<Record<number, number> | undefined>(() => irrCache.get(key));
  useEffect(() => {
    if (irrCache.has(key)) {
      setIrr(irrCache.get(key));
      return;
    }
    const c = b.ring.reduce(
      (s, q) => ({ lng: s.lng + q.lng / b.ring.length, lat: s.lat + q.lat / b.ring.length }),
      { lng: 0, lat: 0 },
    );
    let alive = true;
    fetchMonthlyIrradiance(c.lng, c.lat)
      .then((r) => {
        if (Object.keys(r).length === 12) irrCache.set(key, r);
        if (alive) setIrr(irrCache.get(key));
      })
      .catch(() => {
        /* 못 받으면 일수 비례로 그린다 — 화면에 그렇게 표시된다 */
      });
    return () => {
      alive = false;
    };
  }, [key, b.ring]);
  return irr;
}

/* ── 결과함 — 브랜드 카드(스테이션) 바로 아래. 시뮬레이션을 돌린 건물마다 한 줄, 건물을 지우기 전까지 남는다.
      한 줄을 누르면 그 건물의 결과 창이 펼쳐진다. 결과 창을 닫아도 여기로 돌아올 뿐 사라지지 않는다 ── */
export function BizDock({
  buildings,
  openId,
  onOpen,
  tick,
}: {
  buildings: SketchBuilding[];
  openId: string | null;
  onOpen: (id: string) => void;
  tick?: number;
}) {
  const [top, setTop] = useState(260);
  useLayoutEffect(() => {
    const card = document.querySelector('[data-brand-card]');
    if (!card) return;
    // 그릴 때마다 다시 잰다(값이 같으면 setState 안 함 → 무한 반복 없음). 처음 한 번만 재면 어긋날 때가 있었다(실측)
    const measure = () => {
      const next = Math.round(card.getBoundingClientRect().bottom + 10);
      setTop((cur) => (cur === next ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  });
  if (buildings.length === 0) return null;
  return (
    <div
      data-biz-dock
      data-tick={tick}
      style={{ top }}
      className="fixed left-4 z-20 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[12.5px] font-bold text-slate-500">
        <MIcon name="payments" size={13} className="text-blue-600" />
        사업성 결과 {buildings.length}건
      </div>
      {buildings.map((b) => (
        <DockRow key={b.id} b={b} on={b.id === openId} onOpen={() => onOpen(b.id)} />
      ))}
    </div>
  );
}
function DockRow({ b, on, onOpen }: { b: SketchBuilding; on: boolean; onOpen: () => void }) {
  const irr = useIrradiance(b);
  const r = runBiz(b.pv, b.project, irr);
  const isSelf = b.project.mode === 'self';
  return (
    <button
      type="button"
      onClick={onOpen}
      title={on ? '보고 있는 결과' : '결과 창 펼치기'}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border ${on ? 'border-blue-600 bg-blue-500' : 'border-slate-400 bg-sky-300'}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-extrabold text-slate-800">{b.project.customer || b.name}</span>
        {r.year1Krw != null ? (
          <span className="block truncate text-[13px] font-extrabold text-blue-600">
            연 {krw(r.year1Krw)} {isSelf ? '절감' : '매출'}
          </span>
        ) : (
          <span className="block truncate text-[12.5px] text-slate-500">단가표 필요</span>
        )}
        <span className="block truncate text-[12px] text-slate-400">
          {num(b.pv.capacityKw, 1)} kW · 연 {num(r.year1Mwh, 1)} MWh
        </span>
      </span>
      <MIcon name="chevron_right" size={16} className={`shrink-0 ${on ? 'text-blue-600' : 'text-slate-400'}`} />
    </button>
  );
}

/* ── 결과 창 ── */
export function BizResultView({
  building,
  tick,
  onClose,
  showDoc,
  actualMonthlyKwh,
  actualYearlyMwh,
  periodMonths,
}: {
  building: SketchBuilding;
  /** 폼이 바뀔 때마다 +1 — 부모가 새 building 값을 넘기며 다시 그리게 하는 신호(값 자체는 안 쓴다) */
  tick?: number;
  /** 창 내리기 — 결과는 결과함(BizDock)에 남는다 */
  onClose: () => void;
  /** [문서로 보기] 버튼 — 한일튜브 대상일 때만(문서가 한일튜브 사양으로 짜여 있어서) */
  showDoc?: boolean;
  /** 월별 실측 발전량(올해, kWh 12개 — 아직 안 온 달은 null) — 예측 막대 위에 실측 점·선을 겹친다(기존 설비만) */
  actualMonthlyKwh?: (number | null)[];
  /** 연차별 실측 발전량(MWh, 지나간 해만 — 나머지 null) — 연차 표에 실측 열이 생긴다(기존 설비만) */
  actualYearlyMwh?: (number | null)[];
  /** 월별 차트 기간(2026-08-24 복원, 월 단위만): null = 올해 1~12월(실측 비교) / n = 다음 달부터 n개월 예측 */
  periodMonths?: number | null;
}) {
  const b = building;
  const p = b.project;
  const irr = useIrradiance(b);

  const r: BizResult = runBiz(b.pv, p, irr);
  const sens = sensitivity(b.pv, p, irr);
  /* 누적 절감액 예상 범위 — **보수적 종합 범위**(2026-08-24 사용자 확정): 리스크를 한쪽으로 다 몰았을 때.
       하한 = 발전시간 −5%(나쁜 해) × 전력량 단가 −5%(시간대 개편 리스크 — 요금 인하는 실데이터상 사실상 없음) × 상승률 −1%p
       상한 = 발전시간 +5% × 단가 +10%(산업용 +8~9%/yr 인상 실측) × 상승률 +1%p. 폭의 근거는 lib/bizSim.ts 민감도 주석 */
  const A = b.pv.assumption;
  const baseRate = tariffRateOf();
  const rLow: BizResult = runBiz(
    planPv(b.areaM2, { ...A, hoursPerDay: A.hoursPerDay * 0.95 }),
    { ...p, self: { ...p.self, priceRisePctYr: Math.max(0, p.self.priceRisePctYr - 1) } },
    irr,
    { rate: { ...baseRate, energyKrwKwh: baseRate.energyKrwKwh * 0.95 } },
  );
  const rHigh: BizResult = runBiz(
    planPv(b.areaM2, { ...A, hoursPerDay: A.hoursPerDay * 1.05 }),
    { ...p, self: { ...p.self, priceRisePctYr: p.self.priceRisePctYr + 1 } },
    irr,
    { rate: { ...baseRate, energyKrwKwh: baseRate.energyKrwKwh * 1.1 } },
  );

  /* 월별 차트 데이터 — 기간(월 단위, 2026-08-24 복원)에 따라:
       올해(null) = 1~12월 + 실측 오버레이 / n개월 = 다음 달부터 n개월 예측(미래라 실측 없음).
       예측값 = 그 달의 1차년 월별 발전량(계절 분포 그대로 — 24개월 이내라 효율감소 0.5%/yr 영향은 무시 수준) */
  const nowDate = new Date();
  let mValues = r.monthlyKwh;
  let mLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  let mActual = actualMonthlyKwh;
  let monthCardTitle = '월별 예상 발전량';
  if (periodMonths) {
    const startM = nowDate.getMonth() + 1; // 다음 달 (0-based 인덱스)
    mValues = Array.from({ length: periodMonths }, (_, k) => r.monthlyKwh[(startM + k) % 12]);
    mLabels = Array.from({ length: periodMonths }, (_, k) => {
      const cal = (startM + k) % 12;
      const yr = nowDate.getFullYear() + Math.floor((startM + k) / 12);
      return cal === 0 || k === 0 ? `'${String(yr).slice(2)}.${cal + 1}월` : `${cal + 1}월`;
    });
    mActual = undefined;
    const endIdx = startM + periodMonths - 1;
    monthCardTitle = `월별 예상 발전량 (${nowDate.getFullYear() + Math.floor(startM / 12)}.${(startM % 12) + 1} ~ ${
      nowDate.getFullYear() + Math.floor(endIdx / 12)
    }.${(endIdx % 12) + 1})`;
  }
  const isSelf = p.mode === 'self';
  const moneyWord = isSelf ? '절감액' : 'PPA 매출';
  const rate = isSelf ? tariffRateOf() : undefined;
  const name = p.customer || b.name;
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  const fmtMetric = (v: number) => (sens.unit === 'krw' ? krw(v) : `${num(v)} MWh`);

  return (
    <div
      // 왼쪽 브랜드 카드(16rem)와 오른쪽 서랍(21rem) 사이 전체. 밝은 종이 톤 — 시뮬레이터 결과 화면과 같은 느낌
      className="print-target fixed bottom-3 left-[18rem] right-[22.5rem] top-4 z-30 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-slate-800 shadow-2xl"
      style={{ minWidth: 680 }}
      data-tick={tick}
    >
      {/* 머리 */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[19px] font-extrabold text-slate-900">{name} 태양광 사업성 검토</h2>
            <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[13px] font-bold text-white">{PV_MODE_LABEL[p.mode]}</span>
            {/* 화면 전용 배지 — 인쇄물엔 의미 없어 숨김 */}
            <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[13px] font-bold text-emerald-700 print:hidden">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              실시간 — 오른쪽 입력을 바꾸면 바로 반영
            </span>
          </div>
          <p className="mt-1.5 truncate text-[12px] text-slate-500">
            작성일 {dateStr} · 발전 기준: 일평균 {b.pv.assumption.hoursPerDay}h · 분석기간 {r.years}년
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 print:hidden">
          {/* PDF로 저장 — 이 창을 **보이는 그대로** 인쇄/저장(2026-08-26 사용자 확정: 별도 문서 양식 없음).
              index.css 의 @media print 가 이 창(.print-target)만 남기고 전부 숨긴다 */}
          {showDoc && (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-200"
            >
              PDF로 저장
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="닫기 — 결과는 왼쪽 결과함에 남아 있어 언제든 다시 펼칠 수 있음"
            className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          >
            <MIcon name="close" size={18} />
          </button>
        </div>
      </div>

      <div className="print-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {/* KPI 4장 */}
        <div className="grid grid-cols-4 gap-4">
          <Kpi label="연간 예상 발전량 (1차년)" value={num(r.year1Mwh, 1)} unit="MWh" sub="" />
          <Kpi
            label={`연간 ${moneyWord} (1차년)`}
            value={r.year1Krw == null ? '단가표 필요' : krw(r.year1Krw)}
            sub=""
            dim={r.year1Krw == null}
          />
          <Kpi
            label={`${r.years}년 누적 ${moneyWord}`}
            value={r.totalKrw == null ? '단가표 필요' : krw(r.totalKrw)}
            sub=""
            dim={r.totalKrw == null}
          />
          <Kpi label={`${r.years}년 CO₂ 감축`} value={num(r.co2T)} unit="tCO₂" sub="" />
        </div>

        {r.moneyNote && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] font-bold text-amber-800">{r.moneyNote}</p>
        )}
        {rate && (
          <p className="mt-3 text-[13px] text-slate-600" title={rate.source}>
            적용 단가 — 기본요금 <b>{num(rate.basicKrwKw)} 원/kW</b> · 전력량 <b>{num(rate.energyKrwKwh, 1)} 원/kWh</b>
          </p>
        )}

        {/* 그래프 2장 */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Card title={monthCardTitle}>
            <BarChart values={mValues} actual={mActual} labels={mLabels} />
          </Card>
          <Card title={`${r.years}년 누적 ${moneyWord}`}>
            {r.totalKrw == null ? (
              <div className="flex h-[200px] items-center justify-center text-[13px] text-slate-400">단가표가 없어 그릴 수 없습니다</div>
            ) : (
              <LineChart
                values={r.rows.map((x) => (x.cumKrw ?? 0) / 1e6)}
                low={rLow.totalKrw != null ? rLow.rows.map((x) => (x.cumKrw ?? 0) / 1e6) : undefined}
                high={rHigh.totalKrw != null ? rHigh.rows.map((x) => (x.cumKrw ?? 0) / 1e6) : undefined}
                fmt={(m) => krw(m * 1e6)}
              />
            )}
          </Card>
        </div>

        {/* 민감도 — 설명 문구 없이 (2026-08-24 사용자 확정: 카드 부제·범례 설명 전부 금지) */}
        <Card title="민감도 분석" className="mt-4">
          <Tornado sens={sens} fmt={fmtMetric} />
        </Card>

        {/* 연차 표 */}
        <Card title={`${r.years}년간 운영 분석`} className="mt-4">
          <div className="print-scroll max-h-[300px] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-slate-50 text-[12px] text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">년차</th>
                  <th className="px-3 py-2 text-right font-bold">예측 (MWh)</th>
                  {/* 지나간 해엔 실측 열 — 몇 년차 운영 중인지가 표에서 바로 보인다(2026-08-24 사용자 확정) */}
                  {actualYearlyMwh && <th className="px-3 py-2 text-right font-bold">실측 (MWh)</th>}
                  <th className="px-3 py-2 text-right font-bold">{moneyWord} (천원)</th>
                  <th className="px-3 py-2 text-right font-bold">누적 (천원)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {r.rows.map((x) => {
                  const act = actualYearlyMwh?.[x.year - 1] ?? null;
                  const diffPct = act != null ? ((act - x.genMwh) / Math.max(1e-9, x.genMwh)) * 100 : null;
                  return (
                    <tr key={x.year} className="text-slate-700">
                      <td className="px-3 py-1.5">{x.year}차년</td>
                      <td className="px-3 py-1.5 text-right">{num(x.genMwh, 1)}</td>
                      {actualYearlyMwh && (
                        <td className="px-3 py-1.5 text-right">
                          {act == null ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <>
                              <b className="text-blue-800">{num(act, 1)}</b>{' '}
                              <span className={`text-[12px] ${diffPct! < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                ({diffPct! >= 0 ? '+' : ''}{num(diffPct!, 1)}%)
                              </span>
                            </>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right">{x.moneyKrw == null ? '—' : num(x.moneyKrw / 1000)}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-slate-900">{x.cumKrw == null ? '—' : num(x.cumKrw / 1000)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

    </div>
  );
}

/* ── 조각들 ── */
function Kpi({ label, value, unit, sub, dim }: { label: string; value: string; unit?: string; sub: string; dim?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-[12px] font-bold text-slate-500">{label}</div>
      <div className={`mt-1.5 text-[26px] font-extrabold leading-tight ${dim ? 'text-slate-400' : 'text-slate-900'}`}>
        {value}
        {unit && <span className="ml-1 text-[14px] font-bold text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 truncate text-[13px] text-slate-500">{sub}</div>}
    </div>
  );
}
function Card({ title, desc, children, className = '' }: { title: string; desc?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm ${className}`}>
      <div className="text-[14px] font-extrabold text-slate-800">{title}</div>
      {desc && <div className="mt-0.5 text-[13px] text-slate-500">{desc}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
/** 막대 그래프 — 막대 = 예측, 진한 점·선 = 실측(올해, 이미 지난 달까지만 — null 인 달은 안 찍는다).
    차이는 글이 아니라 **툴팁**으로 — 달에 마우스를 올리면 예측·실측·차이(kWh, %)가 뜬다(2026-08-24 사용자 확정) */
function BarChart({ values, labels, actual }: { values: number[]; labels: string[]; actual?: (number | null)[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 200;
  const padL = 46;
  const padR = 8;
  const padB = 22;
  const padT = 18;
  const actualNums = (actual ?? []).filter((v): v is number => v != null);
  const max = Math.max(1, ...values, ...actualNums);
  const bw = (W - padL - padR) / values.length;
  const y = (v: number) => H - padB - ((H - padB - padT) * v) / max;
  const cx = (i: number) => padL + i * bw + bw * 0.5;
  const ticks = 4;
  const hv = hover != null ? values[hover] : null;
  const ha = hover != null && actual ? actual[hover] : null;
  return (
    <div className="relative">
      {/* 범례 — 색 칩으로만 */}
      {actual && (
        <div className="mb-1.5 flex items-center gap-4 text-[12px] font-bold text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-[#60a5fa]" />예측
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-[#1d4ed8]" />실측 (올해)
          </span>
        </div>
      )}
      {/* 툴팁 — 그 달의 예측·실측·차이를 단위와 함께 */}
      {hover != null && hv != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-center shadow-xl"
          style={{ left: `${(cx(hover) / W) * 100}%` }}
        >
          <div className="text-[12px] font-bold text-slate-500">{labels[hover]}</div>
          <div className="text-[13px] font-extrabold text-blue-500">예측 {num(hv)} kWh</div>
          {ha != null && (
            <>
              <div className="text-[13px] font-extrabold text-blue-800">실측 {num(ha)} kWh</div>
              <div className={`text-[12px] font-bold ${ha - hv >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                차이 {ha - hv >= 0 ? '+' : ''}{num(ha - hv)} kWh ({ha - hv >= 0 ? '+' : ''}{num(((ha - hv) / Math.max(1, hv)) * 100, 1)}%)
              </div>
            </>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full">
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = (max * i) / ticks;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y(v) + 3.5} textAnchor="end" fill="#64748b" fontSize={11.5}>
                {num(v / 1000, 0)}k
              </text>
            </g>
          );
        })}
        {values.map((v, i) => {
          const x0 = padL + i * bw;
          const on = hover === i;
          return (
            <g key={i}>
              <rect x={x0 + bw * 0.2} y={y(v)} width={bw * 0.6} height={H - padB - y(v)} rx={3} fill={on ? '#3b82f6' : '#60a5fa'} />
              {/* 값·축 라벨은 막대가 많으면 겹쳐서 솎는다(값은 12개까지, 축은 14개 넘으면 격월) — 정확한 값은 툴팁 */}
              {!actual && values.length <= 12 && (
                <text x={x0 + bw * 0.5} y={y(v) - 5} textAnchor="middle" fill="#334155" fontSize={11.5} fontWeight={700}>
                  {num(v / 1000, 1)}k
                </text>
              )}
              {(values.length <= 14 || i % 2 === 0) && (
                <text x={x0 + bw * 0.5} y={H - 6} textAnchor="middle" fill="#64748b" fontSize={values.length > 14 ? 10.5 : 12}>
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
        {/* 실측(올해) — 진한 점·선 오버레이. 아직 안 온 달(null)은 점을 안 찍고 선도 거기서 끊는다 */}
        {actual && (
          <>
            <path
              d={actual
                .map((v, i) => (v == null ? '' : `${i === 0 || actual[i - 1] == null ? 'M' : 'L'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`))
                .filter(Boolean)
                .join(' ')}
              stroke="#1d4ed8"
              strokeWidth={2}
              fill="none"
            />
            {actual.map((v, i) =>
              v == null ? null : (
                <circle key={`a${i}`} cx={cx(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill="#1d4ed8" stroke="#fff" strokeWidth={1.2} />
              ),
            )}
          </>
        )}
        {/* 마우스 판 — 달마다 세로 띠 */}
        {values.map((_, i) => (
          <rect
            key={`h${i}`}
            x={padL + i * bw}
            y={0}
            width={bw}
            height={H - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
    </div>
  );
}

/** 선 그래프 — 누적 곡선.
    low/high 를 주면 그 사이를 음영(예상 범위)으로 칠하고, 마우스를 올리면 연차별 누적·범위 툴팁(2026-08-24) */
function LineChart({ values, low, high, fmt }: { values: number[]; low?: number[]; high?: number[]; fmt: (vMillion: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 200;
  const padL = 52;
  const padR = 14;
  const padB = 22;
  const padT = 12;
  const max = Math.max(1, ...(high ?? values));
  const n = values.length;
  const x = (i: number) => padL + ((W - padL - padR) * i) / Math.max(1, n - 1);
  const y = (v: number) => H - padB - ((H - padB - padT) * v) / max;
  const lineOf = (vs: number[]) => vs.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const path = lineOf(values);
  const area = `${path} L${x(n - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
  /* 예상 범위 밴드 — 위 경계(high)를 그리고 아래 경계(low)를 거꾸로 이어 닫는다 */
  const band =
    low && high
      ? `${lineOf(high)} ${low
          .map((_, i) => {
            const j = n - 1 - i;
            return `L${x(j).toFixed(1)},${y(low[j]).toFixed(1)}`;
          })
          .join(' ')} Z`
      : null;
  const ticks = 4;
  return (
    <div className="relative">
      {hover != null && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-center shadow-xl"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <div className="text-[12px] font-bold text-slate-500">{hover + 1}년차</div>
          <div className="text-[14px] font-extrabold text-blue-600">누적 {fmt(values[hover])}</div>
          {low && high && (
            <div className="text-[12px] text-slate-500">
              범위 {fmt(low[hover])} ~ {fmt(high[hover])}
            </div>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full">
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = (max * i) / ticks;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y(v) + 3.5} textAnchor="end" fill="#64748b" fontSize={11.5}>
                {num(v)}
              </text>
            </g>
          );
        })}
        {band ? <path d={band} fill="#2563eb" fillOpacity={0.12} /> : <path d={area} fill="#2563eb" fillOpacity={0.1} />}
        {low && high && (
          <>
            <path d={lineOf(high)} stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
            <path d={lineOf(low)} stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
          </>
        )}
        <path d={path} stroke="#2563eb" strokeWidth={2.5} fill="none" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill="#2563eb" />
        ))}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="rgba(37,99,235,.35)" strokeWidth={1} />
        )}
        {/* 마우스 판 — 연차마다 세로 띠 */}
        {values.map((_, i) => (
          <rect
            key={`h${i}`}
            x={i === 0 ? padL : (x(i - 1) + x(i)) / 2}
            y={0}
            width={(W - padL - padR) / Math.max(1, n - 1)}
            height={H - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {values.map((_, i) =>
          (n <= 12 || i % 2 === 0) && (
            <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor="middle" fill="#64748b" fontSize={12}>
              {i + 1}년
            </text>
          ),
        )}
      </svg>
    </div>
  );
}

/** 민감도 — 토네이도 차트(2026-08-24 사용자 확정 형식):
    한 칸 = 「조건(작게) / 금액(크게)」 두 줄 스택, 변화율(±%)은 막대 **안**에 —
    괄호·화살표 없이 "이 값이면 → 이 금액"만 또렷하게. 각주·설명 문구 없음 */
function Tornado({ sens, fmt }: { sens: ReturnType<typeof sensitivity>; fmt: (v: number) => string }) {
  const span = Math.max(1e-9, ...sens.rows.map((r) => Math.max(Math.abs(r.low.value - sens.base), Math.abs(r.high.value - sens.base))));
  const pctOf = (v: number) => ((v - sens.base) / sens.base) * 100;
  /** 조건(작게) 위, 금액(크게) 아래 — 한 칸 */
  const Side = ({ input, value, right }: { input: string; value: number; right?: boolean }) => {
    const cls = value - sens.base < 0 ? 'text-red-600' : 'text-emerald-700';
    return (
      <span className={`leading-tight ${right ? 'text-left' : 'text-right'}`}>
        <span className="block whitespace-nowrap text-[12px] text-slate-400">{input}</span>
        <span className={`block whitespace-nowrap text-[15px] font-extrabold ${cls}`}>{fmt(value)}</span>
      </span>
    );
  };
  /** 막대 — 변화율 숫자를 막대 안(짧으면 옆)에 */
  const Bar = ({ delta, width, right }: { delta: number; width: number; right?: boolean }) => {
    const neg = delta < 0;
    const label = `${pctOf(sens.base + delta) >= 0 ? '+' : ''}${num(pctOf(sens.base + delta), 0)}%`;
    return (
      <div className={`relative h-6 w-[130px] shrink-0 bg-slate-100 ${right ? 'rounded-r' : 'rounded-l'}`}>
        <div
          className={`flex h-6 items-center ${neg ? 'bg-red-400' : 'bg-emerald-400'} ${
            right ? 'rounded-r justify-end pr-1.5' : 'ml-auto rounded-l justify-start pl-1.5'
          }`}
          style={{ width: `${Math.max(width, 4)}%` }}
        >
          {width >= 22 && <span className="text-[11.5px] font-extrabold text-white">{label}</span>}
        </div>
        {width < 22 && (
          <span
            className={`absolute top-1/2 -translate-y-1/2 text-[11.5px] font-bold text-slate-400 ${
              right ? 'left-[calc(4%+8px)]' : 'right-[calc(4%+8px)]'
            }`}
            style={right ? { left: `calc(${Math.max(width, 4)}% + 6px)` } : { right: `calc(${Math.max(width, 4)}% + 6px)` }}
          >
            {label}
          </span>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[180px_1fr_1fr] gap-x-3 text-[13px] font-bold text-slate-500">
        <span>입력값</span>
        <span className="text-right">낮췄을 때</span>
        <span>높였을 때</span>
      </div>
      {sens.rows.map((row) => {
        const lo = row.low.value - sens.base;
        const hi = row.high.value - sens.base;
        return (
          <div key={row.label} className="grid grid-cols-[180px_1fr_1fr] items-center gap-x-3">
            <span className="leading-tight">
              <span className="block text-[13.5px] font-bold text-slate-800">{row.label}</span>
              <span className="block text-[12px] text-slate-400">현재 {row.baseInput}</span>
            </span>
            {/* 왼쪽(낮춤) — 조건/금액 스택 + 막대(변화율 내장) */}
            <div className="flex items-center justify-end gap-2.5">
              <Side input={row.low.input} value={row.low.value} />
              <Bar delta={lo} width={(Math.abs(lo) / span) * 100} />
            </div>
            {/* 오른쪽(높임) */}
            <div className="flex items-center gap-2.5">
              <Bar delta={hi} width={(Math.abs(hi) / span) * 100} right />
              <Side input={row.high.input} value={row.high.value} right />
            </div>
          </div>
        );
      })}
    </div>
  );
}
