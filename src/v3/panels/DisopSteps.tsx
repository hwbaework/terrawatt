import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DISOP, LEVEL_STYLE, type DisasterId } from '../data/disop';
import { Section } from './Drawer';

/* ── 재난 대응 매뉴얼(DiSOP) — 시뮬레이션 화면의 본체 ──
   흐름(2026-09-09 사용자 확정): **레벨을 고르고 → 재생을 누른다.**
     · [다음 단계] 버튼은 없다 — 재생하면 시뮬레이션이 돌아가고 조치 단계가 저절로 진행된다
     · 상태를 두 군데(별도 상태 박스 + 단계)에서 보여주지 않는다 — 진행 상황은 조치 항목 하나로만 말한다
     · 재생·정지 버튼은 화면마다 하는 일이 달라(화재/지진/침수) controls 로 받아 레벨 바로 아래에 둔다

   내용은 전부 매뉴얼 표의 값이다(data/disop.ts) — 조치 항목·발령 기준을 지어내지 않는다. */

/** 한 단계가 머무는 시간(ms) — 재생 중 이 간격으로 다음 조치로 넘어간다 */
const STEP_MS = 2200;

export function DisopSteps({
  disaster,
  running,
  ended,
  controls,
}: {
  disaster: DisasterId;
  /** 시뮬레이션 재생 중인가 — 이게 true 인 동안 단계가 자동으로 진행된다 */
  running: boolean;
  /** 정지(상황 종료) 후인가 */
  ended?: boolean;
  /** 재생·정지 버튼 — 레벨 아래에 놓는다 */
  controls?: ReactNode;
}) {
  const d = DISOP.find((x) => x.id === disaster)!;
  const [level, setLevel] = useState(d.levels[0].level);
  const cur = d.levels.find((l) => l.level === level)!;
  const [step, setStep] = useState(0);
  /** 영상 창을 사람이 닫았나 — 재생할 때마다 초기화 */
  const [videoClosed, setVideoClosed] = useState(false);

  /* 재생하는 동안 단계가 저절로 내려간다 — 마지막 조치에서 멈춘다 */
  useEffect(() => {
    if (!running) return;
    setStep(0);
    setVideoClosed(false);
    const id = window.setInterval(
      () => setStep((s) => Math.min(s + 1, cur.steps.length - 1)),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [running, cur.steps.length, level]);

  const total = cur.steps.length;
  const st = LEVEL_STYLE[cur.level];
  const progress = ended ? 100 : running ? ((step + 1) / total) * 100 : 0;
  const phase = ended ? '상황 종료' : running ? `진행 중 ${step + 1}/${total}` : '대기';
  /* 영상은 대피 안내 단계에 도착하면 뜨고, 상황이 끝나거나 사람이 닫을 때까지 남는다 */
  const video = cur.video;
  const showVideo = !!video && running && step >= video.step && !videoClosed;

  return (
    <>
      <Section title="대응 단계 (DiSOP)">
        {/* ① 레벨 고르기 — 표의 색 그대로(관심 노랑 · 주의 주황 · 경계 빨강) */}
        <div className="flex gap-1.5">
          {d.levels.map((l) => {
            const s = LEVEL_STYLE[l.level];
            return (
              <button
                key={l.level}
                type="button"
                onClick={() => setLevel(l.level)}
                disabled={running}
                className={`flex-1 rounded-lg py-2 text-[12.5px] font-bold transition-colors ${
                  level === l.level ? s.on : `${s.off} ${running ? 'opacity-50' : 'hover:bg-white/10'}`
                }`}
              >
                {l.name} <span className="text-[11px] opacity-80">Lv{l.level}</span>
              </button>
            );
          })}
        </div>

        {/* 발령 기준 — 이 레벨이 언제 발령되는가 */}
        <div className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2.5">
          <span className={`text-[12px] font-extrabold ${st.text}`}>발령 기준</span>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">{cur.trigger}</p>
        </div>

        {/* ② 재생 · 정지 */}
        {controls && <div className="mt-2.5">{controls}</div>}
      </Section>

      {/* ③ 조치 항목 — 세로 타임라인. 재생 진행에 맞춰 하나씩 내려간다 */}
      <Section title="조치 항목">
        {/* 진행 상태 한 줄 + 진행 막대 — 상태 표시는 여기 하나뿐이다 */}
        <div className="mb-3">
          <div className="flex items-baseline justify-between">
            <span
              className={`text-[12.5px] font-extrabold ${
                ended ? 'text-emerald-300' : running ? 'text-blue-300' : 'text-slate-500'
              }`}
            >
              {phase}
            </span>
            <span className="text-[11.5px] font-bold text-slate-500">
              {cur.name} Lv{cur.level}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${ended ? 'bg-emerald-400' : 'bg-blue-400'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ol className="relative">
          {cur.steps.map((s, i) => {
            const done = ended || (running && i < step);
            const now = running && i === step;
            const last = i === total - 1;
            return (
              <li key={s} className={`relative flex gap-3 ${last ? '' : 'pb-3.5'}`}>
                {/* 단계를 잇는 세로선 — 지나온 구간은 초록 */}
                {!last && (
                  <span
                    className={`absolute left-[10px] top-[22px] w-px ${done ? 'bg-emerald-400/40' : 'bg-white/10'}`}
                    style={{ height: 'calc(100% - 22px)' }}
                  />
                )}
                {/* 노드 */}
                <span
                  className={`relative z-10 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                    done
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : now
                        ? 'bg-blue-500 text-white ring-4 ring-blue-500/20'
                        : 'bg-white/[0.07] text-slate-600'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                {/* 조치 이름 */}
                <span className="flex min-w-0 flex-1 items-center gap-2 pt-0.5">
                  <span
                    className={`text-[13px] leading-snug ${
                      now ? 'font-extrabold text-white' : done ? 'font-bold text-slate-400' : 'font-bold text-slate-600'
                    }`}
                  >
                    {s}
                  </span>
                  {now && (
                    <span className="shrink-0 animate-pulse rounded bg-blue-500/20 px-1.5 py-px text-[10.5px] font-bold text-blue-300">
                      진행 중
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </Section>

      {showVideo && video && createPortal(<VideoBox title={video.title} onClose={() => setVideoClosed(true)} />, document.body)}
    </>
  );
}

/* ── 대피요령 영상 자리(예시) — 실제 영상 파일이 오면 네모 안을 <video> 로 바꾼다 ──
   자리 = 지도 **왼쪽 아래**(2026-09-14): 가운데는 알람 팝업, 왼쪽 위는 발전소 카드, 오른쪽은 패널·아이콘 바가
   쓰고 있어 비어 있는 곳이 여기다. 지도(시뮬레이션 연출)를 가리지 않도록 16:9 작은 창(PIP)으로 띄운다. */
function VideoBox({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 z-40 w-[26rem] overflow-hidden rounded-xl border border-white/15 bg-slate-950/95 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
        <span className="truncate text-[12.5px] font-extrabold text-slate-100">{title}</span>
        <button
          type="button"
          onClick={onClose}
          title="닫기"
          className="ml-auto rounded-md px-1.5 text-[15px] leading-none text-slate-500 hover:bg-white/10 hover:text-slate-200"
        >
          ×
        </button>
      </div>
      {/* 16:9 영상 자리 */}
      <div className="relative aspect-video bg-black">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 pl-1 text-[20px] text-white/80">▶</span>
          <span className="text-[12px] font-bold text-slate-500">영상 자리 (예시)</span>
        </div>
        {/* 재생 중인 느낌 — 아래 진행 막대 */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <div className="h-full w-0 animate-[videoProgress_12s_linear_forwards] bg-red-500" />
        </div>
      </div>
    </div>
  );
}
