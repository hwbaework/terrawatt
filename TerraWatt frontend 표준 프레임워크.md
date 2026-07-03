# Frontend Architecture Standard

> Vite + React SPA 기반 프론트엔드 표준 아키텍처 — TerraWatt
> Revision 1.0 — 2026-07-03

---

## 목차

1. [설계 원칙](#1-설계-원칙)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [라우터](#3-라우터)
4. [렌더링 전략](#4-렌더링-전략)
5. [에러 처리](#5-에러-처리)
6. [Types 레이어](#6-types-레이어)
7. [데이터 레이어](#7-데이터-레이어)
8. [Hooks 레이어](#8-hooks-레이어)
9. [Components 레이어](#9-components-레이어)
10. [Stores 레이어](#10-stores-레이어)
11. [Utils 레이어](#11-utils-레이어)
12. [스타일링](#12-스타일링)
13. [네이밍 규칙](#13-네이밍-규칙)
14. [Import 규칙](#14-import-규칙)
15. [기술 스택](#15-기술-스택)
16. [DX 도구](#16-dx-도구)
17. [테스트](#17-테스트)
18. [보안](#18-보안)
19. [성능](#19-성능)
20. [환경변수](#20-환경변수)
21. [체크리스트](#21-체크리스트)

---

## 1. 설계 원칙

### 1.1 핵심 원칙

| 원칙                 | 설명                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **Client-Only SPA**  | 서버 렌더링 없음. 지도는 브라우저에서만 살 수 있으므로 전체가 클라이언트 번들            |
| **지도 = 외부 시스템** | Mapbox Map 인스턴스는 React 트리 밖의 imperative 객체 — `ref`로 보관하고 effect로 동기화 |
| **단일 진실 공급원** | 타입은 `types/`, 상수는 `constants/`, 지도 레이어 id는 한 곳에서만 정의                  |
| **정적 데이터 우선** | 백엔드 없이 GeoJSON 정적 파일(`public/geo/`)을 fetch — 캐시는 ref로 1회만                |
| **점진적 향상**      | 지도 로드 전 `loading` → `ready` 후 UI 오버레이 표시 → 부가 데이터는 지연 로드           |

### 1.2 계층 의존성

```
App (컴포넌트) → Hooks → 데이터 로더(fetch + ref 캐시)
        ↕
   Map 인스턴스 (mapRef) ← effect로만 조작
        ↕
   Types, Utils(geo/sun), Constants
```

- 상위 계층은 하위 계층만 import한다.
- **React state → Map 방향은 effect로만** 흐른다. Map 이벤트 → React state는 핸들러로만 흐른다.
- Map 인스턴스를 state에 넣지 않는다 — `useRef`가 유일한 보관소.

---

## 2. 디렉토리 구조

```
terrawatt/
├── index.html                    # SPA 진입점 (title, meta, favicon)
├── vite.config.ts
├── tsconfig.json
├── wrangler.jsonc                # Cloudflare Workers 정적 에셋 배포 설정
├── .env.example                  # 환경변수 목록 (값 없음, git 추적)
│
├── public/
│   └── geo/                      # 정적 GeoJSON 데이터
│       ├── skorea-provinces.json # 시/도 경계
│       ├── ulsan-districts.json  # 구/군 경계
│       ├── ulsan-dong.json       # 읍/면/동 경계
│       ├── ulsan-power.json      # OSM 전력 인프라 (송전선/송전탑/변전소)
│       └── plant-feed.json       # 발전소 인입 선로
│
└── src/
    ├── main.tsx                  # ReactDOM 루트 + StrictMode
    ├── index.css                 # Tailwind import + 글로벌 스타일
    ├── App.tsx                   # 루트 컴포넌트 (현재: 지도 화면)
    │
    ├── components/               # 규모 확장 시 분리
    │   ├── map/                  # 지도 전용 컴포넌트 (레이어, 마커, 컨트롤)
    │   ├── panels/               # 오버레이 패널 (목록, 상세, 날씨, 슬라이더)
    │   └── ui/                   # Atomic UI — 폴더 기반 ({Name}/{Name}.tsx + index.ts)
    │
    ├── hooks/                    # Custom Hooks
    │   ├── useMapbox.ts          # 지도 생성/파괴 수명주기
    │   ├── useSunLight.ts        # 태양 위치 → 라이팅
    │   └── useGeoData.ts         # GeoJSON 지연 로드 + 캐시
    │
    ├── types/                    # TypeScript 타입 (flat 구조)
    │   ├── index.ts
    │   ├── plant.ts              # 발전소/전력망 도메인
    │   └── geo.ts                # 지리 데이터 타입
    │
    ├── constants/                # 상수 (레이어 id, 색상 토큰, 지역 목록)
    │
    └── lib/                      # 유틸리티
        ├── geo.ts                # circlePolygon, featureBBox 등
        └── sun.ts                # dateAtHour, presetFromAltitude 등
```

> 현재 규모(단일 화면)에서는 `App.tsx` 하나로 유지한다. **분리 기준: App.tsx가 1,000줄을 초과하거나 두 번째 화면이 생기는 시점**에 위 구조로 승격한다.

### 2.1 금지 사항

| 금지                                | 이유                     | 대안                                          |
| ----------------------------------- | ------------------------ | --------------------------------------------- |
| Map 인스턴스를 `useState`에 저장    | 리렌더 폭발, 파괴 시점 꼬임 | `useRef<mapboxgl.Map \| null>`               |
| 레이어/소스 id 문자열 산발 하드코딩 | 오타로 silent 실패       | `constants/`에 상수로 정의 후 재사용          |
| `public/geo/` 외 위치에 데이터 배치 | fetch 경로 혼란          | 정적 데이터는 전부 `public/geo/`              |
| 파일명과 export 이름 불일치         | 탐색 혼란                | `SunSlider.tsx` → `export function SunSlider` |

---

## 3. 라우터

### 3.1 현재: 단일 화면 SPA

라우터 없음. `index.html` → `main.tsx` → `App.tsx` 단일 진입.
`wrangler.jsonc`의 `not_found_handling: "single-page-application"`이 모든 경로를 `index.html`로 폴백시킨다 — 라우터 도입 시에도 설정 변경 불필요.

### 3.2 화면이 늘어나면: react-router 규칙

```typescript
// src/main.tsx — 화면 2개 이상이 되는 시점에 도입
import { createBrowserRouter, RouterProvider } from 'react-router';

const router = createBrowserRouter([
  { path: '/', element: <ExplorePage /> },        // 3D 지도 탐색
  { path: '/about', element: <AboutPage /> },     // 프로젝트 소개
]);
```

**규칙:**

- Page 컴포넌트: `export default function {Name}Page()`
- URL 상태(선택 지역, 시각 등)는 `useSearchParams`로 동기화 — 공유 가능한 링크 유지
- 지도 인스턴스는 페이지 이동 시 반드시 `map.remove()` — cleanup 함수에서 처리

### 3.3 내비게이션

```typescript
// ✅ 내부 링크 — react-router Link (라우터 도입 후)
import { Link } from 'react-router';
<Link to="/about">소개</Link>

// ✅ 지도 내 카메라 이동은 URL이 아니라 flyTo
mapRef.current?.flyTo({ center, zoom: 16.5, pitch: 62, duration: 2200, essential: true });
```

---

## 4. 렌더링 전략

SSR이 없으므로 이 프로젝트의 렌더링 전략은 **Mapbox 수명주기 관리**다.

### 4.1 지도 수명주기 3단계

```
┌──────────────────────────┬──────────────────────────────────────────────┐
│ 이벤트                   │ 여기서 해야 할 일                             │
├──────────────────────────┼──────────────────────────────────────────────┤
│ new mapboxgl.Map()       │ 컨테이너/카메라/스타일 지정. 딱 1회 (mount)  │
│ map.on('style.load')     │ 소스·레이어 추가, setConfigProperty          │
│ map.on('load')           │ status='ready', DOM 마커 추가, resize 보정   │
│ cleanup (unmount)        │ 타이머/rAF/observer 해제 → map.remove()      │
└──────────────────────────┴──────────────────────────────────────────────┘
```

**규칙:**

- `style.load`에서 소스 추가 전 `map.getSource(id)` 존재 확인 — 스타일 리로드 시 중복 방지
- 컨테이너 크기 변화는 `ResizeObserver` + `window.resize` 양쪽에서 `map.resize()` 호출 (Mapbox는 자동 resize 안 함)
- 비동기 콜백 안에서는 `mapRef.current === map` 확인 — 파괴된 인스턴스 조작 방지

```typescript
const safeResize = () => {
  if (mapRef.current === map) map.resize();
};
```

### 4.2 React state ↔ Map 동기화

```typescript
// ✅ state → map: effect로만
useEffect(() => {
  const map = mapRef.current;
  if (!map || status !== 'ready') return;
  map.setConfigProperty('basemap', 'lightPreset', presetFromAltitude(altitudeDeg));
}, [hour, status]);

// ❌ 렌더 중 map 조작 금지
function App() {
  mapRef.current?.setLights(...);  // 렌더마다 실행 — 금지
}
```

### 4.3 오버레이 UI 게이팅

```typescript
// status state machine: 'loading' | 'ready' | 'error'
{status === 'ready' && <ControlPanels />}   // 지도 준비 후에만 컨트롤 노출
{status === 'loading' && <LoadingBadge />}
{status === 'error' && <ErrorBanner msg={errMsg} />}
```

---

## 5. 에러 처리

### 5.1 에러 계층

```
치명적 (초기 로드 실패)   → status='error' + 전체 배너 (토큰 누락, 스타일 로드 실패)
비치명적 (런타임)          → console.warn만 (조명 파라미터, 날씨 효과, GeoJSON 개별 로드 실패)
```

### 5.2 지도 에러 핸들러 (필수)

```typescript
map.on('error', (e) => {
  const msg = (e as { error?: Error }).error?.message ?? String(e);
  console.warn('[mapbox]', msg);
  // 로드 완료 후의 런타임 에러는 화면을 날리지 않는다 — 초기 로드 실패만 error 상태로
  if (!map.loaded()) {
    setErrMsg(msg);
    setStatus('error');
  }
});
```

### 5.3 토큰 누락 가드 (필수)

```typescript
if (!mapboxgl.accessToken) {
  setStatus('error');
  setErrMsg('VITE_MAPBOX_TOKEN 미설정 (.env 확인)');
  return; // Map 생성 자체를 하지 않음
}
```

### 5.4 데이터 로드 실패 — 폴백 유지

```typescript
// ✅ 실측 데이터 로드 실패 시 목업 데이터가 그대로 남는다 (초기값 = 목업)
fetch('/geo/plant-feed.json')
  .then((r) => r.json())
  .then((feed) => { /* setData로 교체 */ })
  .catch((err) => console.warn('[feed] load fail', err)); // 화면은 살아 있음
```

**원칙: 부가 데이터는 실패해도 코어 경험(3D 지도 탐색)이 살아 있어야 한다.**

---

## 6. Types 레이어

### 6.1 구조

```
types/
├── index.ts            # barrel export
├── plant.ts            # 발전소/전력망 도메인
└── geo.ts              # 지리 데이터 (feed, 경계 properties)
```

Flat 구조를 사용한다. 파일 수가 적을 때는 하위 폴더 없이 flat이 탐색 효율이 가장 높다.

### 6.2 도메인 타입 패턴

```typescript
// src/types/plant.ts

// ── Union Types ──
export type GridRole = 'transmission' | 'distribution';
export type NodeKind = 'substation' | 'load';
export type WeatherMode = 'clear' | 'rain' | 'snow';
export type MapStatus = 'loading' | 'ready' | 'error';

// ── Entity ──
export interface Plant {
  id: string;
  name: string;
  type: string;
  address: string;
  lng: number;   // 좌표는 항상 [lng, lat] 순서 — GeoJSON 규약
  lat: number;
}

export interface GridNode {
  id: string;
  name: string;
  kind: NodeKind;
  lng: number;
  lat: number;
}

// ── 외부 데이터 응답 ──
export interface PlantFeed {
  substation: { name: string; lng: number; lat: number };
  kv: number;
  feed: GeoJSON.Feature;
}
```

### 6.3 규칙

| 규칙                   | 설명                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| `interface` 사용       | 객체 형태는 `interface` (`type` 아님) — 확장성, 에러 메시지 가독성 |
| `I` 접두사 금지        | `Plant` (O), `IPlant` (X)                                          |
| `import type` 필수     | 타입만 import 시 반드시 `import type` 사용                         |
| 좌표 순서 고정         | 항상 `lng, lat` 순 — Mapbox/GeoJSON 규약. `lat, lng` 혼용 금지     |
| GeoJSON 전역 타입 사용 | `GeoJSON.FeatureCollection` 등 `@types/geojson` 전역 네임스페이스  |

---

## 7. 데이터 레이어

백엔드가 없다. **정적 GeoJSON fetch → ref 캐시**가 이 프로젝트의 API 레이어다.

### 7.1 구조

```
public/geo/               # 데이터 원본 (빌드 시 그대로 복사)
src/hooks/useGeoData.ts   # 지연 로드 + 캐시 (분리 시)
```

### 7.2 지연 로드 + 캐시 패턴 (표준)

```typescript
// 경로별 1회만 fetch — ref가 캐시 저장소
const loadGeo = async (url: string, ref: React.MutableRefObject<GeoJSON.FeatureCollection | null>) => {
  if (ref.current) return ref.current;
  try {
    const res = await fetch(url);
    ref.current = (await res.json()) as GeoJSON.FeatureCollection;
    return ref.current;
  } catch (err) {
    console.warn('[region] geojson load fail:', url, err);
    return null; // 호출부는 null 체크로 조용히 스킵
  }
};
```

**규칙:**

- 무거운 경계 데이터(시/도 2.3MB)는 **첫 사용 시점에만** 로드 — 초기 로딩에 포함 금지
- 소스 데이터 교체는 `(map.getSource(id) as mapboxgl.GeoJSONSource)?.setData(...)` — 레이어 재생성 금지
- 대용량 GeoJSON은 `map.addSource(id, { type: 'geojson', data: '/geo/....json' })`처럼 **URL 직접 전달**도 가능 — Mapbox가 알아서 fetch

### 7.3 백엔드가 생기면

React Query + Axios 3계층(HTTP Client → API Functions → Hooks)으로 승격한다.
그 시점의 표준은 RMS frontend 표준 프레임워크 §7을 따른다.

---

## 8. Hooks 레이어

### 8.1 분리 기준

현재는 `App.tsx` 내 effect 3개(지도 수명주기 / 태양 라이팅 / 날씨)로 유지.
**effect가 5개를 넘거나 두 번째 지도 화면이 생기면** 훅으로 분리한다.

```
hooks/
├── useMapbox.ts        # 지도 생성/파괴 + status 관리
├── useSunLight.ts      # hour → SunCalc → setLights/lightPreset
├── useWeather.ts       # weather → setRain/setSnow
└── useGeoData.ts       # GeoJSON 지연 로드 캐시
```

### 8.2 지도 훅 패턴

```typescript
// src/hooks/useSunLight.ts

import { useEffect } from 'react';
import * as SunCalc from 'suncalc';

export function useSunLight(
  mapRef: React.RefObject<mapboxgl.Map | null>,
  status: MapStatus,
  hour: number,
  refPoint: { lat: number; lng: number },
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    // SunCalc → directional light + lightPreset
  }, [mapRef, status, hour, refPoint]);
}
```

### 8.3 Hook 규칙

| 규칙                           | 이유                                       |
| ------------------------------ | ------------------------------------------ |
| `status !== 'ready'` 조기 반환 | 지도 준비 전 조작은 예외 발생              |
| map 조작은 try/catch           | 스타일 전환 중 setLights 등이 throw 가능   |
| rAF/타이머는 cleanup에서 해제  | 언마운트 후 파괴된 map 조작 방지           |
| 훅은 mapRef를 인자로 받는다    | 훅이 지도를 소유하지 않음 — 소유자는 1곳   |

---

## 9. Components 레이어

### 9.1 3단계 계층

| 계층        | 위치                  | 파일 구조                               | 용도                                  |
| ----------- | --------------------- | --------------------------------------- | ------------------------------------- |
| **Atomic UI** | `components/ui/`     | 폴더 (`Button/Button.tsx` + `index.ts`) | 디자인 시스템 원자 요소               |
| **Panel**   | `components/panels/`  | flat 파일 (`SunSlider.tsx`)             | 지도 위 오버레이 패널                 |
| **Map**     | `components/map/`     | flat 파일 (`PlantMarkers.tsx`)          | 지도 레이어/마커를 관리하는 컴포넌트  |

### 9.2 오버레이 패널 패턴

```typescript
// 지도 위 플로팅 패널의 표준 스킨
<div className="absolute left-4 top-4 z-10 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">
```

| 토큰                | 값                                    |
| ------------------- | ------------------------------------- |
| 배경                | `bg-black/60` (+ `backdrop-blur`)     |
| 모서리              | `rounded-xl` (버튼류는 `rounded-md`)  |
| 본문 텍스트         | `text-white` / 보조 `text-slate-300`  |
| 강조(활성)          | `bg-blue-600`                         |
| 상태색              | 발전 `#22c55e` · 송전 `#f59e0b` · 배전 `#38bdf8` · 변전소 `#a78bfa` |

### 9.3 접근성 (WCAG 2.1 AA)

```typescript
// ✅ 인터랙티브 요소 → 네이티브 HTML
<button type="button" onClick={handleClick}>목록으로</button>

// ❌ div에 onClick (키보드 접근 불가)
<div onClick={handleClick}>목록으로</div>
```

| 요소                   | 필수 속성                                    |
| ---------------------- | -------------------------------------------- |
| 텍스트 없는 `<button>` | `aria-label`                                 |
| 슬라이더               | `<input type="range">` 네이티브 사용         |
| 드롭다운               | `<select>` 네이티브 사용                     |
| DOM 마커(지도)         | 클릭 핸들러 + 시각적 포커스 여유             |
| 이미지/SVG 아이콘      | `alt` 또는 `title`                           |

### 9.4 컴포넌트 규칙

- **UI 컴포넌트**: `named export` + `forwardRef` + `displayName`
- **루트/페이지 컴포넌트**: `default export`
- **Props**: 컴포넌트 파일 내 `interface {Name}Props`
- **파일명 = export 이름** 일치 필수

---

## 10. Stores 레이어

### 10.1 원칙

```
useState (현재):  화면 로컬 상태          useRef:  React 밖 세계
├── status, errMsg                       ├── map 인스턴스
├── weather, hour                        ├── GeoJSON 캐시
├── selected (선택 발전소)                ├── 타이머 id
└── region / district / dong             └── popup, 애니메이션 프레임 id
```

**서버 상태가 없으므로 전역 스토어도 없다.** 상태가 컴포넌트 2개 이상을 가로지르는 시점에 Zustand를 도입한다.

### 10.2 도입 시 규칙 (RMS 표준 상속)

| 규칙                    | 설명                                    |
| ----------------------- | --------------------------------------- |
| 네이밍 `use{Name}Store` | `useMapStore`, `useUiStore`             |
| Map 인스턴스 저장 금지  | 스토어는 직렬화 가능한 값만             |
| 파생값은 selector로     | `useMapStore(s => s.hour)`              |

---

## 11. Utils 레이어

### 11.1 구조

```
lib/
├── geo.ts              # 지리 계산
│   ├── circlePolygon() # 좌표 둘레 원형 폴리곤 (3D 비컨 바닥면)
│   └── featureBBox()   # GeoJSON bbox 계산 (fitBounds용)
└── sun.ts              # 태양 계산
    ├── dateAtHour()          # hour(0~24) → 오늘 기준 Date
    ├── presetFromAltitude()  # 태양 고도 → lightPreset
    └── zoomReveal()          # 줌 11→13 페이드 인 expression
```

### 11.2 geo.ts 핵심 함수

```typescript
/* 특정 좌표 둘레의 작은 원형 폴리곤 (미터 반경) */
export function circlePolygon(lng: number, lat: number, radiusM: number, steps = 24): number[][] {
  const ring: number[][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

/* GeoJSON 좌표에서 bbox [minLng, minLat, maxLng, maxLat] */
export function featureBBox(geom: GeoJSON.Geometry): [number, number, number, number];
```

### 11.3 sun.ts 규약

```typescript
// suncalc 2.0.0은 altitude/azimuth를 '도(degree)' 단위로 반환하며
// azimuth는 북쪽 기준 시계방향 → Mapbox direction 규약과 일치 (변환 불필요)
// Mapbox directional light direction = [방위각 0~360, 극각 0~90]
//   극각(polar) = 90 - 태양고도
```

**주의: suncalc 1.x는 라디안 반환 — 버전 교체 시 이 규약이 깨진다. 버전 고정 필수.**

---

## 12. 스타일링

**Tailwind CSS v4** (`@tailwindcss/vite` 플러그인, zero-config)

### 12.1 규칙

| 규칙              | 설명                                              |
| ----------------- | ------------------------------------------------- |
| 글로벌 CSS        | `src/index.css` 하나만 (`@import 'tailwindcss'`)  |
| CSS Modules 금지  | Tailwind 유틸리티로 통일                          |
| 인라인 style      | **지도 DOM 마커에만 허용** (React 트리 밖 innerHTML) — 그 외 금지 |
| 폰트              | Pretendard → system-ui 폴백                       |
| 다크 고정         | 배경 `#0a0f1c` — 지도 앱 특성상 다크 단일 테마    |

### 12.2 사용 패턴

```typescript
// ✅ 오버레이 패널 표준 스킨 (§9.2)
<div className="absolute left-4 top-4 z-10 rounded-xl bg-black/60 p-3 shadow-xl backdrop-blur">

// ✅ 조건부 클래스 — 템플릿 리터럴 (규모 커지면 cn() 도입)
<button className={`rounded-md px-3 py-1.5 ${active ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-white/10'}`}>

// ✅ 지도 마커 innerHTML — 인라인 style 허용 예외
wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
```

---

## 13. 네이밍 규칙

### 13.1 파일 네이밍

| 대상             | 규칙                        | 예시                     |
| ---------------- | --------------------------- | ------------------------ |
| 루트 컴포넌트    | `App.tsx`                   | `src/App.tsx`            |
| UI 컴포넌트      | PascalCase 폴더             | `Button/Button.tsx`      |
| Panel/Map 컴포넌트 | PascalCase flat           | `SunSlider.tsx`          |
| 훅               | camelCase + `use`           | `useSunLight.ts`         |
| 유틸리티         | camelCase                   | `geo.ts`, `sun.ts`       |
| 타입             | kebab-case                  | `plant.ts`               |
| 정적 데이터      | kebab-case                  | `ulsan-power.json`       |
| 테스트           | `{원본}.test.ts(x)`         | `geo.test.ts`            |

### 13.2 코드 네이밍

| 대상            | 규칙                    | 예시                              |
| --------------- | ----------------------- | --------------------------------- |
| Entity 타입     | PascalCase              | `Plant`, `GridNode`               |
| Union 타입      | PascalCase              | `WeatherMode`, `MapStatus`        |
| 지도 소스/레이어 id | kebab-case 문자열 상수 | `'plant-beacons'`, `'grid-flow'` |
| GeoJSON 빌더    | `{대상}GeoJSON`         | `beaconGeoJSON`, `gridLinesGeoJSON` |
| 이벤트 핸들러   | `handle + Action` 또는 동사구 | `selectPlant`, `backToList`  |
| Props           | `{Component}Props`      | `SunSliderProps`                  |
| 상수            | SCREAMING_SNAKE_CASE    | `PLANTS`, `PROVINCES`, `HOME`     |

### 13.3 지도 레이어 id 일관성

같은 기능 계열은 **동일한 접두사**:

```
plant-*    발전소     (plant-beacons, plant-beacons-3d)
grid-*     목업 전력망 (grid-base, grid-flow, grid-nodes-dot, grid-nodes-label)
power-*    OSM 실측   (power-lines, power-towers, power-subs-fill, power-subs-label)
region-*   행정 경계  (region-outline-glow, region-outline-line)
```

---

## 14. Import 규칙

### 14.1 순서

```typescript
// 1. React
import { useEffect, useRef, useState } from 'react';

// 2. 외부 라이브러리
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as SunCalc from 'suncalc';

// 3. 내부 모듈
import { circlePolygon, featureBBox } from './lib/geo';

// 4. 타입 (import type)
import type { Plant, WeatherMode } from './types';
```

### 14.2 consistent-type-imports

```typescript
// ✅ 타입만 import
import type { Plant } from './types';

// ❌ 타입을 일반 import
import { Plant } from './types';
```

---

## 15. 기술 스택

### 15.1 런타임

| 영역          | 기술              | 버전     | 비고                                   |
| ------------- | ----------------- | -------- | -------------------------------------- |
| 빌드          | Vite              | ^6.3.5   |                                        |
| UI            | React             | ^19.0.0  |                                        |
| 언어          | TypeScript        | ~5.7.2   |                                        |
| 지도          | mapbox-gl         | ^3.24.0  | Standard style, setLights, rain/snow   |
| 천문 계산     | suncalc           | ^2.0.0   | **도 단위 반환 — 버전 고정 필수** (§11.3) |
| 스타일링      | Tailwind CSS      | ^4.1.0   | `@tailwindcss/vite` 플러그인           |
| 배포          | Cloudflare Workers | —       | 정적 에셋 (`wrangler.jsonc`)           |

### 15.2 도입하지 않은 것 (의도적)

| 미도입             | 이유                                            |
| ------------------ | ----------------------------------------------- |
| Next.js            | 서버 렌더링 불필요 — 지도는 100% 클라이언트     |
| React Query, Axios | 백엔드 없음 — 정적 fetch + ref 캐시로 충분      |
| Zustand            | 단일 화면 — useState/useRef로 충분              |
| react-router       | 단일 화면 — 두 번째 화면 생기면 도입 (§3.2)     |

---

## 16. DX 도구

### 16.1 TypeScript 설정

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

**필수 strict 옵션:** `strict` + `noUnusedLocals` + `noUnusedParameters`

### 16.2 package.json 스크립트

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "deploy": "npm run build && wrangler deploy"
  }
}
```

**`build`에 `tsc -b` 포함 — 타입 에러가 있으면 빌드가 실패한다. 우회 금지.**

### 16.3 확장 시 도입 순서

```
1순위  ESLint (flat config) + typescript-eslint + react-hooks + jsx-a11y
2순위  Prettier (.prettierrc — RMS 표준과 동일 설정)
3순위  Husky + lint-staged (pre-commit 차단)
```

---

## 17. 테스트

### 17.1 우선 대상 (Vitest 도입 시)

| 대상                | 이유                                     |
| ------------------- | ---------------------------------------- |
| `lib/geo.ts`        | 순수 함수 — bbox, 원형 폴리곤 좌표 검증  |
| `lib/sun.ts`        | preset 경계값 (-6°, 3°) 회귀 방지        |
| GeoJSON 빌더        | feature 개수, properties 스키마 검증     |

```typescript
// src/__tests__/lib/sun.test.ts
import { describe, it, expect } from 'vitest';
import { presetFromAltitude } from '@/lib/sun';

describe('presetFromAltitude', () => {
  it('returns night below civil twilight', () => {
    expect(presetFromAltitude(-10)).toBe('night');
  });
  it('returns dawn near horizon', () => {
    expect(presetFromAltitude(0)).toBe('dawn');
  });
  it('returns day above 3 degrees', () => {
    expect(presetFromAltitude(45)).toBe('day');
  });
});
```

### 17.2 E2E (Playwright 도입 시)

```typescript
// e2e/map.spec.ts — 핵심 시나리오
test('map loads and shows control panels', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('⚡ TerraWatt')).toBeVisible();
  await expect(page.getByText('발전소 바로가기')).toBeVisible();
});
```

> 지도 캔버스 자체는 픽셀 검증이 어려우므로 **오버레이 UI + status 전환**을 검증 대상으로 한다.

---

## 18. 보안

### 18.1 Mapbox 토큰

| 규칙               | 설명                                                            |
| ------------------ | --------------------------------------------------------------- |
| 공개 토큰(pk.*)만  | 시크릿 토큰(sk.*)은 클라이언트에 절대 포함 금지                 |
| URL 제한 필수      | Mapbox 대시보드에서 배포 도메인 + `localhost`만 허용            |
| 프로젝트별 분리    | 포트폴리오용 토큰과 업무용 토큰을 분리 — 사용량/폐기 독립       |
| `.env`는 git 제외  | `.env.example`만 추적, 실제 값은 Cloudflare 빌드 환경변수로     |

> 공개 토큰이 번들에 노출되는 것 자체는 정상이다 — 방어선은 토큰의 URL 제한이다.

### 18.2 정적 호스팅 보안 헤더

서버 코드가 없으므로 CSP는 Cloudflare 쪽에서 건다. 필요 시 `public/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 18.3 XSS 주의 지점

```typescript
// 지도 마커/팝업 innerHTML — 외부 입력을 절대 넣지 않는다.
// 현재는 코드 내 상수(PLANTS)만 삽입하므로 안전.
// 사용자 입력/외부 API 데이터를 넣게 되는 순간 textContent 또는 이스케이프 필수.
wrap.innerHTML = `<span>${p.name}</span>`; // p.name이 코드 상수일 때만 허용
```

### 18.4 빌드 타입 안전성

```
❌ 금지: build 스크립트에서 tsc 제거, // @ts-ignore 남발
타입 에러가 있으면 배포가 차단되는 구조를 유지한다 (§16.2).
```

---

## 19. 성능

### 19.1 번들

| 전략                    | 설명                                                          |
| ----------------------- | ------------------------------------------------------------- |
| mapbox-gl은 크다 (~580KB gz) | 지도가 앱의 본질이므로 수용 — 그 외 라이브러리 추가는 신중히 |
| 화면 늘어나면 code-split | `React.lazy` + dynamic import로 지도 화면 분리                |

### 19.2 데이터 로딩

| 전략                     | 설명                                                    |
| ------------------------ | ------------------------------------------------------- |
| 경계 GeoJSON 지연 로드   | 시/도 2.3MB — 드롭다운 첫 사용 시에만 fetch + ref 캐시  |
| 소스 교체는 `setData`    | 레이어 재생성 없이 데이터만 스왑                        |
| minzoom 게이팅           | 송전탑 z13+, 라벨 z14+ — 원거리에서 렌더 비용 차단      |
| 줌 기반 페이드           | `zoomReveal()` interpolate — opacity 급변 없이 자연 전환 |

### 19.3 애니메이션

```typescript
// rAF 스로틀 — 대시 애니메이션은 ~16fps면 충분, 매 프레임 setPaintProperty 금지
const animateFlow = (t: number) => {
  flowRaf = requestAnimationFrame(animateFlow);
  if (t - last < 60) return; // 60ms 간격
  // ...
};
// cleanup에서 반드시 cancelAnimationFrame(flowRaf)
```

### 19.4 Cloudflare 캐싱

- `dist/assets/*`는 해시 파일명 — 영구 캐시 자동
- `public/geo/*.json`은 파일명 고정 — 데이터 갱신 시 파일명 버저닝(`ulsan-power.v2.json`) 고려

---

## 20. 환경변수

### 20.1 파일 구조

```
.env                # 로컬 개발 (git 무시)
.env.example        # 변수 목록 (값 없음, git 추적)
```

### 20.2 규칙

| 규칙             | 설명                                                       |
| ---------------- | ---------------------------------------------------------- |
| `VITE_` 접두사   | 클라이언트 번들에 포함되는 변수에만 사용 (Vite 규약)       |
| 비밀값 금지      | `VITE_`에 시크릿 키 절대 넣지 않음 — 전부 번들에 노출된다  |
| 접근 방법        | `import.meta.env.VITE_MAPBOX_TOKEN` (`process.env` 아님)   |
| 배포 환경변수    | Cloudflare 대시보드 빌드 설정에 등록                       |

```bash
# .env.example
VITE_MAPBOX_TOKEN=
```

---

## 21. 체크리스트

### 21.1 프로젝트 초기 설정

```
□ TypeScript
  □ strict: true + noUnusedLocals + noUnusedParameters
  □ types: ["vite/client"]
  □ build 스크립트에 tsc -b 포함

□ 환경변수
  □ .env.example 작성
  □ .gitignore에 .env 포함
  □ 토큰 누락 시 에러 배너 가드 (§5.3)

□ 지도 수명주기
  □ map 인스턴스는 useRef
  □ style.load에서 getSource 존재 확인 후 addSource
  □ ResizeObserver + resize 리스너
  □ cleanup: 타이머/rAF/observer 해제 → map.remove()
  □ map.on('error') 핸들러 (§5.2)

□ 배포
  □ wrangler.jsonc (SPA 폴백 포함)
  □ Cloudflare 빌드 환경변수 VITE_MAPBOX_TOKEN
  □ Mapbox 토큰 URL 제한

□ 빌드 확인
  □ npm run build 성공 (타입 에러 0)
```

### 21.2 새 지도 레이어 추가

```
□ 소스/레이어 id — 기능 접두사 규칙 (§13.3)
□ style.load 콜백 안에서 추가 + getSource 중복 가드
□ minzoom / 줌 페이드 설정 — 원거리 렌더 비용 검토
□ 인터랙션 시 cursor pointer (mouseenter/mouseleave)
□ 데이터 갱신은 setData (레이어 재생성 금지)
□ 애니메이션 rAF는 cleanup에서 해제
```

### 21.3 새 오버레이 패널 추가

```
□ 표준 스킨 (absolute + z-10 + bg-black/60 + backdrop-blur + rounded-xl)
□ status === 'ready' 게이팅
□ 네이티브 HTML 요소 (button/select/input) 우선
□ 모바일 뷰포트에서 겹침 확인 (w-[min(90vw,...)] 패턴)
```

### 21.4 새 정적 데이터 추가

```
□ public/geo/에 kebab-case 파일명
□ 대용량이면 지연 로드 + ref 캐시 (§7.2)
□ 로드 실패 시 코어 경험 유지 (§5.4)
□ 출처/라이선스 README에 기록 (OSM 등)
```

### 21.5 코드 리뷰

```
□ 지도
  □ map 조작이 effect/핸들러 안에만 있는가?
  □ 비동기 콜백에서 mapRef.current === map 확인?
  □ cleanup 누수 없는가 (타이머/rAF/observer)?

□ Types
  □ interface 사용 (type 아님)?
  □ import type 사용?
  □ 좌표 [lng, lat] 순서 일관?

□ 스타일
  □ 오버레이 표준 스킨 준수?
  □ 인라인 style은 지도 마커 innerHTML에만?

□ 보안
  □ innerHTML에 외부 입력 없음?
  □ VITE_ 변수에 비밀값 없음?
  □ console.log 없음 (warn/error만)?

□ 빌드
  □ npm run build 성공?
```

---

**문서 끝**
