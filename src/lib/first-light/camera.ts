/*
  First Light's camera (docs/first-light.md §4).

  The generator draws its turned view flat, without perspective. The camera starts there and
  ends there; in between it travels around the event in depth.

  It leaves and returns with a dolly zoom. The lens widens as the camera moves in, so the plane
  through the plate's centre keeps the scale the still has on the stage, while everything nearer
  or farther than that plane separates in depth. Narrow the lens back to nothing and the depth
  flattens into the picture again, at exactly the still's scale.

  A point is placed as the shader places it. With q the point in the camera's axes, the device
  coordinates are q.xy / (half extent × (1 − q.z / distance)). The distance is the half height
  over the lens's tangent. A flat lens is an infinite distance, which is this very formula with
  the division by one: there are no huge numbers to lose precision in.
*/

/** Where the camera stands and how it looks. */
export interface Shot {
  /** About the plate's vertical axis, in radians; positive brings its right edge toward the eye. */
  yaw: number;
  /** About its horizontal axis, in radians; positive brings its top edge toward the eye. */
  pitch: number;
  /** The tangent of half the vertical field of view; 0 is the generator's flat view. */
  lens: number;
  /** The plate's scale on the stage, as a multiple of the still's own (1). */
  zoom: number;
  /** How much of the generator's camera drift the points carry: 1 on the plate, 0 in the event. */
  drift: number;
  /**
   * What the camera turns about: 0 is the plate's centre, 1 the event's own. Without its drift
   * the event need not sit in the middle of the plate, so the camera finds its middle in depth.
   */
  focus: number;
}

/** The generator's own view: flat, unturned, at the still's scale, with its drift. */
export const FLAT: Shot = { yaw: 0, pitch: 0, lens: 0, zoom: 1, drift: 1, focus: 0 };

export interface Size {
  width: number;
  height: number;
}

/** The still's scale on the stage: contained and centred, as its `<img>` is drawn. */
export function stillScale(stage: Size, plate: Size): number {
  return Math.min(stage.width / plate.width, stage.height / plate.height);
}

/** A shot resolved for a stage: what the shader needs. */
export interface Lens {
  /** Row-major: plate space (x across, y down, z away) into the camera's (x right, y up, z out). */
  rotation: Float32Array;
  /** One over the half width and half height of the centre plane on the stage, in plate pixels. */
  invHalf: [number, number];
  /** One over the camera's distance from the plate's centre, in plate pixels: 0 when flat. */
  inverseDistance: number;
  /** Device pixels across one plate pixel at the centre plane. */
  pixelScale: number;
  /** The plate-space point the camera turns about and centres on the stage. */
  focus: [number, number, number];
}

/**
 * The shot on this stage. The lens is narrowed as far as it must be so that nothing within
 * `radius` of the centre comes nearer than `nearest` of the camera's distance: a point never
 * passes behind the eye or swells without bound.
 */
export function lensFor(
  shot: Shot,
  stage: Size,
  plate: Size,
  radius = 0,
  nearest = 0.35,
  centre: readonly [number, number, number] = [0, 0, 0],
): Lens {
  const scale = stillScale(stage, plate) * shot.zoom;
  const halfWidth = stage.width / 2 / scale;
  const halfHeight = stage.height / 2 / scale;
  // 1 − z / distance ≥ nearest for every z up to the radius.
  const widest = radius > 0 ? ((1 - nearest) * halfHeight) / radius : Infinity;
  const lens = Math.max(0, Math.min(shot.lens, widest));
  const [cy, sy] = [Math.cos(shot.yaw), Math.sin(shot.yaw)];
  const [cp, sp] = [Math.cos(shot.pitch), Math.sin(shot.pitch)];
  // Turn about the plate's vertical (y) by the yaw, then about its horizontal (x) by the pitch,
  // then into the camera's axes, whose y is up and whose z comes out toward the eye:
  //   yaw:   x₁ = x cos + z sin,    z₁ = −x sin + z cos
  //   pitch: y₂ = y cos − z₁ sin,   z₂ = y sin + z₁ cos
  //   eye:   q = (x₁, −y₂, −z₂)
  // prettier-ignore
  const rotation = new Float32Array([
    cy,       0,   sy,
    -sy * sp, -cp, cy * sp,
    sy * cp,  -sp, -cy * cp,
  ]);
  return {
    rotation,
    invHalf: [1 / halfWidth, 1 / halfHeight],
    inverseDistance: lens / halfHeight,
    pixelScale: scale,
    focus: [centre[0] * shot.focus, centre[1] * shot.focus, centre[2] * shot.focus],
  };
}

/** A plate-space point on the stage, in device coordinates (y up), and its swelling with nearness. */
export function toDevice(lens: Lens, px: number, py: number, pz: number): [number, number, number] {
  const r = lens.rotation;
  const [x, y, z] = [px - lens.focus[0], py - lens.focus[1], pz - lens.focus[2]];
  const qx = r[0] * x + r[1] * y + r[2] * z;
  const qy = r[3] * x + r[4] * y + r[5] * z;
  const qz = r[6] * x + r[7] * y + r[8] * z;
  const w = 1 - qz * lens.inverseDistance;
  return [(qx * lens.invHalf[0]) / w, (qy * lens.invHalf[1]) / w, 1 / w];
}

/** A plate-space point on the stage in CSS pixels from its top left, as the still's pixels lie. */
export function toStage(
  lens: Lens,
  stage: Size,
  x: number,
  y: number,
  z: number,
): [number, number] {
  const [dx, dy] = toDevice(lens, x, y, z);
  return [((dx + 1) / 2) * stage.width, ((1 - dy) / 2) * stage.height];
}

/** Ease in and out: no jolt as a move begins or ends. */
export function smooth(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** Between two shots, `t` of the way. */
export function between(from: Shot, to: Shot, t: number): Shot {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    yaw: mix(from.yaw, to.yaw),
    pitch: mix(from.pitch, to.pitch),
    lens: mix(from.lens, to.lens),
    zoom: mix(from.zoom, to.zoom),
    drift: mix(from.drift, to.drift),
    focus: mix(from.focus, to.focus),
  };
}
