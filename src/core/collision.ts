import { AABB, FighterState, STAGE_HALF_WIDTH } from './types';

export function aabbIntersects(a: AABB | null, b: AABB | null): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w &&
    Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function resolvePushboxes(
  p1: FighterState,
  p2: FighterState,
  stageHalfWidth = STAGE_HALF_WIDTH
): void {
  // Permitir cross-ups al saltar claramente por encima del rival o al rodar (ROLL)
  if (p1.moveId === 'ROLL' || p2.moveId === 'ROLL') {
    return;
  }
  if (Math.abs(p1.y - p2.y) > 0.72 && (p1.y > 0.72 || p2.y > 0.72)) {
    return;
  }
  if (!aabbIntersects(p1.pushbox, p2.pushbox)) return;

  const overlapX = (p1.pushbox.w + p2.pushbox.w) * 0.5 - Math.abs(p1.x - p2.x);
  if (overlapX <= 0) return;

  const dir = p1.x === p2.x ? (p1.facing === 1 ? -1 : 1) : p1.x < p2.x ? -1 : 1;
  const half = overlapX * 0.5;
  p1.x = clamp(p1.x + dir * half, -stageHalfWidth, stageHalfWidth);
  p2.x = clamp(p2.x - dir * half, -stageHalfWidth, stageHalfWidth);
}
