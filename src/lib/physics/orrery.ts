import type { OrbitWindow } from './orbit';

/*
  The Orrery's drawing: where a window's plane lands on a cell. The physics it draws is
  orbit.ts's WindowPerformance, the recorded window replayed from its first step.
*/

/** Where the plane lands on a canvas: the work page's fit, a margin on every side. */
export function planeFit(
  bounds: OrbitWindow['plane']['bounds'],
  width: number,
  height: number,
  margin: number,
) {
  const [u0, u1, v0, v1] = bounds;
  const scale = Math.min(
    (width - 2 * margin) / (u1 - u0 || 1),
    (height - 2 * margin) / (v1 - v0 || 1),
  );
  return {
    scale,
    x: (width - (u1 - u0) * scale) / 2 - u0 * scale,
    y: (height - (v1 - v0) * scale) / 2 - v0 * scale,
  };
}
