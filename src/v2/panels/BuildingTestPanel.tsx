import { useState } from 'react';

/* 내 건물 위치 테스트 — energy-landing 히어로 카드 이식.
   접기/펴기 + 주소 검색(Mapbox Geocoding, 기존 토큰 재사용) + 내 위치.
   결과 클릭 → onPick(lng, lat, 라벨)로 부모가 지도 이동 + 핀 표시. */

type GeoResult = { label: string; lng: number; lat: number };

export function BuildingTestPanel({
  token,
  onPick,
}: {
  token: string;
  onPick: (lng: number, lat: number, label: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setErr('');
    setResults([]);
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?country=kr&language=ko&limit=5&access_token=${token}`;
      const r = await fetch(url);
      const j = await r.json();
      const list: GeoResult[] = (j.features ?? []).map((f: { place_name?: string; text?: string; center: [number, number] }) => ({
        label: f.place_name ?? f.text ?? '',
        lng: f.center[0],
        lat: f.center[1],
      }));
      if (list.length === 0) setErr('결과가 없어요. 다른 주소로 시도해 보세요.');
      setResults(list);
    } catch {
      setErr('검색 중 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setErr('이 브라우저는 위치를 지원하지 않아요.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onPick(pos.coords.longitude, pos.coords.latitude, '내 위치');
      },
      () => {
        setBusy(false);
        setErr('위치 권한을 확인해 주세요.');
      },
    );
  };

  return (
    <div className="w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur">
      {/* 헤더 — 클릭 시 접기/펴기 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          📍 내 건물 절감 테스트
        </span>
        <span className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}>▾</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* 주소 검색 */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2">
            <span className="text-slate-400">🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="주소 검색 (예: 판교역로 166)"
              className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>

          {err && <p className="mt-2 text-[11px] text-red-500">{err}</p>}

          {/* 검색 결과 */}
          {results.length > 0 && (
            <div className="mt-2 flex flex-col overflow-hidden rounded-lg border border-slate-200">
              {results.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(r.lng, r.lat, r.label)}
                  className="border-b border-slate-100 px-3 py-2 text-left text-[12px] text-slate-700 transition-colors last:border-0 hover:bg-slate-50"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            📍 내 건물로 전기요금 절감 테스트
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            위치를 잡으면 내 건물에 태양광을 설치했을 때 <b className="text-slate-700">예상 발전량·전기요금
            절감액·CO₂ 감축량</b>을 즉시 계산해요.
          </p>

          <button
            type="button"
            onClick={useMyLocation}
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? '찾는 중…' : '내 위치로 테스트하기'}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            지도를 클릭하거나 주소로 잡을 수도 있어요
          </p>
        </div>
      )}
    </div>
  );
}
