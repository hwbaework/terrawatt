import { useWorldState } from '../world/WorldStateContext';
import { BuildingViewer } from './BuildingViewer';

/* 3단계 진입 화면. 가운데 = 유니티 3D 자리(#unity-mount), 오른쪽 = 발전소 정보 패널.
   유니티는 나중에 끼우고, 지금은 정보/경보 UI를 웹으로 구성. 단일 WorldState 시각에 연동. */

/* 시각(0~24) → 일사량 0~1 (밤 0, 정오 최대) */
function irradiance(hour: number): number {
  if (hour <= 6 || hour >= 18) return 0;
  return Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
}

export function Stage3Overlay({ name, mw, onExit }: { name: string; mw: number; onExit: () => void }) {
  const { hour } = useWorldState();
  const irr = irradiance(hour);
  const outputMw = Math.round(mw * irr * 10) / 10; // 현재 발전 (MW)
  const ratePct = Math.round(irr * 100); // 발전률
  const isNight = irr <= 0.02;
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
  const status = isNight
    ? { icon: '🌙', label: '야간 대기', tone: 'text-slate-400' }
    : ratePct >= 70
    ? { icon: '☀', label: '최적 발전 중', tone: 'text-amber-300' }
    : ratePct >= 30
    ? { icon: '🌤', label: '정상 발전 중', tone: 'text-yellow-300' }
    : { icon: '🌅', label: '저출력', tone: 'text-orange-300' };

  return (
    <div className="sf-stage3 absolute inset-0 z-[60] bg-slate-950 text-white">
      {/* 가운데 = 실제 3D 건물 뷰어 (마우스로 회전, 유니티 준비 전 미리보기). 나중에 유니티가 이 자리 대체 */}
      <div id="unity-mount" className="absolute inset-0">
        <BuildingViewer url="/models/ibuilding49-opt.glb" />
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">
        🖱 드래그로 회전 · 유니티 3D로 대체 예정
      </div>

      {/* 상단 바 */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">3단계 · 건물 내부</span>
          {name}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/20"
        >
          ← 2단계로 나가기
        </button>
      </div>

      {/* 오른쪽: 발전소 실시간 정보 패널 */}
      <div className="absolute right-5 top-16 w-72 rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur">
        {/* 현재 발전 상태 */}
        <div className={`flex items-center gap-2 text-sm font-bold ${status.tone}`}>
          <span className="text-lg">{status.icon}</span>
          {status.label}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-extrabold text-white">{outputMw}</span>
          <span className="text-xs text-slate-400">MW 발전 중</span>
          <span className="ml-auto font-mono text-xs text-slate-400">{ratePct}% / {mw}MW</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500" style={{ width: `${Math.min(100, ratePct)}%` }} />
        </div>

        {/* 세부 지표 (mock) */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[11px]">
          <div className="rounded-lg bg-white/5 p-2">
            <div className="font-mono text-sm font-bold text-white">{mw}</div>
            <div className="text-[9px] text-slate-500">정격 용량 MW</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="font-mono text-sm font-bold text-white">{Math.round(mw * 4.2)}</div>
            <div className="text-[9px] text-slate-500">오늘 누적 MWh</div>
          </div>
        </div>

        {/* 설비 상태 (mock) */}
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">설비 상태</div>
          <div className="flex flex-col gap-1 text-[12px]">
            {[
              { k: '인버터', ok: true },
              { k: 'ESS 배터리', ok: true },
              { k: '패널 어레이', ok: true },
              { k: '화재 감지', ok: true },
            ].map((s) => (
              <div key={s.k} className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5">
                <span className="text-slate-300">{s.k}</span>
                <span className={s.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {s.ok ? '● 정상' : '▲ 경고'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 text-center text-[9px] text-slate-500">
          🕐 {pad(hour)}:{pad((hour % 1) * 60)} 기준 · mock 데이터
        </div>
      </div>

      <style>{`
        .sf-stage3{animation:sf-stage3-in .5s ease-out;}
        @keyframes sf-stage3-in{from{opacity:0}to{opacity:1}}
      `}</style>
    </div>
  );
}
