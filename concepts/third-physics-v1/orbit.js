// The orbit, re-performed. A faithful port of CS-Image-Generation's seeded stream
// (Sha3RandomByteStream) and Yoshida-4 integrator (src/sim.rs), kept in the same
// operation order so the result is bit-for-bit the published record. Runs in a
// browser worker or in Node; WebCrypto has no SHA3, so Keccak-f[1600] is here too.

const RC_LO = Uint32Array.from([
  0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001, 0x80008081, 0x00008009,
  0x0000008a, 0x00000088, 0x80008009, 0x8000000a, 0x8000808b, 0x0000008b, 0x00008089, 0x00008003,
  0x00008002, 0x00000080, 0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008,
]);
const RC_HI = Uint32Array.from([
  0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000,
  0x80000000, 0x80000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000,
]);
// rho offsets by lane index x + 5y
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const C = new Uint32Array(10);
const B = new Uint32Array(50);

function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) {
      C[2 * x] = s[2 * x] ^ s[2 * x + 10] ^ s[2 * x + 20] ^ s[2 * x + 30] ^ s[2 * x + 40];
      C[2 * x + 1] = s[2 * x + 1] ^ s[2 * x + 11] ^ s[2 * x + 21] ^ s[2 * x + 31] ^ s[2 * x + 41];
    }
    for (let x = 0; x < 5; x++) {
      const x1 = (x + 1) % 5, x4 = (x + 4) % 5;
      const lo1 = C[2 * x1], hi1 = C[2 * x1 + 1];
      const dlo = C[2 * x4] ^ ((lo1 << 1) | (hi1 >>> 31));
      const dhi = C[2 * x4 + 1] ^ ((hi1 << 1) | (lo1 >>> 31));
      for (let y = 0; y < 25; y += 5) {
        s[2 * (x + y)] ^= dlo;
        s[2 * (x + y) + 1] ^= dhi;
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const i = x + 5 * y, n = ROT[i], lo = s[2 * i], hi = s[2 * i + 1];
        let rlo = lo, rhi = hi;
        if (n > 0 && n < 32) {
          rlo = (lo << n) | (hi >>> (32 - n));
          rhi = (hi << n) | (lo >>> (32 - n));
        } else if (n === 32) {
          rlo = hi;
          rhi = lo;
        } else if (n > 32) {
          const m = n - 32;
          rlo = (hi << m) | (lo >>> (32 - m));
          rhi = (lo << m) | (hi >>> (32 - m));
        }
        const j = y + 5 * ((2 * x + 3 * y) % 5);
        B[2 * j] = rlo;
        B[2 * j + 1] = rhi;
      }
    }
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        const i = x + y, i1 = ((x + 1) % 5) + y, i2 = ((x + 2) % 5) + y;
        s[2 * i] = B[2 * i] ^ (~B[2 * i1] & B[2 * i2]);
        s[2 * i + 1] = B[2 * i + 1] ^ (~B[2 * i1 + 1] & B[2 * i2 + 1]);
      }
    }
    s[0] ^= RC_LO[round];
    s[1] ^= RC_HI[round];
  }
}

export function sha3_256(message) {
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((message.length + 1) / rate) * rate);
  padded.set(message);
  padded[message.length] ^= 0x06;
  padded[padded.length - 1] ^= 0x80;
  const s = new Uint32Array(50);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let k = 0; k < rate / 4; k++) {
      const o = offset + 4 * k;
      s[k] ^= padded[o] | (padded[o + 1] << 8) | (padded[o + 2] << 16) | (padded[o + 3] << 24);
    }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let k = 0; k < 8; k++) {
    out[4 * k] = s[k] & 255;
    out[4 * k + 1] = (s[k] >>> 8) & 255;
    out[4 * k + 2] = (s[k] >>> 16) & 255;
    out[4 * k + 3] = (s[k] >>> 24) & 255;
  }
  return out;
}

// Sha3RandomByteStream: buffer = SHA3(seed); each refill hashes seed || previous buffer.
// The constructor's hasher keeps the seed absorbed, so the first refill sees it twice.
class SeedStream {
  constructor(seed) {
    this.seed = seed;
    this.first = true;
    this.buffer = sha3_256(seed);
    this.index = 0;
    this.scratch = new Uint8Array(seed.length * 2 + 32);
  }
  nextByte() {
    if (this.index >= this.buffer.length) {
      const n = this.seed.length;
      let message;
      if (this.first) {
        this.scratch.set(this.seed, 0);
        this.scratch.set(this.seed, n);
        this.scratch.set(this.buffer, 2 * n);
        message = this.scratch;
        this.first = false;
      } else {
        message = this.scratch.subarray(0, n + 32);
        message.set(this.seed, 0);
        message.set(this.buffer, n);
      }
      this.buffer = sha3_256(message);
      this.index = 0;
    }
    return this.buffer[this.index++];
  }
  // u64 (little-endian) as f64 / u64::MAX as f64; hi * 2^32 is exact, so one rounding
  // of the sum matches Rust's round-to-nearest `as f64`.
  nextF64() {
    let lo = 0, hi = 0;
    for (let i = 0; i < 4; i++) lo |= this.nextByte() << (8 * i);
    for (let i = 0; i < 4; i++) hi |= this.nextByte() << (8 * i);
    return ((hi >>> 0) * 4294967296 + (lo >>> 0)) / 18446744073709551616;
  }
}

const G = 9.8;
const MIN_MASS = 100, MAX_MASS = 300, LOCATION = 300, VELOCITY = 1;

function shiftToCom(m, p, v) {
  const mt = m[0] + m[1] + m[2];
  const rc = [0, 0, 0], vc = [0, 0, 0];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) rc[k] = rc[k] + m[i] * p[i * 3 + k];
  for (let k = 0; k < 3; k++) rc[k] = rc[k] / mt;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) vc[k] = vc[k] + m[i] * v[i * 3 + k];
  for (let k = 0; k < 3; k++) vc[k] = vc[k] / mt;
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) {
      p[i * 3 + k] = p[i * 3 + k] - rc[k];
      v[i * 3 + k] = v[i * 3 + k] - vc[k];
    }
  }
}

function energyAndMomentum(m, p, v) {
  let kin = 0, pot = 0;
  for (let i = 0; i < 3; i++) {
    const vx = v[i * 3], vy = v[i * 3 + 1], vz = v[i * 3 + 2];
    kin = kin + 0.5 * m[i] * (vx * vx + vy * vy + vz * vz);
  }
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const dx = p[i * 3] - p[j * 3], dy = p[i * 3 + 1] - p[j * 3 + 1], dz = p[i * 3 + 2] - p[j * 3 + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r > 1e-10) pot = pot + (-G * m[i] * m[j]) / r;
    }
  }
  let lx = 0, ly = 0, lz = 0;
  for (let i = 0; i < 3; i++) {
    const ax = p[i * 3], ay = p[i * 3 + 1], az = p[i * 3 + 2];
    const bx = v[i * 3], by = v[i * 3 + 1], bz = v[i * 3 + 2];
    lx = lx + m[i] * (ay * bz - az * by);
    ly = ly + m[i] * (az * bx - ax * bz);
    lz = lz + m[i] * (ax * by - ay * bx);
  }
  return { energy: kin + pot, angular: Math.sqrt(lx * lx + ly * ly + lz * lz) };
}

const W1 = 1.3512071919596578, W0 = -1.7024143839193153;
const COEFFS = [W1 / 2, W1, (W0 + W1) / 2, W0, (W0 + W1) / 2, W1, W1 / 2];

function integrator(m, P, V, dt) {
  const A = new Float64Array(9), Q = new Float64Array(9);
  const [c1, d1, c2, d2, c3, d3, c4] = COEFFS.map((c) => c * dt);
  const accel = () => {
    Q.set(P);
    for (let i = 0; i < 3; i++) {
      let ax = 0, ay = 0, az = 0;
      for (let j = 0; j < 3; j++) {
        if (i === j) continue;
        const dx = Q[i * 3] - Q[j * 3], dy = Q[i * 3 + 1] - Q[j * 3 + 1], dz = Q[i * 3 + 2] - Q[j * 3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 1e-10) {
          const s = -G * m[j], d3 = d * d * d;
          ax = ax + (s * dx) / d3;
          ay = ay + (s * dy) / d3;
          az = az + (s * dz) / d3;
        }
      }
      A[i * 3] = ax;
      A[i * 3 + 1] = ay;
      A[i * 3 + 2] = az;
    }
  };
  const drift = (h) => { for (let i = 0; i < 9; i++) P[i] = P[i] + V[i] * h; };
  const kick = (h) => { for (let i = 0; i < 9; i++) V[i] = V[i] + A[i] * h; };
  return () => {
    drift(c1); accel(); kick(d1);
    drift(c2); accel(); kick(d2);
    drift(c3); accel(); kick(d3);
    drift(c4);
  };
}

/**
 * Re-derive a work's orbit from its seed and published generation record.
 * profileDraws: stream draws the visual profile and Borda weights consume before the
 * candidates (a production port derives this from the profile code; the study takes it
 * as given and then verifies everything else).
 */
export function rederive({ seedHex, profileDraws, selectedIndex, candidates, steps, warmup, dt, stride, onProgress }) {
  const started = performance.now();
  const hex = seedHex.replace(/^0x/, '');
  const seed = new Uint8Array(hex.length / 2);
  for (let i = 0; i < seed.length; i++) seed[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  const stream = new SeedStream(seed);
  for (let i = 0; i < profileDraws; i++) stream.nextF64();

  const gate = new Float32Array(candidates * 2);
  let passed = 0, chosen = null;
  const m = new Float64Array(3), p = new Float64Array(9), v = new Float64Array(9);
  for (let c = 0; c < candidates; c++) {
    for (let b = 0; b < 3; b++) {
      m[b] = stream.nextF64() * (MAX_MASS - MIN_MASS) + MIN_MASS;
      for (let k = 0; k < 3; k++) p[b * 3 + k] = stream.nextF64() * (LOCATION - -LOCATION) + -LOCATION;
      for (let k = 0; k < 3; k++) v[b * 3 + k] = stream.nextF64() * (VELOCITY - -VELOCITY) + -VELOCITY;
    }
    shiftToCom(m, p, v);
    const { energy, angular } = energyAndMomentum(m, p, v);
    gate[c * 2] = energy;
    gate[c * 2 + 1] = angular;
    if (!(energy > 10 || angular < 10)) passed++;
    if (c === selectedIndex) chosen = { m: Float64Array.from(m), p: Float64Array.from(p), v: Float64Array.from(v) };
    if (onProgress && c % 5000 === 0) onProgress({ phase: 'candidates', done: c, total: candidates });
  }
  const derived = performance.now();

  // nft_traits::build shifts the chosen bodies again before measuring; get_positions does too.
  const mp = Float64Array.from(chosen.p), mv = Float64Array.from(chosen.v);
  shiftToCom(chosen.m, mp, mv);
  const record = energyAndMomentum(chosen.m, mp, mv);

  const P = Float64Array.from(chosen.p), V = Float64Array.from(chosen.v);
  shiftToCom(chosen.m, P, V);
  const step = integrator(chosen.m, P, V, dt);
  for (let s = 0; s < warmup; s++) {
    step();
    if (onProgress && s % 100000 === 0) onProgress({ phase: 'warmup', done: s, total: warmup });
  }
  const samples = Math.floor(steps / stride);
  const positions = new Float32Array(samples * 9);
  const separations = new Float32Array(samples * 3);
  const PAIRS = [[0, 1], [0, 2], [1, 2]];
  const best = PAIRS.map(() => ({ distance: Infinity, step: -1 }));
  for (let s = 0; s < steps; s++) {
    for (let k = 0; k < 3; k++) {
      const [a, b] = PAIRS[k];
      const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best[k].distance) best[k] = { distance: d, step: s };
      if (s % stride === 0 && s / stride < samples) separations[(s / stride) * 3 + k] = d;
    }
    if (s % stride === 0 && s / stride < samples) positions.set(P, (s / stride) * 9);
    step();
    if (onProgress && s % 100000 === 0) onProgress({ phase: 'orbit', done: s, total: steps });
  }
  let closest = null;
  PAIRS.forEach((pair, k) => {
    if (!closest || best[k].distance < closest.distance) closest = { ...best[k], pair };
  });
  return {
    masses: Array.from(chosen.m),
    energy: record.energy,
    angular: record.angular,
    closest,
    positions,
    separations,
    samples,
    gate,
    passed,
    timings: { candidates: derived - started, orbit: performance.now() - derived },
  };
}
