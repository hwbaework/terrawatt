/* 건물 세우기(BG-01 샘플) — 땅에 점을 찍어 바닥 모양을 잡고, 그 바닥에서 건물을 올린다.

   흐름:  [건물 세우기] 켬 → ① 건물 **벽면(한 변)을 따라 드래그** ② 놓고 마우스를 옆으로 벌리면 그 각도
          그대로 폭이 자라는 회전 사각형 미리보기 ③ **클릭으로 확정** → 조각이 반투명 청록 입체 박스로 선다.
          (처음엔 남북 정렬 사각형이었는데 사선으로 앉은 건물과 각도가 안 맞았다 — 2026-08-19 사용자.
           변을 먼저 긋는 방식이라 건물이 어느 각도든 맞는다)
          여러 번 반복해 조각을 이으면 ㄱ자·凸자도 감싼다 — v0.1의 "조각(rings) 여러 개 = 건물 하나" 방식.
          → 총 바닥면적(㎡, 조각 합) → 용량(면적÷12)·발전량(lib/pvPlan) → [세우기]
          → 조각들이 건물 높이로 올라오고, 그 건물에 태양광 계획(pv)이 붙는다
   ⚠️ 면적 = 조각 면적의 합 — v0.1과 같은 규칙이라 조각이 서로 겹치면 겹친 만큼 두 번 세어진다(겹치지 않게 그리는 전제).
   ⚠️ 드래그 중에는 카메라 회전·이동을 잠근다(안 잠그면 지도가 같이 움직여 사각형을 그릴 수 없다) — 놓으면 원복.
   ※ 건물 높이는 화면에서 안 다룬다(2026-08-19) — 목표는 "건물"이 아니라 그 위 태양광 정보라서.

   엔진(Cesium) 쪽에서 쓰는 것:
     · 땅 클릭 위치 = camera.getPickRay + globe.pick  (지형 표면의 위경도·고도)
     · 바닥 미리보기 = point / polyline(clampToGround) / polygon(clampToGround)
     · 건물 = polygon + extrudedHeight (바닥 고도 → 바닥 고도+높이, 콜백으로 커지는 애니메이션)
   v0.1(mapbox)의 건물 세우기와 같은 개념 — 바닥면적 계산(shoelace)은 그대로 옮겨왔다.

   ⚠️ 이 엔진은 requestRenderMode(변화 있을 때만 그림)라 값을 바꾼 뒤 requestRender 를 불러야 한다. */

import type { PvPlan, PvProject } from '../lib/pvPlan';

interface CartographicLike {
  longitude: number;
  latitude: number;
  height: number;
}
interface CesiumSketch {
  Color: { fromCssColorString(s: string): { withAlpha(a: number): unknown } };
  CallbackProperty: new (fn: () => number | boolean | unknown, isConstant: boolean) => unknown;
  Cartesian3: { fromDegrees(lng: number, lat: number, h: number): unknown; fromDegreesArray(a: number[]): unknown };
  Cartographic: { fromCartesian(c: unknown): CartographicLike };
  Math: { toDegrees(r: number): number };
  ScreenSpaceEventHandler: new (canvas: unknown) => {
    setInputAction(fn: (e: { position?: unknown; endPosition?: unknown }) => void, type: number): void;
    destroy(): void;
  };
  ScreenSpaceEventType: { LEFT_CLICK: number; LEFT_DOWN: number; LEFT_UP: number; MOUSE_MOVE: number };
  HeightReference?: { CLAMP_TO_GROUND: number };
  /** 입힌 도형을 지형뿐 아니라 3D 건물 표면에도 그리기 */
  ClassificationType?: { BOTH: number };
  PolylineDashMaterialProperty?: new (o: { color: unknown; dashLength?: number }) => unknown;
  ColorMaterialProperty?: new (color: unknown) => unknown;
}
interface ViewerSketch {
  camera?: { getPickRay(pos: unknown): unknown; pickEllipsoid?(pos: unknown): unknown };
  entities?: { add(e: unknown): unknown; remove(e: unknown): boolean };
  scene?: {
    canvas?: HTMLCanvasElement;
    requestRender?(): void;
    globe?: { pick(ray: unknown, scene: unknown): unknown; getHeight?(c: unknown): number | undefined };
    screenSpaceCameraController?: { enableInputs: boolean };
    /** 보이는 표면(3D 건물 지붕 포함)의 3D 좌표 — 깊이버퍼 기반 */
    pickPosition?(pos: unknown): unknown;
    pickPositionSupported?: boolean;
  };
}

const C = () => window.Cesium as unknown as CesiumSketch | undefined;
const V = () => window.ws3d?.viewer as unknown as ViewerSketch | undefined;
const repaint = () => V()?.scene?.requestRender?.();

/** 찍은 모서리 한 점 — 위경도 + 보이는 표면 고도(건물 지붕이면 지붕, 해발 m) + 그 아래 지형 고도 */
export interface SketchPoint {
  lng: number;
  lat: number;
  /** 마우스가 집은 표면의 고도 — 건물 위면 지붕 높이 */
  alt: number;
  /** 그 지점의 지형(맨땅) 고도 — 조각 상자의 바닥. 없으면 alt 와 같다 */
  ground: number;
}

/** 세운 건물 하나 */
export interface SketchBuilding {
  id: string;
  name: string;
  /** 바닥 조각들 — 각 조각 = 닫지 않은 사각형 모서리 4점. 여러 조각이 한 건물 */
  rings: SketchPoint[][];
  /** 첫 조각(위치 대표값 — 일사량 조회 등에 쓴다) */
  ring: SketchPoint[];
  /** 총 바닥면적 = 조각 합 (겹침은 두 번 세어짐 — v0.1 규칙) */
  areaM2: number;
  /** 3D 표시 높이 — 화면에선 안 다룬다(2026-08-19: 높이 UI 제거). 보이기용 고정값 */
  heightM: number;
  /** 이 바닥에 얹은 태양광 계획(용량·발전량) — 면적 + project 에서 계산된 값 */
  pv: PvPlan;
  /** 사업 조건 입력값(자가소비/PPA·고객사·요금·사업비) — 사업성 시뮬 폼과 같은 항목 */
  project: PvProject;
}

/** 세운 건물의 3D 높이 — 지붕이 보일 정도면 된다 */
export const BUILDING_HEIGHT_M = 12;

/* ── 상태 ── */
let handler: { destroy(): void } | null = null;
/** 지금 드래그 중인 사각형 (미리보기) */
let points: SketchPoint[] = [];
let lineEntity: unknown = null;
let fillEntity: unknown = null;
/** 놓아서 확정된 조각들 + 각 조각의 입체 박스 엔티티 */
let draftRings: SketchPoint[][] = [];
let draftEntities: unknown[] = [];
let onChangeCb: ((rings: SketchPoint[][]) => void) | null = null;

/** 세운 건물들 (조각별 엔티티 + 현재 표시 높이). 높이 콜백이 이 값을 읽는다 */
const buildings = new Map<string, { rec: SketchBuilding; entities: unknown[]; shownH: number }>();
let ticker = 0;
let seq = 0;

/* ── 면적 계산 — v0.1 ringAreaM2 그대로: 위경도→미터 근사 후 shoelace ── */
export function ringAreaM2(ring: { lng: number; lat: number }[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0].lat;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerLat = 111_320;
  const xy = ring.map((p) => [p.lng * mPerLng, p.lat * mPerLat]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** 조각 합 면적 (㎡) */
export const ringsAreaM2 = (rings: { lng: number; lat: number }[][]): number =>
  rings.reduce((s, r) => s + ringAreaM2(r), 0);

/* ── 땅 클릭 → 위경도·고도 ── */
function pickGround(pos: unknown): SketchPoint | null {
  const c = C();
  const v = V();
  if (!c || !v?.camera || !v.scene?.globe) return null;
  try {
    // 0순위: 보이는 표면(3D 건물 지붕 포함) — 기울인 시점에서 지붕을 드래그해도 광선이 건물 뒤
    //        땅바닥에 꽂히지 않게 한다("위에서 봐야만 그려진다" 문제의 원인, 2026-08-19 사용자 보고)
    if (v.scene.pickPositionSupported && v.scene.pickPosition) {
      const surf = v.scene.pickPosition(pos);
      if (surf) {
        const g = c.Cartographic.fromCartesian(surf);
        // 깊이버퍼가 이상한 값을 줄 때가 있어(하늘 등) 정상 범위만 채택
        if (Number.isFinite(g.height) && g.height > -100 && g.height < 10_000) {
          // 표면이 건물 지붕이어도 상자 바닥은 맨땅이어야 한다. 브이월드 지형은 getHeight 가 값을 안 줄 때가
          // 많아(2026-08-19 실측: 지붕 위 12m 슬래브 사진의 원인) 광선-지형 교점(건물 무시)으로 먼저 잰다.
          let ground = g.height;
          const ray = v.camera.getPickRay(pos);
          const ter = ray ? v.scene.globe.pick(ray, v.scene) : undefined;
          if (ter) {
            const tg = c.Cartographic.fromCartesian(ter);
            if (Number.isFinite(tg.height) && tg.height < ground) ground = tg.height;
          } else {
            const th = v.scene.globe.getHeight?.(g);
            if (Number.isFinite(th as number) && (th as number) < ground) ground = th as number;
          }
          return { lng: c.Math.toDegrees(g.longitude), lat: c.Math.toDegrees(g.latitude), alt: g.height, ground };
        }
      }
    }
    // 1순위: 실제 지형 표면과의 교점 (경사지에서도 정확)
    const ray = v.camera.getPickRay(pos);
    const onTerrain = ray ? v.scene.globe.pick(ray, v.scene) : undefined;
    if (onTerrain) {
      const g = c.Cartographic.fromCartesian(onTerrain);
      return { lng: c.Math.toDegrees(g.longitude), lat: c.Math.toDegrees(g.latitude), alt: g.height, ground: g.height };
    }
    // 2순위: 지형 타일이 아직 없을 때 — 매끈한 지구 타원체와의 교점 + 그 지점 지형 고도(있으면)
    //        (침수 때 배운 것: 지형이 안 그려진 순간엔 globe.pick 이 undefined 를 준다)
    const onEllipsoid = v.camera.pickEllipsoid?.(pos);
    if (!onEllipsoid) return null;
    const g = c.Cartographic.fromCartesian(onEllipsoid);
    const alt = v.scene.globe.getHeight?.(g) ?? 0;
    return { lng: c.Math.toDegrees(g.longitude), lat: c.Math.toDegrees(g.latitude), alt, ground: alt };
  } catch {
    return null;
  }
}

/* ── 미리보기(점·선·바닥면) 다시 그리기 ── */
function redrawPreview(): void {
  const c = C();
  const v = V();
  if (!c || !v?.entities) return;
  // 선·면은 통째로 다시 만든다 (점이 바뀔 때마다 — 점 수가 적어 부담 없음)
  if (lineEntity) v.entities.remove(lineEntity);
  if (fillEntity) v.entities.remove(fillEntity);
  lineEntity = null;
  fillEntity = null;

  const sky = c.Color.fromCssColorString('#38bdf8');
  const flat = points.flatMap((p) => [p.lng, p.lat]);

  if (points.length >= 2) {
    // 3점 이상이면 첫 점으로 되돌아와 닫힌 테두리
    const closed = points.length >= 3 ? [...flat, points[0].lng, points[0].lat] : flat;
    lineEntity = v.entities.add({
      polyline: {
        positions: c.Cartesian3.fromDegreesArray(closed),
        width: 3,
        clampToGround: true,
        // 지형뿐 아니라 3D 건물 지붕 위에도 입힌다 — 지붕을 그릴 때 건물에 가려 안 보이던 문제
        ...(c.ClassificationType ? { classificationType: c.ClassificationType.BOTH } : {}),
        material: c.PolylineDashMaterialProperty
          ? new c.PolylineDashMaterialProperty({ color: sky.withAlpha(0.95), dashLength: 14 })
          : sky.withAlpha(0.95),
      },
    });
  }
  if (points.length >= 3) {
    fillEntity = v.entities.add({
      polygon: {
        hierarchy: c.Cartesian3.fromDegreesArray(flat),
        material: sky.withAlpha(0.18),
        ...(c.HeightReference ? { heightReference: c.HeightReference.CLAMP_TO_GROUND } : {}),
        ...(c.ClassificationType ? { classificationType: c.ClassificationType.BOTH } : {}),
      },
    });
  }
  repaint();
}

/** 지금 스케치 중인가 — 시설 클릭 등 다른 클릭 동작이 겹치지 않게 바깥에서 확인 */
export const isSketching = () => handler != null;

/* ── 두 단계 그리기 상태 ──
   'edge'  = 변 드래그 중 (LEFT_DOWN~UP, 카메라 잠금)
   'width' = 변 확정 후 폭 벌리는 중 (마우스만 움직임, 클릭으로 확정) */
let phase: 'idle' | 'edge' | 'width' = 'idle';
let edgeA: SketchPoint | null = null;
let edgeB: SketchPoint | null = null;
/** 그리는 동안 모은 지붕 최고·지면 최저 — 두 점만 재면 경사 지붕이 상자를 뚫는다(2026-08-19 실측) */
let dragTop = 0;
let dragGround = 0;

/** 변 A→B 를 한 변으로, C 까지의 수직 거리만큼 벌린 회전 사각형 — 사선 건물에 각도가 맞는다 */
function edgeRect(a: SketchPoint, b: SketchPoint, cPt: SketchPoint): SketchPoint[] {
  const lat0 = a.lat;
  const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mLat = 111_320;
  const ax = a.lng * mLng, ay = a.lat * mLat;
  const bx = b.lng * mLng, by = b.lat * mLat;
  const cx = cPt.lng * mLng, cy = cPt.lat * mLat;
  const vx = bx - ax, vy = by - ay;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len, ny = vx / len; // 변의 수직 방향
  const w = (cx - ax) * nx + (cy - ay) * ny; // C 의 수직 성분(부호 = 벌린 쪽)
  const alt = dragTop;
  const ground = dragGround;
  const P = (x: number, y: number): SketchPoint => ({ lng: x / mLng, lat: y / mLat, alt, ground });
  return [P(ax, ay), P(bx, by), P(bx + nx * w, by + ny * w), P(ax + nx * w, ay + ny * w)];
}

/** 조각 상자의 바닥·꼭대기 — 바닥 = 지형, 꼭대기 = 집은 표면(건물 지붕).
    빈 땅(표면=지형)이면 감쌀 건물이 없으므로 기본 높이만큼 올린다 */
function pieceBaseTop(ring: SketchPoint[]): { base: number; top: number } {
  const base = Math.min(...ring.map((p) => p.ground));
  const top = Math.max(...ring.map((p) => p.alt));
  // +0.5m 여유 — 지붕 표면과 겹쳐 번쩍이거나 살짝 낮게 재인 부분이 뚫고 나오는 것 방지
  return top - base >= 3 ? { base, top: top + 0.5 } : { base, top: base + BUILDING_HEIGHT_M };
}

/** 확정된 조각 하나를 반투명 청록 입체 박스로 세운다 — v0.1 build-draft-3d(#22d3ee, 0.6)와 같은 표현 */
function addDraftEntity(ring: SketchPoint[]): void {
  const c = C();
  const v = V();
  if (!c || !v?.entities) return;
  const cyan = c.Color.fromCssColorString('#22d3ee');
  const white = c.Color.fromCssColorString('#ffffff');
  const { base, top } = pieceBaseTop(ring);
  draftEntities.push(
    v.entities.add({
      polygon: {
        hierarchy: c.Cartesian3.fromDegreesArray(ring.flatMap((p) => [p.lng, p.lat])),
        height: base,
        extrudedHeight: top,
        material: cyan.withAlpha(0.5),
        outline: true,
        outlineColor: white.withAlpha(0.9),
      },
    }),
  );
  repaint();
}

/** 스케치 모드 시작 — 변 드래그→폭 벌려 클릭 으로 회전 사각형 조각이 쌓이고(입체 박스), onChange 로 조각들을 알려준다 */
export function startSketch(onChange: (rings: SketchPoint[][]) => void): boolean {
  const c = C();
  const v = V();
  if (!c || !v?.scene?.canvas || handler) return false;
  onChangeCb = onChange;
  const h = new c.ScreenSpaceEventHandler(v.scene.canvas);

  h.setInputAction((e) => {
    // 폭 벌리는 중 클릭 = 조각 확정
    if (phase === 'width') {
      if (ringAreaM2(points) >= 1) {
        draftRings = [...draftRings, points];
        addDraftEntity(points);
      }
      phase = 'idle';
      edgeA = edgeB = null;
      points = [];
      redrawPreview();
      onChangeCb?.(draftRings);
      return;
    }
    // 새 조각: 변 드래그 시작
    const p = pickGround(e.position);
    if (!p) return;
    phase = 'edge';
    edgeA = p;
    edgeB = null;
    dragTop = p.alt;
    dragGround = p.ground;
    // 드래그가 지도를 끌지 않도록 카메라 입력을 잠근다
    if (v.scene?.screenSpaceCameraController) v.scene.screenSpaceCameraController.enableInputs = false;
    points = [];
    redrawPreview();
  }, c.ScreenSpaceEventType.LEFT_DOWN);

  h.setInputAction((e) => {
    if (phase === 'idle' || !edgeA) return;
    const p = pickGround(e.endPosition);
    if (!p) return;
    dragTop = Math.max(dragTop, p.alt);
    dragGround = Math.min(dragGround, p.ground);
    if (phase === 'edge') {
      // 변 미리보기 — 점선 하나
      edgeB = p;
      points = [
        { ...edgeA, alt: dragTop, ground: dragGround },
        { ...p, alt: dragTop, ground: dragGround },
      ];
    } else if (phase === 'width' && edgeB) {
      points = edgeRect(edgeA, edgeB, p);
    }
    redrawPreview();
  }, c.ScreenSpaceEventType.MOUSE_MOVE);

  h.setInputAction(() => {
    if (phase !== 'edge') return;
    if (v.scene?.screenSpaceCameraController) v.scene.screenSpaceCameraController.enableInputs = true;
    // 변이 너무 짧으면(살짝 클릭) 취소, 아니면 폭 벌리기 단계로
    const lenM =
      edgeA && edgeB
        ? Math.hypot(
            (edgeB.lng - edgeA.lng) * 111_320 * Math.cos((edgeA.lat * Math.PI) / 180),
            (edgeB.lat - edgeA.lat) * 111_320,
          )
        : 0;
    if (lenM < 1) {
      phase = 'idle';
      edgeA = edgeB = null;
      points = [];
      redrawPreview();
      return;
    }
    phase = 'width';
  }, c.ScreenSpaceEventType.LEFT_UP);

  handler = h;
  v.scene.canvas.style.cursor = 'crosshair';
  return true;
}

/** 그린 조각 전부 지우기 (모드는 유지) */
export function clearSketch(): void {
  const v = V();
  if (v?.entities) {
    for (const e of draftEntities) v.entities.remove(e);
    if (lineEntity) v.entities.remove(lineEntity);
    if (fillEntity) v.entities.remove(fillEntity);
  }
  draftEntities = [];
  draftRings = [];
  lineEntity = null;
  fillEntity = null;
  points = [];
  repaint();
  onChangeCb?.(draftRings);
}

/** 스케치 모드 끝 — 그리다 만 바닥은 지운다. 세운 건물은 남는다 */
export function stopSketch(): void {
  clearSketch();
  handler?.destroy();
  handler = null;
  onChangeCb = null;
  phase = 'idle';
  edgeA = edgeB = null;
  const v = V();
  if (v?.scene?.screenSpaceCameraController) v.scene.screenSpaceCameraController.enableInputs = true;
  if (v?.scene?.canvas) v.scene.canvas.style.cursor = '';
}

/* ── 건물 올리기 ── */

/* 올라가는 애니메이션 동안만 계속 다시 그린다 */
function ensureTicker(): void {
  if (!ticker) ticker = window.setInterval(repaint, 33);
}
let risingUntil = 0;
function stopTickerIfIdle(): void {
  if (Date.now() >= risingUntil && ticker) {
    window.clearInterval(ticker);
    ticker = 0;
  }
}

/** 그린 조각들로 건물 하나를 세운다. 조각이 없으면 null.
    조각마다 바닥 고도 = 그 조각 지면 고도의 최솟값(지붕에서 그렸으면 지붕 높이).
    pv/project = 이 바닥에 얹을 태양광 계획·사업 조건(화면에서 면적·모듈로 계산해 넘긴다) */
export function raiseBuilding(
  pv: PvPlan,
  project: PvProject,
  heightM: number = BUILDING_HEIGHT_M,
): SketchBuilding | null {
  const c = C();
  const v = V();
  if (!c || !v?.entities || draftRings.length === 0) return null;

  const rings = draftRings.map((r) => r.slice());
  const id = `bld-${++seq}`;
  const tallest = Math.max(...rings.map((r) => { const bt = pieceBaseTop(r); return bt.top - bt.base; }));
  const rec: SketchBuilding = {
    id,
    name: `건물 ${seq}`,
    rings,
    ring: rings[0],
    areaM2: ringsAreaM2(rings),
    heightM: Number.isFinite(tallest) && tallest > 0 ? tallest : heightM,
    pv,
    project,
  };
  const slot = { rec, entities: [] as unknown[], shownH: 0 };

  const sky = c.Color.fromCssColorString('#38bdf8');
  const white = c.Color.fromCssColorString('#ffffff');
  const startedAt = Date.now();
  const RISE_MS = 900;
  risingUntil = startedAt + RISE_MS + 100;

  for (const ring of rings) {
    // 조각마다 자기 건물 높이(땅~지붕)로 올라온다 — 높이는 드래그한 자리의 실제 건물에서 온다
    const { base, top } = pieceBaseTop(ring);
    const pieceH = top - base;
    slot.entities.push(
      v.entities.add({
        polygon: {
          hierarchy: c.Cartesian3.fromDegreesArray(ring.flatMap((p) => [p.lng, p.lat])),
          height: base,
          // 0 → 목표 높이로 부드럽게(ease-out). 조각들이 같은 시계로 함께 올라온다
          extrudedHeight: new c.CallbackProperty(() => {
            const t = Math.min(1, (Date.now() - startedAt) / RISE_MS);
            const eased = 1 - (1 - t) * (1 - t);
            slot.shownH = pieceH * eased;
            if (t >= 1) stopTickerIfIdle();
            return base + pieceH * eased;
          }, false),
          material: sky.withAlpha(0.55),
          outline: true,
          outlineColor: white.withAlpha(0.9),
        },
      }),
    );
  }
  buildings.set(id, slot);

  // 스케치 조각·미리보기는 걷고(건물이 그 자리를 대신함) 다음 건물을 그릴 수 있게 비운다
  clearSketch();
  ensureTicker();
  repaint();
  return rec;
}

/** 세운 건물 높이 바꾸기 (즉시 반영) */
export function setBuildingHeight(id: string, heightM: number): void {
  const b = buildings.get(id);
  if (!b) return;
  b.rec.heightM = heightM;
  ensureTicker(); // 콜백이 새 값을 읽도록 잠깐 다시 그린다
  repaint();
}

/** 세운 건물의 태양광 계획·사업 조건 바꾸기 (모듈 교체·폼 입력 — 3D 모양은 그대로) */
export function setBuildingPlan(id: string, pv: PvPlan, project: PvProject): void {
  const b = buildings.get(id);
  if (!b) return;
  b.rec.pv = pv;
  b.rec.project = project;
}

/** 건물 하나 (표시용 복사본) */
export function getBuilding(id: string): SketchBuilding | undefined {
  const b = buildings.get(id);
  return b ? { ...b.rec } : undefined;
}

/** 세운 건물 하나 삭제 */
export function removeBuilding(id: string): void {
  const b = buildings.get(id);
  const v = V();
  if (!b) return;
  if (v?.entities) for (const e of b.entities) v.entities.remove(e);
  buildings.delete(id);
  repaint();
}

/** 세운 건물 목록 (표시용 복사본) */
export function listBuildings(): SketchBuilding[] {
  return [...buildings.values()].map((b) => ({ ...b.rec }));
}
