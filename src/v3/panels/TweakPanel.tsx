import { useState } from 'react';
import { MODELED_FACILITIES } from '../data/facilities';
import { getHandle } from '../map/handles';
import { MIcon } from '../../v2/lib/MIcon';

/* 배치 조절 — 3D 시설을 밀고/돌려서 자리를 맞춘다.
   맞춰지면 [복사]로 숫자를 가져가 facilities.ts 에 고정한다.
   (조절값은 새로고침하면 사라진다 — 파일에 적어야 진짜 저장)

   화면을 방해하지 않도록:
     · 브랜드 카드 안, 건물 버튼 옆의 **아이콘 하나**로 접어둔다
     · 펴도 지도와 같은 어두운 톤 · 글자 대신 아이콘
     · 방향은 chevron 하나를 돌려 쓴다 (아이콘 폰트를 다시 만들지 않기 위해) */

/** 방향 버튼 — chevron_right 를 돌려서 ▲▼◀▶ 로 쓴다 */
function DirBtn({ deg, onClick, title }: { deg: number; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-slate-200 transition-colors hover:bg-white/20 active:bg-white/30"
    >
      <span style={{ display: 'flex', transform: `rotate(${deg}deg)` }}>
        <MIcon name="chevron_right" size={16} />
      </span>
    </button>
  );
}

function IconBtn({ icon, onClick, title }: { icon: string; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-slate-200 transition-colors hover:bg-white/20 active:bg-white/30"
    >
      <MIcon name={icon} size={15} />
    </button>
  );
}

export function TweakPanel() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(MODELED_FACILITIES[0]?.id ?? '');
  const [state, setState] = useState<{ lng: number; lat: number; rotationDeg: number; sizeM: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [stepM, setStepM] = useState(5);

  const act = (fn: (h: NonNullable<ReturnType<typeof getHandle>>) => void) => {
    const h = getHandle(sel);
    if (!h) return;
    fn(h);
    setState(h.state());
    setCopied(false);
  };

  const copy = () => {
    if (!state) return;
    const text =
      `${sel}: lng ${state.lng.toFixed(5)}, lat ${state.lat.toFixed(5)}, ` +
      `rotationDeg ${Math.round(state.rotationDeg)}, size ${Math.round(state.sizeM)}m`;
    navigator.clipboard?.writeText(text).then(() => setCopied(true));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="배치 조절 — 건물 위치·방향 맞추기"
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors ${
          open ? 'bg-blue-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-slate-200'
        }`}
      >
        <MIcon name="open_with" size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[11.5rem] rounded-xl border border-white/10 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur">
          <select
            value={sel}
            onChange={(e) => {
              setSel(e.target.value);
              setState(null);
            }}
            className="w-full rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[11px] text-slate-200 outline-none"
          >
            {MODELED_FACILITIES.map((f) => (
              <option key={f.id} value={f.id} className="bg-slate-900">
                {f.name}
              </option>
            ))}
          </select>

          {/* 이동 — 가운데 숫자는 한 번에 움직일 거리(눌러서 바꿈) */}
          <div className="mt-2 grid grid-cols-3 justify-items-center gap-1">
            <div />
            <DirBtn deg={-90} title="북쪽으로" onClick={() => act((h) => h.move(0, stepM))} />
            <div />
            <DirBtn deg={180} title="서쪽으로" onClick={() => act((h) => h.move(-stepM, 0))} />
            <button
              type="button"
              onClick={() => setStepM((m) => (m === 1 ? 5 : m === 5 ? 20 : 1))}
              title="한 번에 움직일 거리 바꾸기"
              className="h-7 w-7 rounded-md bg-blue-600/80 text-[10px] font-bold text-white transition-colors hover:bg-blue-600"
            >
              {stepM}m
            </button>
            <DirBtn deg={0} title="동쪽으로" onClick={() => act((h) => h.move(stepM, 0))} />
            <div />
            <DirBtn deg={90} title="남쪽으로" onClick={() => act((h) => h.move(0, -stepM))} />
            <div />
          </div>

          {/* 회전 · 크기 */}
          <div className="mt-2 flex items-center justify-between gap-1">
            <div className="flex gap-1">
              <IconBtn icon="rotate_left" title="반시계로 5°" onClick={() => act((h) => h.rotate(-5))} />
              <IconBtn icon="rotate_right" title="시계로 5°" onClick={() => act((h) => h.rotate(5))} />
            </div>
            <div className="flex gap-1">
              <IconBtn icon="remove" title="10% 작게" onClick={() => act((h) => h.resize(1 / 1.1))} />
              <IconBtn icon="add" title="10% 크게" onClick={() => act((h) => h.resize(1.1))} />
            </div>
          </div>

          {/* 현재 값 + 복사 */}
          <div className="mt-2 rounded-md bg-white/[0.04] px-2 py-1.5 text-[9.5px] leading-relaxed text-slate-400">
            {state ? (
              <>
                {state.lng.toFixed(5)}, {state.lat.toFixed(5)}
                <br />
                {Math.round(state.rotationDeg)}° · {Math.round(state.sizeM)}m
              </>
            ) : (
              '버튼을 눌러 조절하세요'
            )}
          </div>
          <button
            type="button"
            onClick={copy}
            disabled={!state}
            className="mt-1.5 w-full rounded-md bg-white/10 py-1 text-[10px] font-bold text-slate-200 transition-colors hover:bg-white/20 disabled:opacity-40"
          >
            {copied ? '✓ 복사됨' : '좌표 복사'}
          </button>
        </div>
      )}
    </div>
  );
}
