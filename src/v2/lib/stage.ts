/* 줌 레벨 → 단계 매핑 (사용자 확정)
   1단계 = 나라 (한국 전체) — 넓게 보는 뷰
   2단계 = 건물이 보일 만큼 들어간 레벨 (v0.1에서 발전소 클릭하면 날아가던 3D 뷰)
           ※ 중간 줌의 시/구 단계가 아니라, 건물·설비가 보이는 깊은 줌
   3단계(건물 내부)는 줌이 아니라 건물 클릭 → 별도 화면(유니티/Infinitown) 예정 */

export type Stage = 1 | 2;

/* 건물이 또렷이 보이기 시작하는 줌(≈14)부터 2단계 */
export function stageFromZoom(z: number): Stage {
  return z < 14 ? 1 : 2;
}

export const STAGE_LABEL: Record<Stage, string> = {
  1: '나라',
  2: '건물',
};
