/**
 * The orbit beneath every work, re-derived from its seed exactly as the generator derived it.
 *
 * A line-for-line port of CS-Image-Generation: the seeded stream (Sha3RandomByteStream and its
 * forks), the profile and Borda draws that precede the candidates (visual_profile.rs, main.rs),
 * random_body, shift_bodies_to_com and the fourth-order Yoshida step (sim.rs), and the trait
 * analyses the published record carries (traits_analysis.rs): the closest approach, the
 * syzygies and the braid word. Every operation keeps the generator's order, and only + − × ÷
 * and √ are used, which IEEE 754 and ECMAScript define exactly, so the result is the published
 * record to the last bit in every engine. The file imports nothing, so the build scripts (with
 * Node's type stripping), the tests and the browser worker all run this same code.
 */

// ───────────────────────── SHA3-256 (FIPS 202), for the seeded stream ─────────────────────────

const RATE = 136;
const ROUND_LO = Int32Array.from([
  0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001, 0x80008081, 0x00008009,
  0x0000008a, 0x00000088, 0x80008009, 0x8000000a, 0x8000808b, 0x0000008b, 0x00008089, 0x00008003,
  0x00008002, 0x00000080, 0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008,
]);
const ROUND_HI = Int32Array.from([
  0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000,
  0x80000000, 0x80000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000,
]);
/**
 * Keccak-f[1600] over 25 lanes held as (lo, hi) 32-bit words, every step unrolled so the lanes
 * stay in registers: theta folded into the rho-pi load, then chi and iota. Generated once from
 * the FIPS 202 rotation table; checked against Node's sha3-256 in orbit.test.ts.
 */
function permute(s: Int32Array) {
  let s0 = s[0],
    s1 = s[1],
    s2 = s[2],
    s3 = s[3],
    s4 = s[4],
    s5 = s[5],
    s6 = s[6],
    s7 = s[7],
    s8 = s[8],
    s9 = s[9],
    s10 = s[10],
    s11 = s[11],
    s12 = s[12],
    s13 = s[13],
    s14 = s[14],
    s15 = s[15],
    s16 = s[16],
    s17 = s[17],
    s18 = s[18],
    s19 = s[19],
    s20 = s[20],
    s21 = s[21],
    s22 = s[22],
    s23 = s[23],
    s24 = s[24],
    s25 = s[25],
    s26 = s[26],
    s27 = s[27],
    s28 = s[28],
    s29 = s[29],
    s30 = s[30],
    s31 = s[31],
    s32 = s[32],
    s33 = s[33],
    s34 = s[34],
    s35 = s[35],
    s36 = s[36],
    s37 = s[37],
    s38 = s[38],
    s39 = s[39],
    s40 = s[40],
    s41 = s[41],
    s42 = s[42],
    s43 = s[43],
    s44 = s[44],
    s45 = s[45],
    s46 = s[46],
    s47 = s[47],
    s48 = s[48],
    s49 = s[49];
  for (let round = 0; round < 24; round++) {
    const c0 = s0 ^ s10 ^ s20 ^ s30 ^ s40;
    const c1 = s1 ^ s11 ^ s21 ^ s31 ^ s41;
    const c2 = s2 ^ s12 ^ s22 ^ s32 ^ s42;
    const c3 = s3 ^ s13 ^ s23 ^ s33 ^ s43;
    const c4 = s4 ^ s14 ^ s24 ^ s34 ^ s44;
    const c5 = s5 ^ s15 ^ s25 ^ s35 ^ s45;
    const c6 = s6 ^ s16 ^ s26 ^ s36 ^ s46;
    const c7 = s7 ^ s17 ^ s27 ^ s37 ^ s47;
    const c8 = s8 ^ s18 ^ s28 ^ s38 ^ s48;
    const c9 = s9 ^ s19 ^ s29 ^ s39 ^ s49;
    const d0 = c8 ^ ((c2 << 1) | (c3 >>> 31));
    const d1 = c9 ^ ((c3 << 1) | (c2 >>> 31));
    const d2 = c0 ^ ((c4 << 1) | (c5 >>> 31));
    const d3 = c1 ^ ((c5 << 1) | (c4 >>> 31));
    const d4 = c2 ^ ((c6 << 1) | (c7 >>> 31));
    const d5 = c3 ^ ((c7 << 1) | (c6 >>> 31));
    const d6 = c4 ^ ((c8 << 1) | (c9 >>> 31));
    const d7 = c5 ^ ((c9 << 1) | (c8 >>> 31));
    const d8 = c6 ^ ((c0 << 1) | (c1 >>> 31));
    const d9 = c7 ^ ((c1 << 1) | (c0 >>> 31));
    const b0 = s0 ^ d0;
    const b1 = s1 ^ d1;
    const t5l = s10 ^ d0;
    const t5h = s11 ^ d1;
    const b32 = (t5h << 4) | (t5l >>> 28);
    const b33 = (t5l << 4) | (t5h >>> 28);
    const t10l = s20 ^ d0;
    const t10h = s21 ^ d1;
    const b14 = (t10l << 3) | (t10h >>> 29);
    const b15 = (t10h << 3) | (t10l >>> 29);
    const t15l = s30 ^ d0;
    const t15h = s31 ^ d1;
    const b46 = (t15h << 9) | (t15l >>> 23);
    const b47 = (t15l << 9) | (t15h >>> 23);
    const t20l = s40 ^ d0;
    const t20h = s41 ^ d1;
    const b28 = (t20l << 18) | (t20h >>> 14);
    const b29 = (t20h << 18) | (t20l >>> 14);
    const t1l = s2 ^ d2;
    const t1h = s3 ^ d3;
    const b20 = (t1l << 1) | (t1h >>> 31);
    const b21 = (t1h << 1) | (t1l >>> 31);
    const t6l = s12 ^ d2;
    const t6h = s13 ^ d3;
    const b2 = (t6h << 12) | (t6l >>> 20);
    const b3 = (t6l << 12) | (t6h >>> 20);
    const t11l = s22 ^ d2;
    const t11h = s23 ^ d3;
    const b34 = (t11l << 10) | (t11h >>> 22);
    const b35 = (t11h << 10) | (t11l >>> 22);
    const t16l = s32 ^ d2;
    const t16h = s33 ^ d3;
    const b16 = (t16h << 13) | (t16l >>> 19);
    const b17 = (t16l << 13) | (t16h >>> 19);
    const t21l = s42 ^ d2;
    const t21h = s43 ^ d3;
    const b48 = (t21l << 2) | (t21h >>> 30);
    const b49 = (t21h << 2) | (t21l >>> 30);
    const t2l = s4 ^ d4;
    const t2h = s5 ^ d5;
    const b40 = (t2h << 30) | (t2l >>> 2);
    const b41 = (t2l << 30) | (t2h >>> 2);
    const t7l = s14 ^ d4;
    const t7h = s15 ^ d5;
    const b22 = (t7l << 6) | (t7h >>> 26);
    const b23 = (t7h << 6) | (t7l >>> 26);
    const t12l = s24 ^ d4;
    const t12h = s25 ^ d5;
    const b4 = (t12h << 11) | (t12l >>> 21);
    const b5 = (t12l << 11) | (t12h >>> 21);
    const t17l = s34 ^ d4;
    const t17h = s35 ^ d5;
    const b36 = (t17l << 15) | (t17h >>> 17);
    const b37 = (t17h << 15) | (t17l >>> 17);
    const t22l = s44 ^ d4;
    const t22h = s45 ^ d5;
    const b18 = (t22h << 29) | (t22l >>> 3);
    const b19 = (t22l << 29) | (t22h >>> 3);
    const t3l = s6 ^ d6;
    const t3h = s7 ^ d7;
    const b10 = (t3l << 28) | (t3h >>> 4);
    const b11 = (t3h << 28) | (t3l >>> 4);
    const t8l = s16 ^ d6;
    const t8h = s17 ^ d7;
    const b42 = (t8h << 23) | (t8l >>> 9);
    const b43 = (t8l << 23) | (t8h >>> 9);
    const t13l = s26 ^ d6;
    const t13h = s27 ^ d7;
    const b24 = (t13l << 25) | (t13h >>> 7);
    const b25 = (t13h << 25) | (t13l >>> 7);
    const t18l = s36 ^ d6;
    const t18h = s37 ^ d7;
    const b6 = (t18l << 21) | (t18h >>> 11);
    const b7 = (t18h << 21) | (t18l >>> 11);
    const t23l = s46 ^ d6;
    const t23h = s47 ^ d7;
    const b38 = (t23h << 24) | (t23l >>> 8);
    const b39 = (t23l << 24) | (t23h >>> 8);
    const t4l = s8 ^ d8;
    const t4h = s9 ^ d9;
    const b30 = (t4l << 27) | (t4h >>> 5);
    const b31 = (t4h << 27) | (t4l >>> 5);
    const t9l = s18 ^ d8;
    const t9h = s19 ^ d9;
    const b12 = (t9l << 20) | (t9h >>> 12);
    const b13 = (t9h << 20) | (t9l >>> 12);
    const t14l = s28 ^ d8;
    const t14h = s29 ^ d9;
    const b44 = (t14h << 7) | (t14l >>> 25);
    const b45 = (t14l << 7) | (t14h >>> 25);
    const t19l = s38 ^ d8;
    const t19h = s39 ^ d9;
    const b26 = (t19l << 8) | (t19h >>> 24);
    const b27 = (t19h << 8) | (t19l >>> 24);
    const t24l = s48 ^ d8;
    const t24h = s49 ^ d9;
    const b8 = (t24l << 14) | (t24h >>> 18);
    const b9 = (t24h << 14) | (t24l >>> 18);
    s0 = b0 ^ (~b2 & b4);
    s1 = b1 ^ (~b3 & b5);
    s2 = b2 ^ (~b4 & b6);
    s3 = b3 ^ (~b5 & b7);
    s4 = b4 ^ (~b6 & b8);
    s5 = b5 ^ (~b7 & b9);
    s6 = b6 ^ (~b8 & b0);
    s7 = b7 ^ (~b9 & b1);
    s8 = b8 ^ (~b0 & b2);
    s9 = b9 ^ (~b1 & b3);
    s10 = b10 ^ (~b12 & b14);
    s11 = b11 ^ (~b13 & b15);
    s12 = b12 ^ (~b14 & b16);
    s13 = b13 ^ (~b15 & b17);
    s14 = b14 ^ (~b16 & b18);
    s15 = b15 ^ (~b17 & b19);
    s16 = b16 ^ (~b18 & b10);
    s17 = b17 ^ (~b19 & b11);
    s18 = b18 ^ (~b10 & b12);
    s19 = b19 ^ (~b11 & b13);
    s20 = b20 ^ (~b22 & b24);
    s21 = b21 ^ (~b23 & b25);
    s22 = b22 ^ (~b24 & b26);
    s23 = b23 ^ (~b25 & b27);
    s24 = b24 ^ (~b26 & b28);
    s25 = b25 ^ (~b27 & b29);
    s26 = b26 ^ (~b28 & b20);
    s27 = b27 ^ (~b29 & b21);
    s28 = b28 ^ (~b20 & b22);
    s29 = b29 ^ (~b21 & b23);
    s30 = b30 ^ (~b32 & b34);
    s31 = b31 ^ (~b33 & b35);
    s32 = b32 ^ (~b34 & b36);
    s33 = b33 ^ (~b35 & b37);
    s34 = b34 ^ (~b36 & b38);
    s35 = b35 ^ (~b37 & b39);
    s36 = b36 ^ (~b38 & b30);
    s37 = b37 ^ (~b39 & b31);
    s38 = b38 ^ (~b30 & b32);
    s39 = b39 ^ (~b31 & b33);
    s40 = b40 ^ (~b42 & b44);
    s41 = b41 ^ (~b43 & b45);
    s42 = b42 ^ (~b44 & b46);
    s43 = b43 ^ (~b45 & b47);
    s44 = b44 ^ (~b46 & b48);
    s45 = b45 ^ (~b47 & b49);
    s46 = b46 ^ (~b48 & b40);
    s47 = b47 ^ (~b49 & b41);
    s48 = b48 ^ (~b40 & b42);
    s49 = b49 ^ (~b41 & b43);
    s0 ^= ROUND_LO[round];
    s1 ^= ROUND_HI[round];
  }
  s[0] = s0;
  s[1] = s1;
  s[2] = s2;
  s[3] = s3;
  s[4] = s4;
  s[5] = s5;
  s[6] = s6;
  s[7] = s7;
  s[8] = s8;
  s[9] = s9;
  s[10] = s10;
  s[11] = s11;
  s[12] = s12;
  s[13] = s13;
  s[14] = s14;
  s[15] = s15;
  s[16] = s16;
  s[17] = s17;
  s[18] = s18;
  s[19] = s19;
  s[20] = s20;
  s[21] = s21;
  s[22] = s22;
  s[23] = s23;
  s[24] = s24;
  s[25] = s25;
  s[26] = s26;
  s[27] = s27;
  s[28] = s28;
  s[29] = s29;
  s[30] = s30;
  s[31] = s31;
  s[32] = s32;
  s[33] = s33;
  s[34] = s34;
  s[35] = s35;
  s[36] = s36;
  s[37] = s37;
  s[38] = s38;
  s[39] = s39;
  s[40] = s40;
  s[41] = s41;
  s[42] = s42;
  s[43] = s43;
  s[44] = s44;
  s[45] = s45;
  s[46] = s46;
  s[47] = s47;
  s[48] = s48;
  s[49] = s49;
}

const state = new Int32Array(50);

/** SHA3-256 of the concatenation of `parts`, written into `out` (32 bytes). */
export function sha3_256(parts: readonly Uint8Array[], out: Uint8Array = new Uint8Array(32)) {
  const s = state;
  s.fill(0);
  let position = 0;
  for (const part of parts) {
    for (let k = 0; k < part.length; k++) {
      s[position >> 2] ^= part[k] << ((position & 3) << 3);
      if (++position === RATE) {
        permute(s);
        position = 0;
      }
    }
  }
  s[position >> 2] ^= 0x06 << ((position & 3) << 3);
  s[(RATE - 1) >> 2] ^= 0x80 << (((RATE - 1) & 3) << 3);
  permute(s);
  for (let k = 0; k < 32; k++) out[k] = (s[k >> 2] >>> ((k & 3) << 3)) & 255;
  return out;
}

// ───────────────────────── The seeded stream ─────────────────────────

export interface SeedStream {
  nextF64(): number;
  /** An independent stream from the original seed and `domain`, as Sha3RandomByteStream::fork. */
  fork(domain: string): SeedStream;
}

/**
 * Sha3RandomByteStream: the buffer is SHA3(seed), and each refill hashes seed ‖ buffer. The
 * constructor's hasher keeps the seed absorbed, so the first refill sees the seed twice.
 */
export function seedStream(seed: Uint8Array): SeedStream {
  const buffer = sha3_256([seed]);
  let index = 0;
  let first = true;
  const next = new Uint8Array(32);
  const refill = () => {
    sha3_256(first ? [seed, seed, buffer] : [seed, buffer], next);
    buffer.set(next);
    first = false;
    index = 0;
  };
  const byte = () => {
    if (index >= 32) refill();
    return buffer[index++];
  };
  return {
    // u64 little-endian as f64 over u64::MAX as f64 (2^64); hi·2^32 is exact, so the one
    // rounding of the sum is Rust's round-to-nearest `as f64`.
    nextF64() {
      let lo: number;
      let hi: number;
      if (index <= 24) {
        const b = buffer;
        const i = index;
        lo = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
        hi = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
        index += 8;
      } else {
        lo = byte() | (byte() << 8) | (byte() << 16) | (byte() << 24);
        hi = byte() | (byte() << 8) | (byte() << 16) | (byte() << 24);
      }
      return ((hi >>> 0) * 4294967296 + (lo >>> 0)) / 18446744073709551616;
    },
    fork(domain: string) {
      const separator = new Uint8Array([0]);
      return seedStream(sha3_256([seed, separator, new TextEncoder().encode(domain)]));
    },
  };
}

export function seedBytes(seed: string): Uint8Array {
  const hex = seed.replace(/^0x/i, '');
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('A seed is an even number of hex digits');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

// ───────────────────────── The draws before the candidates ─────────────────────────

/**
 * The visual profile reads the main stream before any orbit: six base parameters, the
 * structure roll (a Duet, rolled in [0.35, 0.38), reads one more for its dropped edge) and
 * fifteen mode rolls; its extended rolls come from a fork. Randomized Borda weights then read
 * one. Returns how many draws were taken.
 */
export function drawProfileAndWeights(stream: SeedStream, weightsRandomized: boolean): number {
  let draws = 0;
  const draw = () => {
    draws++;
    return stream.nextF64();
  };
  for (let i = 0; i < 6; i++) draw();
  const structure = draw();
  if (structure >= 0.35 && structure < 0.38) draw();
  for (let i = 0; i < 15; i++) draw();
  if (weightsRandomized) draw();
  return draws;
}

// ───────────────────────── Bodies ─────────────────────────

export const G = 9.8;
const MIN_MASS = 100;
const MAX_MASS = 300;
const LOCATION = 300;
const VELOCITY = 1;
/** Mass, position and velocity for each of three bodies. */
const DRAWS_PER_CANDIDATE = 21;

/** Three bodies: masses, then positions and velocities as x, y, z per body. */
export interface Bodies {
  masses: [number, number, number];
  positions: Float64Array;
  velocities: Float64Array;
}

function randomBodies(stream: SeedStream): Bodies {
  const masses: [number, number, number] = [0, 0, 0];
  const positions = new Float64Array(9);
  const velocities = new Float64Array(9);
  for (let b = 0; b < 3; b++) {
    masses[b] = stream.nextF64() * (MAX_MASS - MIN_MASS) + MIN_MASS;
    for (let k = 0; k < 3; k++)
      positions[b * 3 + k] = stream.nextF64() * (LOCATION - -LOCATION) + -LOCATION;
    for (let k = 0; k < 3; k++)
      velocities[b * 3 + k] = stream.nextF64() * (VELOCITY - -VELOCITY) + -VELOCITY;
  }
  return { masses, positions, velocities };
}

/** shift_bodies_to_com: the centre of mass and its velocity to the origin, in place. */
export function shiftToCentreOfMass({ masses: m, positions: p, velocities: v }: Bodies) {
  const total = m[0] + m[1] + m[2];
  let rx = 0;
  let ry = 0;
  let rz = 0;
  for (let b = 0; b < 3; b++) {
    rx = rx + m[b] * p[b * 3];
    ry = ry + m[b] * p[b * 3 + 1];
    rz = rz + m[b] * p[b * 3 + 2];
  }
  rx = rx / total;
  ry = ry / total;
  rz = rz / total;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (let b = 0; b < 3; b++) {
    vx = vx + m[b] * v[b * 3];
    vy = vy + m[b] * v[b * 3 + 1];
    vz = vz + m[b] * v[b * 3 + 2];
  }
  vx = vx / total;
  vy = vy / total;
  vz = vz / total;
  for (let b = 0; b < 3; b++) {
    p[b * 3] = p[b * 3] - rx;
    p[b * 3 + 1] = p[b * 3 + 1] - ry;
    p[b * 3 + 2] = p[b * 3 + 2] - rz;
    v[b * 3] = v[b * 3] - vx;
    v[b * 3 + 1] = v[b * 3 + 1] - vy;
    v[b * 3 + 2] = v[b * 3 + 2] - vz;
  }
}

function copyBodies(bodies: Bodies): Bodies {
  return {
    masses: [...bodies.masses],
    positions: Float64Array.from(bodies.positions),
    velocities: Float64Array.from(bodies.velocities),
  };
}

/** calculate_total_energy and the magnitude of calculate_total_angular_momentum. */
export function energyAndMomentum({ masses: m, positions: p, velocities: v }: Bodies) {
  let kinetic = 0;
  let potential = 0;
  for (let b = 0; b < 3; b++) {
    const x = v[b * 3];
    const y = v[b * 3 + 1];
    const z = v[b * 3 + 2];
    kinetic = kinetic + 0.5 * m[b] * (x * x + y * y + z * z);
  }
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const dx = p[i * 3] - p[j * 3];
      const dy = p[i * 3 + 1] - p[j * 3 + 1];
      const dz = p[i * 3 + 2] - p[j * 3 + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r > 1e-10) potential = potential + (-G * m[i] * m[j]) / r;
    }
  }
  let lx = 0;
  let ly = 0;
  let lz = 0;
  for (let b = 0; b < 3; b++) {
    const ax = p[b * 3];
    const ay = p[b * 3 + 1];
    const az = p[b * 3 + 2];
    const bx = v[b * 3];
    const by = v[b * 3 + 1];
    const bz = v[b * 3 + 2];
    lx = lx + m[b] * (ay * bz - az * by);
    ly = ly + m[b] * (az * bx - ax * bz);
    lz = lz + m[b] * (ax * by - ay * bx);
  }
  return { energy: kinetic + potential, angularMomentum: Math.sqrt(lx * lx + ly * ly + lz * lz) };
}

// ───────────────────────── Generation ─────────────────────────

/** What the published record says about how the orbit was chosen. */
export interface OrbitGeneration {
  seed: string;
  /** Candidates simulated per attempt (the CLI's --sims). */
  candidatesPerAttempt: number;
  selectedIndex: number;
  /** Bounded aesthetic retries used; each retry draws from its own fork. */
  retryCount: number;
  weightsRandomized: boolean;
  dt: number;
  steps: number;
  warmupSteps: number;
  /** Published masses: identify which attempt holds the chosen candidate when retries ran. */
  masses: readonly [number, number, number];
}

export interface Progress {
  phase: 'beginnings' | 'warm-up' | 'window' | 'braid';
  done: number;
  total: number;
}

export interface Beginning {
  bodies: Bodies;
  /** Draws the profile and weights took before the candidates. */
  profileDraws: number;
  /** The aesthetic attempt the chosen candidate came from: 0 unless retries ran. */
  attempt: number;
}

/**
 * The chosen candidate's bodies, read from the stream at its own position. The candidates
 * are twenty-one draws each (mass, position, velocity per body) and are moved to their centre
 * of mass as they are generated, as select_best_trajectory_shortlist does.
 */
export function chosenBeginning(
  generation: OrbitGeneration,
  onProgress?: (progress: Progress) => void,
): Beginning {
  const main = seedStream(seedBytes(generation.seed));
  const profileDraws = drawProfileAndWeights(main, generation.weightsRandomized);
  const attempts = generation.retryCount + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let stream = main;
    if (attempt > 0) {
      stream = main.fork(`cosmic-retry/v1/${attempt}`);
      stream.nextF64(); // retry_borda_weights
    }
    // Every earlier candidate is twenty-one draws the chosen one waits behind.
    for (let candidate = 0; candidate < generation.selectedIndex; candidate++) {
      for (let draw = 0; draw < DRAWS_PER_CANDIDATE; draw++) stream.nextF64();
      if (onProgress && candidate % 2500 === 0)
        onProgress({ phase: 'beginnings', done: candidate, total: generation.selectedIndex });
    }
    const chosen = randomBodies(stream);
    shiftToCentreOfMass(chosen);
    // With one attempt the stream position alone decides; only retries need the masses to
    // say which attempt the chosen candidate came from.
    const matches = chosen.masses.every((mass, b) => Object.is(mass, generation.masses[b]));
    if (attempts === 1 || matches) return { bodies: chosen, profileDraws, attempt };
  }
  throw new Error('No attempt holds a candidate with the published masses');
}

// ───────────────────────── The integrator ─────────────────────────

const W1 = 1.3512071919596578;
const W0 = -1.7024143839193153;

/** The fourth-order Yoshida step of sim.rs, on flat position and velocity arrays. */
export function integrator(
  masses: readonly number[],
  P: Float64Array,
  V: Float64Array,
  dt: number,
) {
  const c1 = (W1 / 2) * dt;
  const c2 = ((W0 + W1) / 2) * dt;
  const d1 = W1 * dt;
  const d2 = W0 * dt;
  const s0 = -G * masses[0];
  const s1 = -G * masses[1];
  const s2 = -G * masses[2];
  const A = new Float64Array(9);
  // compute_accelerations: each body sums the pull of the others in index order. A pair's
  // separation is shared: (−d)² = d², and s·(−d) = −(s·d), both exactly.
  const accelerate = () => {
    const x01 = P[0] - P[3];
    const y01 = P[1] - P[4];
    const z01 = P[2] - P[5];
    const x02 = P[0] - P[6];
    const y02 = P[1] - P[7];
    const z02 = P[2] - P[8];
    const x12 = P[3] - P[6];
    const y12 = P[4] - P[7];
    const z12 = P[5] - P[8];
    const d01 = Math.sqrt(x01 * x01 + y01 * y01 + z01 * z01);
    const d02 = Math.sqrt(x02 * x02 + y02 * y02 + z02 * z02);
    const d12 = Math.sqrt(x12 * x12 + y12 * y12 + z12 * z12);
    const e01 = d01 * d01 * d01;
    const e02 = d02 * d02 * d02;
    const e12 = d12 * d12 * d12;
    const near01 = d01 > 1e-10;
    const near02 = d02 > 1e-10;
    const near12 = d12 > 1e-10;
    // body 0: from 1, then 2
    let ax = 0;
    let ay = 0;
    let az = 0;
    if (near01) {
      ax = ax + (s1 * x01) / e01;
      ay = ay + (s1 * y01) / e01;
      az = az + (s1 * z01) / e01;
    }
    if (near02) {
      ax = ax + (s2 * x02) / e02;
      ay = ay + (s2 * y02) / e02;
      az = az + (s2 * z02) / e02;
    }
    A[0] = ax;
    A[1] = ay;
    A[2] = az;
    // body 1: from 0, then 2
    ax = 0;
    ay = 0;
    az = 0;
    if (near01) {
      ax = ax + (s0 * -x01) / e01;
      ay = ay + (s0 * -y01) / e01;
      az = az + (s0 * -z01) / e01;
    }
    if (near12) {
      ax = ax + (s2 * x12) / e12;
      ay = ay + (s2 * y12) / e12;
      az = az + (s2 * z12) / e12;
    }
    A[3] = ax;
    A[4] = ay;
    A[5] = az;
    // body 2: from 0, then 1
    ax = 0;
    ay = 0;
    az = 0;
    if (near02) {
      ax = ax + (s0 * -x02) / e02;
      ay = ay + (s0 * -y02) / e02;
      az = az + (s0 * -z02) / e02;
    }
    if (near12) {
      ax = ax + (s1 * -x12) / e12;
      ay = ay + (s1 * -y12) / e12;
      az = az + (s1 * -z12) / e12;
    }
    A[6] = ax;
    A[7] = ay;
    A[8] = az;
  };
  const drift = (h: number) => {
    for (let i = 0; i < 9; i++) P[i] = P[i] + V[i] * h;
  };
  const kick = (h: number) => {
    for (let i = 0; i < 9; i++) V[i] = V[i] + A[i] * h;
  };
  return () => {
    drift(c1);
    accelerate();
    kick(d1);
    drift(c2);
    accelerate();
    kick(d2);
    drift(c2);
    accelerate();
    kick(d1);
    drift(c1);
  };
}

// ───────────────────────── The re-derivation ─────────────────────────

const SYZYGY_QUALITY = 0.02;
const SYZYGY_GAP = 500;
const BRAID_MERGE = 300;
const BRAID_WORD_TOKENS = 48;
const AXIS_STRIDE = 97;
const PAIRS = [
  [0, 1],
  [0, 2],
  [1, 2],
] as const;
const SQRT3 = Math.sqrt(3);

export interface ClosestApproach {
  distance: number;
  pair: [number, number];
  step: number;
}

export interface BraidCrossing {
  step: number;
  generator: number;
  positive: boolean;
}

export interface Rederivation {
  masses: [number, number, number];
  totalEnergy: number;
  angularMomentum: number;
  closestApproach: ClosestApproach;
  /** Steps of the recorded window at which the three bodies fell into a line. */
  syzygies: number[];
  braid: { word: string; crossings: number; truncated: boolean; events: BraidCrossing[] };
  profileDraws: number;
  attempt: number;
  /** Every `stride`-th step of the recorded window: x, y, z for each body, as float32. */
  samples: { stride: number; count: number; positions: Float32Array; separations: Float32Array };
  /**
   * The bodies at the first step of the recorded window, after the warm-up: x, y, z for each,
   * exactly. Integrating from here replays the recorded window step for step.
   */
  windowStart: { positions: Float64Array; velocities: Float64Array };
  milliseconds: { beginnings: number; orbit: number };
}

/** triangle_quality: 4√3·area / (a² + b² + c²), 1 for equilateral and 0 for collinear. */
function triangleQuality(P: Float64Array) {
  const abx = P[3] - P[0];
  const aby = P[4] - P[1];
  const abz = P[5] - P[2];
  const acx = P[6] - P[0];
  const acy = P[7] - P[1];
  const acz = P[8] - P[2];
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  const bcx = P[6] - P[3];
  const bcy = P[7] - P[4];
  const bcz = P[8] - P[5];
  const cax = P[0] - P[6];
  const cay = P[1] - P[7];
  const caz = P[2] - P[8];
  const sum =
    abx * abx +
    aby * aby +
    abz * abz +
    (bcx * bcx + bcy * bcy + bcz * bcz) +
    (cax * cax + cay * cay + caz * caz);
  if (sum <= 1e-24) return 0;
  return Math.min(1, Math.max(0, (4 * SQRT3 * area) / sum));
}

/** Rust's f64::signum: +0 is positive and −0 negative. */
const signum = (value: number) => (value < 0 || Object.is(value, -0) ? -1 : 1);
/** Rust's f64::total_cmp for finite values: −0 sorts before +0. */
const totalOrder = (a: number, b: number) =>
  a < b ? -1 : a > b ? 1 : Object.is(a, b) ? 0 : Object.is(a, -0) ? -1 : 1;

/**
 * Re-derive the chosen orbit and every measurement the record publishes about it. Pure and
 * synchronous: the browser runs it in a worker, the build script and the tests in Node.
 */
export function rederive(
  generation: OrbitGeneration,
  { stride = 100, onProgress }: { stride?: number; onProgress?: (progress: Progress) => void } = {},
): Rederivation {
  const started = performance.now();
  const { bodies, profileDraws, attempt } = chosenBeginning(generation, onProgress);
  const derived = performance.now();

  // nft_traits::build measures energy and momentum on the bodies moved once more to their
  // centre of mass, and get_positions moves them again before integrating.
  const measured = copyBodies(bodies);
  shiftToCentreOfMass(measured);
  const { energy, angularMomentum } = energyAndMomentum(measured);
  const moving = copyBodies(bodies);
  shiftToCentreOfMass(moving);
  const P = moving.positions;
  const V = moving.velocities;
  const step = integrator(moving.masses, P, V, generation.dt);
  for (let s = 0; s < generation.warmupSteps; s++) {
    step();
    if (onProgress && s % 100_000 === 0)
      onProgress({ phase: 'warm-up', done: s, total: generation.warmupSteps });
  }
  const windowStart = { P: Float64Array.from(P), V: Float64Array.from(V) };

  const steps = generation.steps;
  const count = Math.ceil(steps / stride);
  const positions = new Float32Array(count * 9);
  const separations = new Float32Array(count * 3);
  const best = PAIRS.map(() => ({ distance: Infinity, step: -1 }));
  const syzygies: number[] = [];
  const axisSamples = Array.from({ length: 3 }, () => [] as number[]);
  let q2 = NaN; // quality two steps back
  let q1 = NaN; // quality one step back
  let lastSyzygy = -Infinity;
  for (let s = 0; s < steps; s++) {
    // closest_approach: the first of the smallest, pair by pair
    for (let k = 0; k < 3; k++) {
      const a = PAIRS[k][0] * 3;
      const b = PAIRS[k][1] * 3;
      const dx = P[a] - P[b];
      const dy = P[a + 1] - P[b + 1];
      const dz = P[a + 2] - P[b + 2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < best[k].distance) best[k] = { distance, step: s };
      if (s % stride === 0) separations[(s / stride) * 3 + k] = distance;
    }
    // detect_syzygies: a local minimum of the triangle quality below the threshold, one per gap
    const q = triangleQuality(P);
    const middle = s - 1;
    if (
      middle >= 1 &&
      q1 < SYZYGY_QUALITY &&
      q1 <= q2 &&
      q1 <= q &&
      middle - lastSyzygy >= SYZYGY_GAP
    ) {
      syzygies.push(middle);
      lastSyzygy = middle;
    }
    q2 = q1;
    q1 = q;
    if (s % AXIS_STRIDE === 0)
      for (let b = 0; b < 3; b++) axisSamples[b].push(P[b * 3], P[b * 3 + 1]);
    if (s % stride === 0) positions.set(P, (s / stride) * 9);
    step();
    if (onProgress && s % 100_000 === 0) onProgress({ phase: 'window', done: s, total: steps });
  }
  let closest: ClosestApproach = { distance: best[0].distance, pair: [0, 1], step: best[0].step };
  for (let k = 1; k < 3; k++)
    if (best[k].distance < closest.distance)
      closest = {
        distance: best[k].distance,
        pair: [PAIRS[k][0], PAIRS[k][1]],
        step: best[k].step,
      };

  // principal_axis_xy over every 97th step, summed body by body as the generator does
  let mx = 0;
  let my = 0;
  let n = 0;
  for (const samples of axisSamples)
    for (let i = 0; i < samples.length; i += 2) {
      mx += samples[i];
      my += samples[i + 1];
      n += 1;
    }
  mx /= n;
  my /= n;
  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (const samples of axisSamples)
    for (let i = 0; i < samples.length; i += 2) {
      const dx = samples[i] - mx;
      const dy = samples[i + 1] - my;
      cxx += dx * dx;
      cxy += dx * dy;
      cyy += dy * dy;
    }
  const half = 0.5 * (cxx + cyy);
  const det = cxx * cyy - cxy * cxy;
  const lambda = half + Math.sqrt(Math.max(half * half - det, 0));
  let [vx, vy] = Math.abs(cxy) > 1e-15 ? [lambda - cyy, cxy] : [1, 0];
  const norm = Math.max(Math.sqrt(vx * vx + vy * vy), 1e-15);
  vx /= norm;
  vy /= norm;

  // compute_braid: a second pass over the same window, projected on that axis
  P.set(windowStart.P);
  V.set(windowStart.V);
  const events: BraidCrossing[] = [];
  const lastCrossing = [-Infinity, -Infinity, -Infinity];
  const previous = [0, 0, 0];
  const current = [0, 0, 0];
  for (let s = 0; s < steps; s++) {
    for (let b = 0; b < 3; b++) current[b] = P[b * 3] * vx + P[b * 3 + 1] * vy;
    if (s >= 1) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = PAIRS[k];
        const before = previous[a] - previous[b];
        const after = current[a] - current[b];
        if (signum(before) !== signum(after) && before !== 0) {
          if (s - lastCrossing[k] < BRAID_MERGE) continue;
          lastCrossing[k] = s;
          const order = [0, 1, 2].sort((l, r) => totalOrder(previous[l], previous[r]));
          const rankA = order.indexOf(a);
          const rankB = order.indexOf(b);
          if (Math.abs(rankA - rankB) !== 1) continue;
          const left = rankA < rankB ? a : b;
          const over = P[a * 3 + 2] >= P[b * 3 + 2] ? a : b;
          events.push({ step: s, generator: Math.min(rankA, rankB) + 1, positive: over === left });
        }
      }
    }
    previous[0] = current[0];
    previous[1] = current[1];
    previous[2] = current[2];
    step();
    if (onProgress && s % 100_000 === 0) onProgress({ phase: 'braid', done: s, total: steps });
  }
  const word = events
    .slice(0, BRAID_WORD_TOKENS)
    .map((event) => `s${event.generator}${event.positive ? '' : "'"}`)
    .join(' ');

  return {
    masses: [bodies.masses[0], bodies.masses[1], bodies.masses[2]],
    totalEnergy: energy,
    angularMomentum,
    closestApproach: closest,
    syzygies,
    braid: { word, crossings: events.length, truncated: events.length > BRAID_WORD_TOKENS, events },
    profileDraws,
    attempt,
    samples: { stride, count, positions, separations },
    windowStart: { positions: windowStart.P, velocities: windowStart.V },
    milliseconds: { beginnings: derived - started, orbit: performance.now() - derived },
  };
}

// ───────────────────────── The window, performed again ─────────────────────────

/*
  A recorded window replayed from its first step. A window's start is re-derived offline from
  the seed and checked against the record (scripts/build-orbit-windows.mjs); integrating from it
  with the generator's own step replays the recorded window step for step, so a page can perform
  many orbits at once without deriving any of them (the Orrery).
*/

/** One orbit's recorded window: where it starts, how it steps, and the plane it is drawn in. */
export interface OrbitWindow {
  masses: readonly [number, number, number];
  dt: number;
  steps: number;
  /** x, y, z of each body at the window's first step. */
  positions: readonly number[];
  velocities: readonly number[];
  plane: {
    mean: readonly [number, number, number];
    axes: readonly [readonly [number, number, number], readonly [number, number, number]];
    /** u0, u1, v0, v1: the extent of the window's samples in the plane. */
    bounds: readonly [number, number, number, number];
  };
}

/** The bodies' places in the plane at one step: u and v for each of the three. */
export interface PlanePoints {
  u: Float64Array;
  v: Float64Array;
}

/** A window performed step by step from its first step; restartable at no cost. */
export class WindowPerformance {
  readonly window: OrbitWindow;
  readonly positions = new Float64Array(9);
  readonly velocities = new Float64Array(9);
  /** Steps taken since the window's start: the bodies stand at this step of the window. */
  step = 0;
  private advance: () => void = () => {};

  // Node strips this file's types without transforming it, so no parameter properties here.
  constructor(window: OrbitWindow) {
    this.window = window;
    this.restart();
  }

  get done() {
    return this.step >= this.window.steps;
  }

  /** Back to the window's first step, exactly. */
  restart() {
    this.positions.set(this.window.positions);
    this.velocities.set(this.window.velocities);
    this.step = 0;
    this.advance = integrator(this.window.masses, this.positions, this.velocities, this.window.dt);
  }

  /**
   * Step up to `target` (never past the window). At every step that is a multiple of `stride`,
   * before the step is taken, `sample` sees the bodies, as the work page samples them.
   */
  run(target: number, stride: number, sample?: (step: number) => void) {
    const end = Math.min(target, this.window.steps);
    while (this.step < end) {
      if (sample && this.step % stride === 0) sample(this.step);
      this.advance();
      this.step += 1;
    }
  }

  /** The bodies projected onto the window's plane, into `into`. */
  project(into: PlanePoints) {
    const { mean, axes } = this.window.plane;
    const [a, b] = axes;
    for (let body = 0; body < 3; body++) {
      const dx = this.positions[body * 3] - mean[0];
      const dy = this.positions[body * 3 + 1] - mean[1];
      const dz = this.positions[body * 3 + 2] - mean[2];
      into.u[body] = dx * a[0] + dy * a[1] + dz * a[2];
      into.v[body] = dx * b[0] + dy * b[1] + dz * b[2];
    }
    return into;
  }
}

/**
 * The closest approach over a whole window, measured as the generator measures it: at every
 * step before it is taken, the first of the smallest separations of each pair, then the
 * smallest of the three pairs.
 */
export function closestApproachOf(window: OrbitWindow): ClosestApproach {
  const best = PAIRS.map(() => ({ distance: Infinity, step: -1 }));
  const replay = new WindowPerformance(window);
  const P = replay.positions;
  replay.run(window.steps, 1, (step) => {
    for (let k = 0; k < 3; k++) {
      const a = PAIRS[k][0] * 3;
      const b = PAIRS[k][1] * 3;
      const dx = P[a] - P[b];
      const dy = P[a + 1] - P[b + 1];
      const dz = P[a + 2] - P[b + 2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < best[k].distance) best[k] = { distance, step };
    }
  });
  let closest: ClosestApproach = { distance: best[0].distance, pair: [0, 1], step: best[0].step };
  for (let k = 1; k < 3; k++)
    if (best[k].distance < closest.distance)
      closest = {
        distance: best[k].distance,
        pair: [PAIRS[k][0], PAIRS[k][1]],
        step: best[k].step,
      };
  return closest;
}

// ───────────────────────── The record, and the comparison ─────────────────────────

/** The measurements the publisher's nft_traits.json states about the orbit. */
export interface PublishedPhysics {
  masses: readonly [number, number, number];
  totalEnergy: number;
  angularMomentum: number;
  closestApproach: { distance: number; pair: readonly [number, number]; step: number };
  syzygyCount: number;
  braid: { word: string; crossings: number; truncated: boolean };
}

export type MeasurementKey =
  | 'mass1'
  | 'mass2'
  | 'mass3'
  | 'totalEnergy'
  | 'angularMomentum'
  | 'closestDistance'
  | 'closestWhere'
  | 'syzygies'
  | 'braidCrossings'
  | 'braidWord';

export interface Comparison {
  key: MeasurementKey;
  derived: string;
  published: string;
  exact: boolean;
}

/** Exact text of a double: the shortest round-trip form, the same in every engine. */
const exactText = (value: number) => String(value);

/** Every published measurement beside the one re-derived here; equal means identical bits. */
export function compare(published: PublishedPhysics, derived: Rederivation): Comparison[] {
  const number = (key: MeasurementKey, ours: number, theirs: number): Comparison => ({
    key,
    derived: exactText(ours),
    published: exactText(theirs),
    exact: Object.is(ours, theirs),
  });
  const where = (pair: readonly number[], step: number) => `${pair.join(',')}@${step}`;
  return [
    number('mass1', derived.masses[0], published.masses[0]),
    number('mass2', derived.masses[1], published.masses[1]),
    number('mass3', derived.masses[2], published.masses[2]),
    number('totalEnergy', derived.totalEnergy, published.totalEnergy),
    number('angularMomentum', derived.angularMomentum, published.angularMomentum),
    number('closestDistance', derived.closestApproach.distance, published.closestApproach.distance),
    {
      key: 'closestWhere',
      derived: where(derived.closestApproach.pair, derived.closestApproach.step),
      published: where(published.closestApproach.pair, published.closestApproach.step),
      exact:
        where(derived.closestApproach.pair, derived.closestApproach.step) ===
        where(published.closestApproach.pair, published.closestApproach.step),
    },
    number('syzygies', derived.syzygies.length, published.syzygyCount),
    number('braidCrossings', derived.braid.crossings, published.braid.crossings),
    {
      key: 'braidWord',
      derived: derived.braid.word,
      published: published.braid.word,
      exact:
        derived.braid.word === published.braid.word &&
        derived.braid.truncated === published.braid.truncated,
    },
  ];
}
