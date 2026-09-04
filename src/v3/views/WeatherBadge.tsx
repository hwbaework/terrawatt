import { useEffect, useState } from 'react';
import { MIcon } from '../../v2/lib/MIcon';
import { SKY_LABEL, regionWeatherAt, type RegionWeather } from '../data/regionWeather';

/* 지도 위 상단 가운데 — 지금 보고 있는 곳의 구·군 + 날씨·기온·풍속 (BG-02 첫 단추).

   카메라가 움직이면 화면 가운데가 가리키는 지면 좌표를 읽어(0.8초마다, 바뀌었을 때만) 지역을 다시 판별한다.
   경계를 넘어가면 지역명이 바뀌고, 기온·풍속은 이웃 구 값이 섞여 서서히 변한다(data/regionWeather).
   표기 = 날씨(맑음/비/눈)·기온·풍속 까지만(2026-08-19 확정). 습도·풍향은 화면에서 뺐지만 데이터(regionWeather)에는
   남긴다 — 예지보전(결로·부식·PID)용. 값은 기상청 연동 전 자리표시(SAMPLE_WEATHER) — 화면에 샘플 표기는 하지 않는다. */

interface ViewerPeek {
  camera?: { getPickRay(pos: unknown): unknown; pickEllipsoid?(pos: unknown): unknown };
  scene?: {
    canvas?: HTMLCanvasElement;
    globe?: { pick(ray: unknown, scene: unknown): unknown };
  };
}
interface CesiumPeek {
  Cartesian2: new (x: number, y: number) => unknown;
  Cartographic: { fromCartesian(c: unknown): { longitude: number; latitude: number } };
  Math: { toDegrees(r: number): number };
}

/** 화면 가운데가 가리키는 지면 위경도 — 못 읽으면 null (엔진 준비 전 등) */
function centerLngLat(): { lng: number; lat: number } | null {
  const C = window.Cesium as unknown as CesiumPeek | undefined;
  const v = window.ws3d?.viewer as unknown as ViewerPeek | undefined;
  const canvas = v?.scene?.canvas;
  if (!C || !v?.camera || !canvas || canvas.clientWidth === 0) return null;
  try {
    const pos = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const ray = v.camera.getPickRay(pos);
    const hit = (ray && v.scene?.globe?.pick(ray, v.scene)) || v.camera.pickEllipsoid?.(pos);
    if (!hit) return null;
    const g = C.Cartographic.fromCartesian(hit);
    return { lng: C.Math.toDegrees(g.longitude), lat: C.Math.toDegrees(g.latitude) };
  } catch {
    return null;
  }
}

/** 나침반(2026-08-26 사용자 요청) — 카메라를 돌리면 같이 돈다. 빨간 바늘 = 북.
    누르면 북쪽 정렬. 카메라 heading(라디안, 0=북, 시계방향)을 0.2초마다 읽어 1° 이상 변했을 때만 갱신.
    자리는 **오른쪽 아래**(AppV3에서 배치) — 날씨 배지 옆은 작아서 안 보인다(2026-08-26 사용자). 지도 앱 관례 자리 */
export function Compass() {
  const [headingDeg, setHeadingDeg] = useState(0);

  useEffect(() => {
    let last = 0;
    const t = window.setInterval(() => {
      const cam = window.ws3d?.viewer?.camera as { heading?: number } | undefined;
      if (typeof cam?.heading !== 'number') return;
      const deg = (cam.heading * 180) / Math.PI;
      if (Math.abs(deg - last) < 1) return;
      last = deg;
      setHeadingDeg(deg);
    }, 200);
    return () => window.clearInterval(t);
  }, []);

  const faceNorth = () => {
    const v = window.ws3d?.viewer as
      | { camera?: { position: unknown; pitch: number; setView(o: unknown): void } }
      | undefined;
    const cam = v?.camera;
    if (!cam) return;
    try {
      cam.setView({ destination: cam.position, orientation: { heading: 0, pitch: cam.pitch, roll: 0 } });
    } catch {
      /* 엔진 준비 전 — 무시 */
    }
  };

  /* 북·동·남·서 글자(2026-08-26 사용자: 바늘만으론 어디가 북인지 모른다) —
     글자 위치는 카메라를 따라 돌지만 글자 자체는 늘 바로 서 있게 삼각함수로 배치 */
  const letters = [
    { label: '북', dir: 0, color: '#f87171' },
    { label: '동', dir: 90, color: '#94a3b8' },
    { label: '남', dir: 180, color: '#94a3b8' },
    { label: '서', dir: 270, color: '#94a3b8' },
  ].map(({ label, dir, color }) => {
    const rad = ((dir - headingDeg) * Math.PI) / 180;
    return { label, color, x: 20 + 15 * Math.sin(rad), y: 20 - 15 * Math.cos(rad) };
  });

  return (
    /* 날씨 배지 **옆의 독립 원형**(2026-08-26 사용자: 배지 안은 너무 작다) — 크게, 항상 잘 보이게 */
    <button
      type="button"
      onClick={faceNorth}
      title="북쪽으로 정렬"
      className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/65 shadow-xl backdrop-blur transition-colors hover:bg-black/80"
    >
      <svg viewBox="0 0 40 40" className="h-14 w-14">
        <circle cx="20" cy="20" r="19" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" />
        {/* 바늘 — 빨강 = 북 / 회색 = 남 */}
        <g transform={`rotate(${-headingDeg} 20 20)`}>
          <polygon points="20,11.5 22.4,20 17.6,20 " fill="#f87171" />
          <polygon points="20,28.5 22.4,20 17.6,20" fill="#94a3b8" opacity="0.7" />
          <circle cx="20" cy="20" r="1.6" fill="#e2e8f0" />
        </g>
        {letters.map((l) => (
          <text key={l.label} x={l.x} y={l.y + 3.2} textAnchor="middle" fill={l.color} fontSize={9} fontWeight={800}>
            {l.label}
          </text>
        ))}
      </svg>
    </button>
  );
}

export function WeatherBadge() {
  const [rw, setRw] = useState<RegionWeather | null>(null);

  useEffect(() => {
    let last = '';
    const tick = () => {
      const p = centerLngLat();
      if (!p) return;
      // 30m쯤 움직였을 때만 다시 계산 — 매 틱 setState 로 떨지 않게
      const key = `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
      if (key === last) return;
      last = key;
      setRw(regionWeatherAt(p.lng, p.lat));
    };
    tick();
    const t = window.setInterval(tick, 800);
    return () => window.clearInterval(t);
  }, []);

  // 엔진 준비 전이거나 울산에서 아주 멀리 벗어나면(>40km) 조용히 숨긴다
  if (!rw || rw.distanceKm > 40) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-10 -translate-x-1/2">
      <div className="flex items-center rounded-xl bg-black/65 px-4 py-2 shadow-xl backdrop-blur">
        <span className="flex items-center gap-1 text-[13.5px] font-extrabold text-white">
          <MIcon name="location_on" size={16} className="text-sky-300" />
          울산 {rw.region.name}
        </span>
        <span className="mx-3 h-4 w-px bg-white/20" />
        <span className="text-[13px] font-bold text-slate-100">{SKY_LABEL[rw.condition]}</span>
        <span className="ml-2 text-[15px] font-extrabold text-white">
          {rw.tempC.toFixed(1)}
          <span className="ml-0.5 text-[11px] font-bold text-slate-400">℃</span>
        </span>
        <span className="mx-3 h-4 w-px bg-white/20" />
        <span className="text-[12px] text-slate-300">
          풍속 <b className="text-[13px] text-white">{rw.windMs.toFixed(1)}</b>
          <span className="text-[11px] text-slate-400"> ㎧</span>
        </span>
      </div>
    </div>
  );
}
