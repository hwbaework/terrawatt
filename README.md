# ⚡ TerraWatt

> **3D Energy Grid Explorer** — 태양 위치·날씨·전력망을 실시간으로 담은 인터랙티브 3D 에너지 지도

Mapbox GL JS의 Standard 스타일 위에 실제 물리 기반 라이팅과 에너지 인프라 시각화를 얹은 포트폴리오 프로젝트입니다.

## 주요 기능

- **☀️ 태양 시뮬레이션** — SunCalc로 계산한 실제 태양 고도/방위각을 Mapbox 3D 라이팅(directional light + shadow)에 반영. 시간 슬라이더를 움직이면 새벽 → 낮 → 노을 → 밤이 실시간으로 전환
- **🌧 날씨 효과** — Mapbox GL v3의 `setRain` / `setSnow` 파티클 효과 (줌 레벨에 따라 페이드 인)
- **🔌 전력망 시각화** — 변전소 → 발전소 → 수용가로 이어지는 송/배전 경로를 대시 애니메이션으로 "전기가 흐르는" 효과 표현. OpenStreetMap 실측 송전선·송전탑·변전소 데이터(울산) 오버레이
- **🏙 3D 건물 & 비컨** — Standard 스타일 3D 건물 + fill-extrusion 원기둥 비컨으로 발전소 위치 강조
- **🗺 행정구역 드릴다운** — 시/도 → 구/군 → 읍/면/동 3단계 경계 탐색 (경계 윤곽선 글로우 플래시 + 카메라 fitBounds)

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 지도 | Mapbox GL JS v3 (Standard style, lights, rain/snow) |
| 프레임워크 | React 19 + TypeScript + Vite |
| 스타일 | Tailwind CSS v4 |
| 천문 계산 | SunCalc |
| 배포 | Cloudflare Workers (정적 에셋) |

## 로컬 실행

```bash
npm install
cp .env.example .env   # VITE_MAPBOX_TOKEN에 Mapbox 공개 토큰 입력
npm run dev
```

## 배포 (Cloudflare)

### 방법 A — 대시보드 Git 연동 (권장)

1. GitHub에 저장소 푸시
2. Cloudflare 대시보드 → **Workers 및 Pages → 응용 프로그램 생성 → 저장소 연결**
3. 빌드 설정
   - 빌드 명령: `npm run build`
   - 배포 명령: `npx wrangler deploy` (wrangler.jsonc가 dist를 정적 에셋으로 배포)
   - 환경 변수(빌드): `VITE_MAPBOX_TOKEN`
4. 이후 `git push`마다 자동 배포

### 방법 B — CLI 직접 배포

```bash
npm run deploy   # build 후 wrangler deploy
```

> **토큰 보안**: Mapbox 공개 토큰(pk.*)은 번들에 노출되는 것이 정상이지만, [Mapbox 계정](https://account.mapbox.com/access-tokens/)에서 **URL restrictions**로 배포 도메인만 허용해 두세요.

## 데이터 출처

- 전력 인프라(송전선/송전탑/변전소): © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- 행정구역 경계: southkorea-maps (GADM/통계청 기반 공개 데이터)
- 발전소/수용가 정보는 데모용 가상 데이터입니다
