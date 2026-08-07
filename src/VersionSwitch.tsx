/* 버전 전환 셀렉트 — 버전이 셋(v0.1/v0.2/v0.3)이 되면서 링크 대신 목록에서 고르는 방식으로.
   고르면 주소가 바뀌고 새로고침되어 해당 버전이 뜬다 (main.tsx 가 ?v 값으로 분기).
   v0.1은 코드를 건드리지 않기로 했으므로, v0.1 화면에서는 main.tsx가 이 컴포넌트를 위에 얹는다. */

export type VersionId = '1' | '2' | '3';

const OPTIONS: { id: VersionId; label: string; note: string }[] = [
  { id: '3', label: 'v0.3', note: '기본' },
  { id: '2', label: 'v0.2', note: 'POC' },
  { id: '1', label: 'v0.1', note: '보존' },
];

/** 지금 보고 있는 버전 — ?v=1 → v0.1, ?v=2 → v0.2, 없으면 v0.3(기본) */
export function currentVersion(): VersionId {
  const v = new URLSearchParams(window.location.search).get('v');
  return v === '1' || v === '2' ? v : '3';
}

/** 그 버전의 주소 — v0.3은 파라미터 없음(기본) */
export function versionHref(id: VersionId): string {
  return id === '3' ? window.location.pathname : `${window.location.pathname}?v=${id}`;
}

export function VersionSwitch({ className = '' }: { className?: string }) {
  const cur = currentVersion();
  return (
    <select
      value={cur}
      onChange={(e) => {
        window.location.href = versionHref(e.target.value as VersionId);
      }}
      title="버전 전환"
      aria-label="버전 전환"
      className={`cursor-pointer rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 outline-none transition-colors hover:bg-white/20 ${className}`}
    >
      {OPTIONS.map((o) => (
        <option key={o.id} value={o.id} className="bg-slate-900 text-slate-200">
          {o.label} · {o.note}
        </option>
      ))}
    </select>
  );
}
