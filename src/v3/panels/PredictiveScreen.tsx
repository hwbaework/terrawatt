import { useState } from 'react';
import { INVERTER_HISTORY, PLANT_DEMO, invLabel } from '../data/demoReadings';
import { inverterLngLat } from '../data/plantLayout';
import { lookAtPlace } from '../map/vworldEngine';
import { Section } from './Drawer';

/* 예지보전 — 인버터별 **사실**을 보여준다(2026-08-26 사용자 확정).

   %(전일·전년 대비)는 쓰지 않는다: 비교군이 '어제의 나'인데 어제 맑고 오늘 흐리면 40%도 벌어져서
   고장이 아닌데 고장처럼 보인다. 그래서 LASEE 실제 필드(용량·전원/통신·현재 발전량·누적·고장여부)만 쓴다.
   각 인버터를 누르면 ① 상세가 펼쳐지고 ② 지도가 그 인버터 위치로 확대된다.

   값은 예시(demoReadings.ts) — LASEE 연동 시 그 파일만 교체. */

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

const VERDICT_STYLE: Record<string, string> = {
  /* 색은 둘뿐(2026-08-31 사용자 확정 — 노란색 금지, 헷갈린다):
       초록 = 정상 / 빨강 = 고장 확정(DX riskLevel 연동 후에만).
       그 사이(점검 필요·교체 검토·통신 없음)는 **회색** — "확실히 좋다고 말할 수 없음"은 무채색으로 */
  정상: 'bg-emerald-500/15 text-emerald-300',
  '점검 필요': 'bg-white/10 text-slate-300',
  '교체 검토': 'bg-white/10 text-slate-300',
};

/* 꺼짐 = 빨강 (발전소 상세와 같은 규칙, 2026-08-31 사용자 확정) */
function Dot({ ok }: { ok: boolean }) {
  return <span className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />;
}

export function PredictiveScreen() {
  const d = PLANT_DEMO;
  const [open, setOpen] = useState<string | null>(null);
  const attention = INVERTER_HISTORY.filter((h) => h.verdict !== '정상');

  /* 인버터를 누르면 ① 상세 펼침 ② 지도를 그 인버터 위치로 확대(2026-08-26 사용자 확정).
     닫을 때(같은 걸 다시 누름)는 카메라를 움직이지 않는다 — 펼침만 접는다 */
  const pick = (id: string) => {
    const nowOpen = open !== id;
    setOpen(nowOpen ? id : null);
    if (nowOpen) {
      const p = inverterLngLat(id);
      if (p) lookAtPlace({ lng: p.lng, lat: p.lat, altitude: 140, tiltDeg: -45 });
    }
  };

  return (
    <>
      {/* 통신·설비 상태 — 점으로만 */}
      <Section title="설비 상태">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-300">
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
            <div key={h.id} className="rounded-lg bg-white/[0.06] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold text-slate-100">{invLabel(h.id)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${VERDICT_STYLE[h.verdict]}`}>{h.verdict}</span>
              </div>
              {h.note && <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{h.note}</p>}
            </div>
          ))
        ) : (
          <p className="text-[13px] text-slate-400">모든 인버터가 정상 범위 안에 있습니다.</p>
        )}
      </Section>

      {/* 인버터별 — 사실만(용량·현재 발전량·상태). 누르면 상세 펼침 + 지도 확대 */}
      <Section title="인버터별 현황">
        <div className="space-y-1.5">
          {d.inverters.map((inv) => {
            const hist = INVERTER_HISTORY.find((h) => h.id === inv.id);
            const isOpen = open === inv.id;
            return (
              <div key={inv.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => pick(inv.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.04]"
                >
                  <span className="flex items-center text-[13.5px] font-bold text-slate-200">
                    {/* 점 = 이벤트(5일 지속 결손·AI 진단) 여부. 순간 출력엔 색을 안 칠한다(2026-08-31) —
                        구름·새·지붕 방향으로 1대만 순간 낮은 건 정상일 수 있다 */}
                    <Dot ok={!hist || hist.verdict === '정상'} />
                    {invLabel(inv.id)}
                    <span className="ml-1.5 text-[11.5px] font-normal text-slate-500">{inv.ratedKw}kW</span>
                  </span>
                  <span className="flex items-baseline gap-1">
                    <span className="text-[15px] font-extrabold text-emerald-300">{num(inv.acKw, 1)}</span>
                    <span className="text-[11px] font-bold text-slate-500">kW</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-white/10 px-3 py-2.5">
                    {/* 상태 — 통신 · 고장여부 (LASEE 실제 필드) */}
                    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                      <span className="flex items-center text-slate-300">
                        <Dot ok={inv.comm} />
                        통신 {inv.comm ? '정상' : '오류'}
                      </span>
                      <span className="flex items-center text-slate-300">
                        <Dot ok={!inv.fault} />
                        고장여부 {inv.fault || '정상'}
                      </span>
                    </div>
                    <dl className="space-y-1.5 text-[12.5px]">
                      {/* AC = 현재 발전량(계통으로 나가는 전력) / DC = 패널이 만든 전력.
                          둘을 나란히 두면 고장 위치를 가른다 — DC부터 낮으면 패널·스트링, AC만 낮으면 인버터(2026-08-26 사용자 확정) */}
                      <div className="flex justify-between">
                        <dt className="text-slate-500">현재 출력 (AC)</dt>
                        <dd className="font-bold text-slate-100">{num(inv.acKw, 1)} kW</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">DC 전력</dt>
                        <dd className="font-bold text-slate-200">{num(inv.dcKw, 1)} kW</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">일 발전량</dt>
                        <dd className="font-bold text-slate-200">{num(inv.todayKwh, 1)} kWh</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">누적 발전량</dt>
                        <dd className="font-bold text-slate-200">{num(inv.totalKwh)} kWh</dd>
                      </div>
                    </dl>
                    {hist?.note && <p className="mt-2 rounded-md bg-red-500/10 px-2.5 py-2 text-[12px] leading-relaxed text-red-200/80">{hist.note}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
