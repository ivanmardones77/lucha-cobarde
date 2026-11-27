import { AABB, FighterState } from './types';

export function aabbIntersects(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w &&
    Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

export function resolvePushboxes(
  p1: FighterState,
  p2: FighterState,
  stageHalfWidth: number
): void {
  if (!aabbIntersects(p1.pushbox, p2.pushbox)) return;

  const overlapX = (p1.pushbox.w + p2.pushbox.w) * 0.5 - Math.abs(p1.x - p2.x);
  if (overlapX <= 0) return;

  const dir = p1.x <= p2.x ? -1 : 1;
  const half = overlapX * 0.5;

  p1.x = clamp(p1.x + dir * half, -stageHalfWidth, stageHalfWidth);
  p2.x = clamp(p2.x - dir * half, -stageHalfWidth, stageHalfWidth);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
