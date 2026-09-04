import { useState } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { PLANT_DEMO } from '../data/demoReadings';
import { solarHourShares } from '../data/kepcoTariff';

/* DT 뷰 — 콜아웃의 스파크라인을 누르면 **시간별 출력 그래프**가 왼쪽 아래에 뜬다.

   구조 팝업(2026-08-26)·모니터링 팝업(2026-08-31)은 삭제 —
   구조는 내부 도면을 알 수 없고, 모니터링(모듈 격자)은 개별 모듈 데이터를 받을 수 없어서(DT-02).
   점검 판정(인버터 단위)은 오른쪽 서랍의 예지보전 화면이 담당한다. */

type ViewId = 'graph';

const num = (n: number, d = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function DtViewPopup({ initial, onClose }: { initial: ViewId; onClose: () => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const d = PLANT_DEMO;

  /* 드래그 이동(2026-08-26 사용자 요청) — 라이브러리 없이 포인터 이벤트로.
     머리(제목 줄)를 잡고 끌면 패널이 따라온다. 버튼 위에서 시작한 누름은 드래그로 안 잡는다 */
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // 닫기 버튼 등은 제외
    const sx = e.clientX - drag.x;
    const sy = e.clientY - drag.y;
    const move = (ev: PointerEvent) => setDrag({ x: ev.clientX - sx, y: ev.clientY - sy });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const dragStyle = { transform: `translate(${drag.x}px, ${drag.y}px)` };

  if (initial === 'graph') {
    /* ── 시간별 출력 — 24시간 전체(2026-08-26 사용자 확정):
          점선 = 24시간 예상 출력(태양 고도 기반 시간 분포 × 일 예상 발전량) / 초록 = 현재까지 실측.
          실측 = 오늘 누적 곡선의 시간당 증가분(발전소 상세와 같은 데이터). 누적은 헤더의 LIVE 옆에 */
    const curve = d.todayCurve;
    const expectedDaily = d.capacityKw * 3.82; // 일 예상 발전량 = 용량 × 일평균 발전시간
    const shares = solarHourShares(new Date().getMonth() + 1); // 이번 달의 시간별 발전 비중(합 1)
    const expected = shares.map((s) => s * expectedDaily);
    /* 실측 — 06~15시 누적에서 시간당 증가분. 슬롯 h = h시~h+1시 */
    const actual: (number | null)[] = Array.from({ length: 24 }, () => null);
    curve.slice(1).forEach(([, v], i) => {
      const h = parseInt(curve[i][0].slice(0, 2), 10); // 06~14
      actual[h] = v - curve[i][1];
    });
    const max = Math.max(...expected, ...actual.map((v) => v ?? 0), 1);
    /* 막대(실측) + 선(예상) 조합 — 참고 이미지(kWh 막대 + 발전시간 선) 방식(2026-08-26 사용자 확정).
       일출·일몰(동/서) 표시는 계절마다 달라져서 뺌(사용자 확정). 패널은 꾸겨 넣지 말고 크게 */
    const W = 460;
    const H = 200;
    const padL = 40;
    const padB = 22;
    const padT = 30; // 위 여백 — kWh 단위가 맨 위 눈금 숫자와 겹치지 않게
    const slotW = (W - padL - 12) / 24;
    const x = (i: number) => padL + slotW * (i + 0.5); // 슬롯 가운데
    const y = (v: number) => H - padB - ((H - padB - padT) * v) / max;
    const barW = slotW * 0.62;
    const expPts = expected.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return (
      /* 왼쪽 아래 — 오른쪽은 서랍과 겹쳐서(2026-08-26 사용자 확인) 왼쪽으로 */
      <div style={dragStyle} className="fixed bottom-3 left-4 z-30 w-[31rem] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur">
        <div onPointerDown={dragStart} className="flex cursor-move select-none items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="flex items-center gap-2 text-[14px] font-extrabold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            시간별 출력 · LIVE
          </span>
          {/* 현재 발전량 — 쓰려면 잘 보이게(2026-08-26 사용자 지적: 안 보이면 쓰지 마) */}
          <span className="flex items-center gap-3">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[11.5px] font-bold text-slate-500">현재 발전량</span>
              <span className="text-[16px] font-extrabold text-emerald-300">{num(d.todayKwh, 1)}</span>
              <span className="text-[11.5px] font-bold text-slate-500">kWh</span>
            </span>
            <button type="button" onClick={onClose} title="닫기" className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200">
              <MIcon name="close" size={16} />
            </button>
          </span>
        </div>
        <div className="relative p-4">
          {/* 범례 — 색 칩으로만 */}
          <div className="mb-1.5 flex items-center gap-4 text-[11.5px] font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-[3px] bg-emerald-400/80" />실측
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 rounded bg-sky-300/80" />예상
            </span>
          </div>
          {hover != null && (
            <div
              className="pointer-events-none absolute top-4 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 text-center shadow-xl"
              style={{ left: `${12 + (x(hover) / W) * 100}%` }}
            >
              <div className="text-[12px] font-bold text-slate-300">{hover}시</div>
              <div className="text-[12.5px] font-bold text-sky-300">예상 {num(expected[hover], 1)} kWh</div>
              {actual[hover] != null && (
                <div className="text-[13px] font-extrabold text-emerald-300">실측 {num(actual[hover]!, 1)} kWh</div>
              )}
            </div>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* 세로축 단위 — 눈금 숫자 위에 따로 */}
            <text x={padL - 5} y={13} textAnchor="end" fill="#94a3b8" fontSize={10} fontWeight={700}>
              kWh
            </text>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - 12} y1={y(max * t)} y2={y(max * t)} stroke="rgba(255,255,255,.08)" />
                <text x={padL - 5} y={y(max * t) + 3.5} textAnchor="end" fill="#64748b" fontSize={10.5}>
                  {num(max * t)}
                </text>
              </g>
            ))}
            {/* 실측 — 초록 막대 (아직 안 온 시간은 없음) */}
            {actual.map((v, i) =>
              v == null ? null : (
                <rect
                  key={i}
                  x={x(i) - barW / 2}
                  y={y(v)}
                  width={barW}
                  height={Math.max(1, H - padB - y(v))}
                  rx={2}
                  fill={hover === i ? '#34d399' : 'rgba(52,211,153,.75)'}
                />
              ),
            )}
            {/* 예상 — 24시간 선 */}
            <polyline points={expPts} fill="none" stroke="#7dd3fc" strokeOpacity={0.9} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
            {/* 마우스 판 — 시간마다 세로 띠 */}
            {Array.from({ length: 24 }, (_, i) => (
              <rect
                key={`h${i}`}
                x={padL + slotW * i}
                y={0}
                width={slotW}
                height={H - padB}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
            {/* 축 라벨 — 4시간 간격 */}
            {[0, 4, 8, 12, 16, 20].map((h) => (
              <text key={h} x={x(h)} y={H - 6} textAnchor="middle" fill="#64748b" fontSize={10.5}>
                {h}시
              </text>
            ))}
          </svg>
        </div>
      </div>
    );
  }

  // 모니터링 팝업 삭제(2026-08-31 사용자 확정) — 개별 모듈 데이터는 받을 수 없어(DT-02) 근거 없는 그림이었다.
  //   점검 판정(인버터 단위)은 오른쪽 서랍의 예지보전 화면이 담당한다.


  return null; // 구조 팝업은 삭제(2026-08-26) — 추후 에셋 자체가 구조 모습으로 전환될 예정
}
