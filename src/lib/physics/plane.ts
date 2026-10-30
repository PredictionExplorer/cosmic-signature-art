/**
 * The plane of an orbit's greatest extent: the two leading eigenvectors of the covariance of
 * every sampled position, found by Jacobi rotations. The drawing is the orbit seen square-on
 * to that plane, which is a choice of view, not of data; the samples are untouched.
 */
type Vector = [number, number, number];

function leadingAxes(covariance: number[][]): [Vector, Vector] {
  const a = covariance.map((row) => row.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 64; sweep++) {
    if (Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]) < 1e-12) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const kp = a[k][p];
        const kq = a[k][q];
        a[k][p] = c * kp - s * kq;
        a[k][q] = s * kp + c * kq;
      }
      for (let k = 0; k < 3; k++) {
        const pk = a[p][k];
        const qk = a[q][k];
        a[p][k] = c * pk - s * qk;
        a[q][k] = s * pk + c * qk;
      }
      for (let k = 0; k < 3; k++) {
        const kp = v[k][p];
        const kq = v[k][q];
        v[k][p] = c * kp - s * kq;
        v[k][q] = s * kp + c * kq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  const axis = (i: number): Vector => [v[0][i], v[1][i], v[2][i]];
  return [axis(order[0]), axis(order[1])];
}

export interface Plane {
  /** Coordinates along the first and second axes, three bodies per sample. */
  u: Float32Array;
  v: Float32Array;
  bounds: { u0: number; u1: number; v0: number; v1: number };
}

/** Project `count` samples of three bodies (x, y, z each) onto their plane of greatest extent. */
export function principalPlane(positions: Float32Array, count: number): Plane {
  const mean = [0, 0, 0];
  for (let i = 0; i < count * 3; i++) for (let k = 0; k < 3; k++) mean[k] += positions[i * 3 + k];
  for (let k = 0; k < 3; k++) mean[k] /= count * 3;
  const covariance = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < count * 3; i++) {
    const d = [0, 1, 2].map((k) => positions[i * 3 + k] - mean[k]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) covariance[r][c] += d[r] * d[c];
  }
  const [e1, e2] = leadingAxes(covariance);
  const u = new Float32Array(count * 3);
  const v = new Float32Array(count * 3);
  const bounds = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
  for (let i = 0; i < count * 3; i++) {
    const dx = positions[i * 3] - mean[0];
    const dy = positions[i * 3 + 1] - mean[1];
    const dz = positions[i * 3 + 2] - mean[2];
    u[i] = dx * e1[0] + dy * e1[1] + dz * e1[2];
    v[i] = dx * e2[0] + dy * e2[1] + dz * e2[2];
    bounds.u0 = Math.min(bounds.u0, u[i]);
    bounds.u1 = Math.max(bounds.u1, u[i]);
    bounds.v0 = Math.min(bounds.v0, v[i]);
    bounds.v1 = Math.max(bounds.v1, v[i]);
  }
  return { u, v, bounds };
}
