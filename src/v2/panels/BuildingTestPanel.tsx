import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MIcon } from '../lib/MIcon';

/* 내 건물 위치 테스트 — energy-landing 히어로 카드 이식.
   [검색] 클릭 → 카카오 우편번호 서비스(행안부 스타일 주소검색 팝업, 키 불필요)
   → 주소 선택 → 좌표 변환(카카오 로컬 API 키 있으면 그걸로, 없으면 Mapbox) → 지도 이동 + 핀.
   입력창에 직접 타이핑 후 Enter로 빠른 검색도 가능. */

type GeoResult = { label: string; lng: number; lat: number };

/* ── 카카오(다음) 우편번호 서비스 — 스크립트 지연 로드 ── */
type DaumPostcodeData = { roadAddress: string; jibunAddress: string; address: string };
declare global {
  interface Window {
    daum?: {
      Postcode: new (opts: {
        oncomplete: (data: DaumPostcodeData) => void;
        width?: string;
        height?: string;
      }) => { embed: (el: HTMLElement) => void };
    };
  }
}
let postcodeLoader: Promise<void> | null = null;
function loadPostcode(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  if (!postcodeLoader) {
    postcodeLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('postcode script load fail'));
      document.head.appendChild(s);
    });
  }
  return postcodeLoader;
}

const KAKAO_KEY = (import.meta.env.VITE_KAKAO_REST_KEY as string | undefined) ?? '';

type KakaoDoc = {
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  road_address?: { address_name?: string };
  x: string; // 경도
  y: string; // 위도
};

/* 카카오: 주소 검색 먼저(번지 정확), 결과 없으면 장소명 검색 */
async function searchKakao(q: string): Promise<GeoResult[]> {
  const headers = { Authorization: `KakaoAK ${KAKAO_KEY}` };
  for (const path of ['address', 'keyword'] as const) {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/${path}.json?query=${encodeURIComponent(q)}&size=5`,
      { headers },
    );
    if (!r.ok) continue;
    const j: { documents?: KakaoDoc[] } = await r.json();
    const list: GeoResult[] = (j.documents ?? [])
      .map((d) => ({
        label: d.place_name
          ? `${d.place_name} (${d.road_address_name || d.address_name || ''})`
          : d.road_address?.address_name || d.address_name || '',
        lng: Number(d.x),
        lat: Number(d.y),
      }))
      .filter((v) => v.label && Number.isFinite(v.lng) && Number.isFinite(v.lat));
    if (list.length) return list;
  }
  return [];
}

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
  const [postcodeOpen, setPostcodeOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const postcodeBoxRef = useRef<HTMLDivElement | null>(null);

  /* 주소/장소 문자열 → 좌표 후보 목록 (카카오 키 있으면 카카오, 없으면 Mapbox) */
  const geocode = async (q: string): Promise<GeoResult[]> => {
    if (KAKAO_KEY) return searchKakao(q);
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?country=kr&language=ko&limit=5&access_token=${token}`;
    const r = await fetch(url);
    const j = await r.json();
    return (j.features ?? []).map((f: { place_name?: string; text?: string; center: [number, number] }) => ({
      label: f.place_name ?? f.text ?? '',
      lng: f.center[0],
      lat: f.center[1],
    }));
  };

  /* 입력창 Enter — 빠른 검색(후보 목록 표시) */
  const search = async () => {
    const q = query.trim();
    if (!q) {
      setPostcodeOpen(true); // 비어 있으면 주소검색 팝업으로
      return;
    }
    setBusy(true);
    setErr('');
    setResults([]);
    try {
      const list = await geocode(q);
      if (list.length === 0) setErr('결과가 없어요. 다른 주소로 시도해 보세요.');
      setResults(list);
    } catch {
      setErr('검색 중 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  };

  /* 우편번호 팝업에서 주소 선택 → 좌표 변환 → 바로 지도 이동 */
  const pickByAddress = async (addr: string) => {
    setBusy(true);
    setErr('');
    setResults([]);
    try {
      const list = await geocode(addr);
      if (list.length > 0) onPick(list[0].lng, list[0].lat, addr);
      else setErr('좌표를 찾지 못했어요. 입력창에 직접 검색해 보세요.');
    } catch {
      setErr('좌표 변환 중 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  };

  /* 팝업 열리면 우편번호 서비스 embed */
  useEffect(() => {
    if (!postcodeOpen) return;
    let cancelled = false;
    loadPostcode()
      .then(() => {
        if (cancelled || !postcodeBoxRef.current || !window.daum) return;
        postcodeBoxRef.current.innerHTML = '';
        new window.daum.Postcode({
          oncomplete: (data) => {
            const addr = data.roadAddress || data.jibunAddress || data.address;
            setPostcodeOpen(false);
            setQuery(addr);
            pickByAddress(addr);
          },
          width: '100%',
          height: '100%',
        }).embed(postcodeBoxRef.current);
      })
      .catch(() => {
        setErr('주소 검색 창을 불러오지 못했어요.');
        setPostcodeOpen(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcodeOpen]);

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
          <MIcon name="pin_drop" size={18} className="text-blue-600" /> 내 건물 절감 테스트
        </span>
        <span className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}>
          <MIcon name="expand_more" size={20} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* 주소 검색 — 주소를 입력/붙여넣고 Enter 또는 [검색] */}
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="주소 입력 또는 붙여넣기"
              className="w-full flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => setPostcodeOpen(true)}
              disabled={busy}
              className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
            >
              {busy ? '…' : '검색'}
            </button>
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

      {/* 주소 검색 팝업 — 화면 정중앙에 뜨도록 body로 포털
          (패널의 backdrop-blur가 fixed 요소를 가둬서 패널 안에 갇히는 문제 방지) */}
      {postcodeOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
            onClick={() => setPostcodeOpen(false)}
          >
            <div
              className="flex h-[520px] w-[440px] max-w-[92vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <MIcon name="search" size={17} className="text-slate-500" /> 주소 검색
                </span>
                <button
                  type="button"
                  onClick={() => setPostcodeOpen(false)}
                  className="rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700"
                >
                  <MIcon name="close" size={18} />
                </button>
              </div>
              <div ref={postcodeBoxRef} className="min-h-0 flex-1" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
