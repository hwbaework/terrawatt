/* 브이월드 3D 엔진(웹지엘 3D지도 API 3.0)을 리액트에서 다루기 위한 얇은 감싸개.

   로더 스크립트 자체는 index.html 에 정적으로 박혀 있다 — 리액트에서 나중에 끼워넣으면
   vw 객체가 생성되지 않기 때문(로더 내부가 옛날 document.write 방식).
   이 파일은 "이미 로드된 엔진"이 준비될 때까지 기다렸다가 지도를 띄우는 역할만 한다. */

/** 브이월드 인증키 — 로더는 index.html 이 쓰지만, 키 유무 확인은 화면에서도 필요하다 */
export const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY ?? '';

/* 브이월드가 window 에 붙여주는 것들 — 공식 타입 정의가 없어 필요한 만큼만 선언 */
export interface VwMap {
  setOption(o: unknown): void;
  setMapId(id: string): void;
  setInitPosition(p: unknown): void;
  setLogoVisible(v: boolean): void;
  setNavigationZoomVisible(v: boolean): void;
  start(): void;
}
interface VwGlobal {
  Map: new () => VwMap;
  CameraPosition: new (coord: unknown, dir: unknown) => unknown;
  CoordZ: new (lng: number, lat: number, z: number) => unknown;
  Direction: new (heading: number, tilt: number, roll: number) => unknown;
}
/* 엔진 내부의 Cesium 뷰어 — 카메라를 직접 옮길 때 쓴다.
   브이월드 API의 setInitPosition 은 실제로 카메라를 옮겨주지 않아서(실측: 1,700km 상공에 머묾)
   시작 후 이쪽으로 직접 이동시킨다. */
interface CesiumLike {
  SceneTransforms: {
    /** 3D 좌표 → 화면 픽셀. 화면 밖이거나 지구 반대편이면 undefined */
    wgs84ToWindowCoordinates(scene: unknown, pos: unknown): { x: number; y: number } | undefined;
  };
  ScreenSpaceEventHandler: new (canvas: unknown) => {
    setInputAction(fn: (e: { position: unknown }) => void, type: number): void;
    destroy(): void;
  };
  ScreenSpaceEventType: { LEFT_CLICK: number };
  Cartesian3: { fromDegrees(lng: number, lat: number, h: number): unknown };
  Cartographic: { fromCartesian(c: unknown): { longitude: number; latitude: number; height: number } };
  HeadingPitchRange: new (heading: number, pitch: number, range: number) => unknown;
  Math: { toRadians(d: number): number; toDegrees(r: number): number };
  Matrix4: { IDENTITY: unknown };
}
/** 브이월드 엔진 내부 전역 — window.ws3d 선언은 **이 파일 한 곳에서만** 한다(중복 선언 시 타입 충돌) */
export interface Ws3dLike {
  common: {
    HeadingPitchRoll: new (heading: number, pitch: number, roll: number) => unknown;
  };
  viewer?: {
    camera?: {
      position: unknown;
      lookAt(target: unknown, offset: unknown): void;
      lookAtTransform(m: unknown): void;
    };
    objectManager?: {
      removeGeometryById?(id: string): void;
    };
    entities?: {
      add(e: unknown): unknown;
      remove(e: unknown): boolean;
    };
    scene?: {
      canvas?: unknown;
      pick(pos: unknown): unknown;
      /** 변화가 있을 때만 그리는 모드라, 값을 바꾼 뒤엔 이걸 불러 다시 그리게 한다 */
      requestRender?(): void;
      globe?: {
        /** 그 지점의 지형 고도(해발 m). 지형이 아직 안 내려왔으면 undefined */
        getHeight?(c: unknown): number | undefined;
      };
      /** 화면에 올라간 것들 — 브이월드 건물 타일셋을 여기서 찾는다 */
      primitives?: { length: number; get(i: number): unknown };
      /** 마우스로 카메라를 어디까지 움직일 수 있는지 정하는 곳 */
      screenSpaceCameraController?: {
        maximumZoomDistance: number;
      };
    };
  };
}

declare global {
  interface Window {
    vw?: VwGlobal;
    ws3d?: Ws3dLike;
    Cesium?: CesiumLike;
    /** 로더가 남기는 값 — 'pending' | 'ok' | 'blocked' */
    __vwNet?: string;
    /** 로더가 키를 검사한 결과 (문자열 "true"/"false") */
    vworldIsValid?: string;
    vworldErrMsg?: string;
  }
}

export type EngineStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; reason: string; detail: string };

/** 지금 상태를 사람이 읽을 수 있는 이유로 바꾼다 — 실패 시 어디서 막혔는지 바로 알 수 있게 */
export function diagnose(): EngineStatus {
  if (window.vw?.Map) return { state: 'ready' };
  if (window.__vwNet === 'blocked') {
    return {
      state: 'error',
      reason: '로더 스크립트를 받지 못했습니다',
      detail: '브라우저 확장(광고·추적 차단)이나 네트워크가 map.vworld.kr 을 막고 있을 수 있습니다.',
    };
  }
  if (typeof window.vworldIsValid === 'undefined') {
    return {
      state: 'error',
      reason: '로더가 실행되지 않았습니다',
      detail: `내려받기=${window.__vwNet ?? '알 수 없음'} · 접속 호스트=${location.hostname}`,
    };
  }
  if (String(window.vworldIsValid) !== 'true') {
    return {
      state: 'error',
      reason: '인증키가 거부됐습니다',
      detail: window.vworldErrMsg || '(사유 없음) — 등록 도메인과 접속 주소가 맞는지 확인하세요',
    };
  }
  return {
    state: 'error',
    reason: '키는 통과했으나 3D 엔진이 올라오지 않았습니다',
    detail: '인증키에 3D 지도 API 사용 승인이 났는지 확인이 필요합니다.',
  };
}

/** 엔진이 준비될 때까지 기다린다 (최대 timeoutMs) */
export function waitForEngine(timeoutMs = 12000): Promise<EngineStatus> {
  return new Promise((resolve) => {
    if (window.vw?.Map) return resolve({ state: 'ready' });
    const started = Date.now();
    const t = window.setInterval(() => {
      if (window.vw?.Map) {
        window.clearInterval(t);
        resolve({ state: 'ready' });
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(t);
        resolve(diagnose());
      }
    }, 200);
  });
}

export interface CameraSpec {
  lng: number;
  lat: number;
  /** 고도(m) — 클수록 멀리서 본다 */
  altitude: number;
  /** 내려다보는 각도. -90 = 수직, -45 = 비스듬 */
  tiltDeg: number;
  /** 방위각(도) */
  headingDeg?: number;
}

/** 카메라 고도(m). 엔진 기본 위치(전국 뷰)는 약 1,700km 라서 이 값으로 구분할 수 있다. */
export function cameraHeight(): number | null {
  return cameraAt()?.height ?? null;
}

/** 카메라가 지금 어디 있는지 (위경도·고도) */
function cameraAt(): { lng: number; lat: number; height: number } | null {
  const camera = window.ws3d?.viewer?.camera;
  const C = window.Cesium;
  if (!camera || !C) return null;
  try {
    const p = C.Cartographic.fromCartesian(camera.position);
    return { lng: C.Math.toDegrees(p.longitude), lat: C.Math.toDegrees(p.latitude), height: p.height };
  } catch {
    return null;
  }
}

/** 지도를 특정 지점 위로 이동시킨다.
    대상 지점을 화면 중앙에 두고 `altitude` 만큼 떨어져 `tiltDeg` 각도로 내려다본다.

    ⚠️ **실제로 도착했는지까지 확인해서 돌려준다.** 엔진이 시작 직후 자기 초기 위치(전국 뷰,
       고도 1,700km)로 카메라를 되돌리기 때문에, 너무 일찍 부르면 조용히 무시된 것처럼 된다.
       호출한 쪽은 false 가 오면 잠시 뒤 다시 부르면 된다. */
export function lookAtPlace(cam: CameraSpec): boolean {
  const camera = window.ws3d?.viewer?.camera;
  const C = window.Cesium;
  if (!camera || !C) return false;
  try {
    camera.lookAt(
      C.Cartesian3.fromDegrees(cam.lng, cam.lat, 0),
      new C.HeadingPitchRange(
        C.Math.toRadians(cam.headingDeg ?? 0),
        C.Math.toRadians(cam.tiltDeg),
        cam.altitude,
      ),
    );
    // 잠금 해제 — 안 풀면 이후 마우스 조작이 대상에 묶여 버린다
    camera.lookAtTransform(C.Matrix4.IDENTITY);
  } catch {
    return false;
  }
  // 목표 근처(약 5km 이내)에 실제로 왔는지 확인
  const now = cameraAt();
  if (!now) return false;
  return Math.abs(now.lng - cam.lng) < 0.05 && Math.abs(now.lat - cam.lat) < 0.05;
}

/** 카메라가 움직일 수 있는 범위를 잠근다.

    기본 상태는 지구 전체를 돌려볼 수 있고 위아래 각도까지 자유롭다 — 우리 화면에선 필요 없고,
    오히려 한 번 헤매면 내 건물을 다시 찾기 어렵다. 그래서 **좌우 회전과 확대/축소만** 남긴다.

    **멀어지는 쪽만 잠근다.** 가까이 다가가는 것·회전·기울기는 엔진 기본값 그대로 둔다
    (건물을 가까이서 살펴봐야 하므로 확대는 막지 않는다). */
export function applyCameraLimits(maxM: number): boolean {
  const ctrl = window.ws3d?.viewer?.scene?.screenSpaceCameraController;
  if (!ctrl) return false;
  ctrl.maximumZoomDistance = maxM;
  return true;
}

/** 위경도+높이(m) → 화면 픽셀 좌표. 화면에 안 보이면 null.
    지도 위에 HTML 이름표를 붙여 따라다니게 할 때 쓴다. */
export function worldToScreen(lng: number, lat: number, heightM = 0): { x: number; y: number } | null {
  const scene = window.ws3d?.viewer?.scene;
  const C = window.Cesium;
  if (!scene || !C?.SceneTransforms) return null;
  try {
    const p = C.SceneTransforms.wgs84ToWindowCoordinates(scene, C.Cartesian3.fromDegrees(lng, lat, heightM));
    return p ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

/* 우리가 세운 모델의 id 규칙 — 시설 id 앞에 'v3-' 를 붙여 만든다(vworldModels.ts) */
const MODEL_ID_PREFIX = 'v3-';

/** 클릭한 것이 우리 시설 모델이면 시설 id를, 아니면 null을 돌려준다.
    Cesium 표준 picking 을 쓴다 — 엔진이 감싸주는 API가 따로 없어서. */
function pickedFacilityId(picked: unknown): string | null {
  if (!picked || typeof picked !== 'object') return null;
  const p = picked as { id?: unknown; primitive?: { id?: unknown } };
  // 엔진이 create3DModel(url, point, true, options, id) 의 id를 어디에 담는지가 버전마다 달라서 둘 다 본다
  for (const cand of [p.id, p.primitive?.id]) {
    const s = typeof cand === 'string' ? cand : undefined;
    if (s?.startsWith(MODEL_ID_PREFIX)) return s.slice(MODEL_ID_PREFIX.length);
  }
  return null;
}

/** 3D 화면에서 시설 클릭을 듣는다. 정리 함수를 돌려준다. */
export function onFacilityClick(cb: (facilityId: string) => void): () => void {
  const scene = window.ws3d?.viewer?.scene;
  const C = window.Cesium;
  if (!scene?.canvas || !C?.ScreenSpaceEventHandler) return () => {};
  const handler = new C.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((e) => {
    try {
      const id = pickedFacilityId(scene.pick(e.position));
      if (id) cb(id);
    } catch {
      /* 픽 실패는 무시 — 빈 하늘을 클릭한 경우 등 */
    }
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  return () => handler.destroy();
}

/** 엔진이 이미 시작됐는지 — 브이월드는 **한 페이지에서 한 번만** 시작할 수 있다.
    두 번째 `map.start()` 는 "Cannot redefine property: viewer" 로 터진다. */
export function isMapStarted(): boolean {
  return !!window.ws3d?.viewer;
}

/** 준비된 엔진으로 지도를 띄운다. containerId 는 화면에 이미 있어야 한다.
    이미 시작돼 있으면 다시 시작하지 않고 카메라만 옮긴다(재시작이 불가능하므로). */
export function startVworldMap(containerId: string, cam: CameraSpec): VwMap | null {
  const vw = window.vw;
  if (!vw?.Map) throw new Error('브이월드 엔진이 준비되지 않았습니다');
  if (isMapStarted()) {
    lookAtPlace(cam);
    return null;
  }
  const pos = new vw.CameraPosition(
    new vw.CoordZ(cam.lng, cam.lat, cam.altitude),
    new vw.Direction(cam.headingDeg ?? 0, cam.tiltDeg, 0),
  );
  const map = new vw.Map();
  map.setOption({ mapId: containerId, initPosition: pos, logo: true, navigation: true });
  map.setMapId(containerId);
  map.setInitPosition(pos);
  map.setLogoVisible(true);
  map.setNavigationZoomVisible(true);
  map.start();
  keepEngineSized(containerId);
  return map;
}

/* ── 엔진 크기 자가복구 ──
   증상(실제 발생): 창 크기가 바뀌는 순간(개발자도구 열고 닫기, 창 최대화 등)을 엔진이 놓치면
   캔버스가 옛 크기로 굳는다 — 화면 위쪽 조각에만 지도가 그려지고 나머지는 검게 남고,
   브이월드 하단 안내줄도 화면 중간에 떠 버린다.
   대책: 컨테이너와 캔버스 크기를 지켜보다가 어긋나면 래퍼들을 100%로 펴고 resize 이벤트를
   다시 쏴서 엔진이 크기를 다시 읽게 한다. */
let sizeWatchOn = false;
function keepEngineSized(containerId: string) {
  if (sizeWatchOn) return; // 엔진은 페이지당 하나 — 감시도 하나면 된다
  const box = document.getElementById(containerId);
  if (!box) return;
  sizeWatchOn = true;

  const fix = () => {
    const canvas = box.querySelector('canvas');
    if (!canvas) return;
    const dw = Math.abs(canvas.clientWidth - box.clientWidth);
    const dh = Math.abs(canvas.clientHeight - box.clientHeight);
    if (dw <= 2 && dh <= 2) return; // 정상
    // 브이월드가 캔버스를 감싸둔 래퍼가 픽셀 크기로 굳어 있을 수 있어 컨테이너까지 전부 편다
    let el: HTMLElement | null = canvas;
    while (el && el !== box) {
      el.style.width = '100%';
      el.style.height = '100%';
      el = el.parentElement;
    }
    window.dispatchEvent(new Event('resize')); // 엔진(Cesium)이 크기를 다시 읽는 계기
  };

  new ResizeObserver(fix).observe(box);
  window.setInterval(fix, 2000); // ResizeObserver가 못 잡는 경우 대비한 뒷단속
}
