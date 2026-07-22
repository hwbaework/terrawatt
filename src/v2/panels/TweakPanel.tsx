import { useState } from 'react';
import { FACILITIES } from '../data/facilities';
import { getBuildingHandle } from '../map/buildingLayer';
import { MIcon } from '../lib/MIcon';

/* 배치 조절 패널 — 지도 위 3D 건물을 버튼으로 밀고/돌려서 자리를 맞춘다.
   맞춰지면 [좌표 복사]로 숫자를 복사해 클로드에게 주면 facilities.ts에 고정.
   (조절값은 새로고침하면 사라짐 — 파일에 적어야 진짜 저장) */

const WITH_MODEL = FACILITIES.filter((f) => f.model);

export function TweakPanel() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(WITH_MODEL[0]?.id ?? '');
  const [state, setState] = useState<{ lng: number; lat: number; rotationDeg: number; sizeM: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [stepM, setStepM] = useState(5);

  const act = (fn: (h: NonNullable<ReturnType<typeof getBuildingHandle>>) => void) => {
    const h = getBuildingHandle(`v2-bld-${sel}`);
    if (!h) return;
    fn(h);
    setState(h.state());
    setCopied(false);
  };
  const move = (eastM: number, northM: number) => act((h) => h.move(eastM, northM));
  const rotate = (d: number) => act((h) => h.rotate(d));
  const resize = (f: number) => act((h) => h.resize(f));

  const copy = () => {
    if (!state) return;
    const text =
      `${sel}: lng ${state.lng.toFixed(5)}, lat ${state.lat.toFixed(5)}, ` +
      `rotationDeg ${Math.round(state.rotationDeg)}, size ${Math.round(state.sizeM)}m`;
    navigator.clipboard?.writeText(text).then(() => setCopied(true));
  };

  const btn =
    'rounded-md bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 active:bg-slate-300';

  return (
    <div className="w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900">
          <MIcon name="open_with" size={16} className="text-slate-500" /> 배치 조절
        </span>
        <span className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}>
          <MIcon name="expand_more" size={18} />
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5">
          {/* 건물 선택 */}
          <select
            value={sel}
            onChange={(e) => {
              setSel(e.target.value);
              setState(null);
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-800 outline-none"
          >
            {WITH_MODEL.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {/* 이동 (지도 기준 동서남북) */}
          <div className="mt-2.5 grid grid-cols-3 gap-1 text-center">
            <div />
            <button type="button" className={btn} onClick={() => move(0, stepM)}>▲ 북</button>
            <div />
            <button type="button" className={btn} onClick={() => move(-stepM, 0)}>◀ 서</button>
            <div className="flex items-center justify-center text-[10px] text-slate-400">{stepM}m</div>
            <button type="button" className={btn} onClick={() => move(stepM, 0)}>동 ▶</button>
            <div />
            <button type="button" className={btn} onClick={() => move(0, -stepM)}>▼ 남</button>
            <div />
          </div>

          {/* 이동량 + 회전 */}
          <div className="mt-2 flex items-center gap-1">
            {[1, 5, 20].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStepM(m)}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                  stepM === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m}m
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              <button type="button" className={btn} onClick={() => rotate(-5)}><MIcon name="rotate_left" size={16} /></button>
              <button type="button" className={btn} onClick={() => rotate(5)}><MIcon name="rotate_right" size={16} /></button>
            </div>
          </div>

          {/* 크기 조절 — 10%씩 */}
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-500">크기</span>
            <div className="ml-auto flex gap-1">
              <button type="button" className={btn} onClick={() => resize(1 / 1.1)}><MIcon name="remove" size={14} /> 작게</button>
              <button type="button" className={btn} onClick={() => resize(1.1)}><MIcon name="add" size={14} /> 크게</button>
            </div>
          </div>

          {/* 현재 값 + 복사 */}
          {state && (
            <div className="mt-2.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-600">
              lng {state.lng.toFixed(5)} · lat {state.lat.toFixed(5)}
              <br />
              회전 {Math.round(state.rotationDeg)}° · 크기 {Math.round(state.sizeM)}m
            </div>
          )}
          <button
            type="button"
            onClick={copy}
            disabled={!state}
            className="mt-2 w-full rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
          >
            {copied ? '✓ 복사됨 — 클로드에게 붙여넣기' : '좌표 복사'}
          </button>
          <p className="mt-1.5 text-center text-[10px] leading-relaxed text-slate-400">
            새로고침하면 원래대로 돌아가요.
            <br />
            복사한 좌표를 클로드에게 주면 고정!
          </p>
        </div>
      )}
    </div>
  );
}
