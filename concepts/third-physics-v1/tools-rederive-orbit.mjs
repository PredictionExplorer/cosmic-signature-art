// Usage: node tools-rederive-orbit.mjs <seed> <nft_traits.json>  (the package's metadata/nft_traits.json)
// Feasibility test: can a browser re-derive a Cosmic Signature orbit from its seed?
// Ports Sha3RandomByteStream, random_body, shift_bodies_to_com and the Yoshida-4 step
// from CS-Image-Generation/src/sim.rs with the same operation order, then compares
// against the published simulation block of nft_traits.json.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [seedHex, traitsPath] = process.argv.slice(2);
const traits = JSON.parse(readFileSync(traitsPath, 'utf8'));
const published = traits.simulation;
const selectedIndex = traits.generation.borda.selected_index;

class Stream {
  constructor(seed) {
    this.seed = seed;
    this.pending = [seed]; // the constructor's hasher keeps the seed absorbed
    this.buffer = createHash('sha3-256').update(seed).digest();
    this.index = 0;
  }
  nextByte() {
    if (this.index >= this.buffer.length) {
      const h = createHash('sha3-256');
      for (const p of this.pending) h.update(p);
      h.update(this.seed).update(this.buffer);
      this.buffer = h.digest();
      this.pending = [];
      this.index = 0;
    }
    return this.buffer[this.index++];
  }
  nextF64() {
    let v = 0n;
    for (let i = 0; i < 8; i++) v |= BigInt(this.nextByte()) << BigInt(8 * i);
    return Number(v) / Number(0xffffffffffffffffn);
  }
}

const seed = Buffer.from(seedHex.replace(/^0x/, ''), 'hex');
const stream = new Stream(seed);
const t0 = performance.now();
const maxDraws = selectedIndex * 21 + 200_000;
const draws = new Float64Array(maxDraws);
for (let i = 0; i < maxDraws; i++) draws[i] = stream.nextF64();
const mass = (r) => r * (300 - 100) + 100;

// The visual profile consumes an unknown number of draws first: find the offset.
let found = -1;
for (let k = 0; k + 14 < maxDraws; k++) {
  if (mass(draws[k]) === published.masses[0] && mass(draws[k + 7]) === published.masses[1] && mass(draws[k + 14]) === published.masses[2]) {
    found = k;
    break;
  }
}
if (found < 0) throw new Error('masses not found in the stream');
const preCandidateDraws = found - selectedIndex * 21;
console.log(`stream: ${maxDraws} draws in ${(performance.now() - t0).toFixed(0)} ms`);
console.log(`candidate ${selectedIndex} starts at draw ${found}; ${preCandidateDraws} draws precede the candidates (profile + weights)`);

const loc = (r) => r * (300 - -300) + -300;
const vel = (r) => r * (1 - -1) + -1;
const bodies = [0, 1, 2].map((b) => {
  const d = (i) => draws[found + b * 7 + i];
  return { m: mass(d(0)), p: [loc(d(1)), loc(d(2)), loc(d(3))], v: [vel(d(4)), vel(d(5)), vel(d(6))] };
});

function shiftToCom(bs) {
  const mt = bs[0].m + bs[1].m + bs[2].m;
  const rc = [0, 0, 0], vc = [0, 0, 0];
  for (const b of bs) for (let k = 0; k < 3; k++) rc[k] = rc[k] + b.m * b.p[k];
  for (let k = 0; k < 3; k++) rc[k] = rc[k] / mt;
  for (const b of bs) for (let k = 0; k < 3; k++) vc[k] = vc[k] + b.m * b.v[k];
  for (let k = 0; k < 3; k++) vc[k] = vc[k] / mt;
  for (const b of bs) for (let k = 0; k < 3; k++) { b.p[k] = b.p[k] - rc[k]; b.v[k] = b.v[k] - vc[k]; }
}
const norm = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const clone = (bs) => bs.map((b) => ({ m: b.m, p: [...b.p], v: [...b.v] }));

shiftToCom(bodies); // in the candidate list
const forEnergy = clone(bodies);
shiftToCom(forEnergy); // com_bodies in nft_traits::build
let kin = 0, pot = 0;
for (const b of forEnergy) kin = kin + 0.5 * b.m * (b.v[0] * b.v[0] + b.v[1] * b.v[1] + b.v[2] * b.v[2]);
for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
  const r = norm(forEnergy[i].p[0] - forEnergy[j].p[0], forEnergy[i].p[1] - forEnergy[j].p[1], forEnergy[i].p[2] - forEnergy[j].p[2]);
  if (r > 1e-10) pot = pot + -9.8 * forEnergy[i].m * forEnergy[j].m / r;
}
const L = [0, 0, 0];
for (const b of forEnergy) {
  const [ax, ay, az] = b.p, [bx, by, bz] = b.v;
  const c = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  for (let k = 0; k < 3; k++) L[k] = L[k] + b.m * c[k];
}
const energy = kin + pot, angular = norm(L[0], L[1], L[2]);

// Yoshida 4 over flat arrays, same order as sim.rs.
const sim = clone(bodies);
shiftToCom(sim); // get_positions
const m = sim.map((b) => b.m);
const P = new Float64Array(9), V = new Float64Array(9), A = new Float64Array(9);
sim.forEach((b, i) => { for (let k = 0; k < 3; k++) { P[i * 3 + k] = b.p[k]; V[i * 3 + k] = b.v[k]; } });
const W1 = 1.3512071919596578, W0 = -1.7024143839193153, dt = published.dt;
const C1 = W1 / 2, C2 = (W0 + W1) / 2, C3 = C2, C4 = C1, D1 = W1, D2 = W0, D3 = W1;
const Q = new Float64Array(9);
function accel() {
  Q.set(P);
  for (let i = 0; i < 3; i++) {
    let ax = 0, ay = 0, az = 0;
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const dx = Q[i * 3] - Q[j * 3], dy = Q[i * 3 + 1] - Q[j * 3 + 1], dz = Q[i * 3 + 2] - Q[j * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-10) {
        const s = -9.8 * m[j], d3 = d * d * d;
        ax = ax + (s * dx) / d3; ay = ay + (s * dy) / d3; az = az + (s * dz) / d3;
      }
    }
    A[i * 3] = ax; A[i * 3 + 1] = ay; A[i * 3 + 2] = az;
  }
}
function drift(c) { const h = c * dt; for (let i = 0; i < 9; i++) P[i] = P[i] + V[i] * h; }
function kick(c) { const h = c * dt; for (let i = 0; i < 9; i++) V[i] = V[i] + A[i] * h; }
function step() { drift(C1); accel(); kick(D1); drift(C2); accel(); kick(D2); drift(C3); accel(); kick(D3); drift(C4); }

const t1 = performance.now();
for (let s = 0; s < published.warmup_steps; s++) step();
const PAIRS = [[0, 1], [0, 2], [1, 2]];
const best = PAIRS.map(() => ({ distance: Infinity, step: -1 }));
for (let s = 0; s < published.steps; s++) {
  PAIRS.forEach(([a, b], k) => {
    const dist = norm(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
    if (dist < best[k].distance) best[k] = { distance: dist, step: s };
  });
  step();
}
let ca = null;
PAIRS.forEach((pair, k) => { if (!ca || best[k].distance < ca.distance) ca = { ...best[k], pair }; });
const ms = performance.now() - t1;

const row = (name, ours, theirs) => console.log(`${name.padEnd(18)} ${String(ours).padEnd(24)} ${String(theirs).padEnd(24)} ${Object.is(ours, theirs) ? 'exact' : 'DIFFERS'}`);
console.log(`integrated ${published.warmup_steps + published.steps} Yoshida steps in ${ms.toFixed(0)} ms\n`);
console.log(`${'measurement'.padEnd(18)} ${'re-derived'.padEnd(24)} ${'published'.padEnd(24)}`);
published.masses.forEach((pm, i) => row(`mass ${i}`, bodies[i].m, pm));
row('total energy', energy, published.total_energy);
row('angular momentum', angular, published.angular_momentum);
row('closest distance', ca.distance, published.closest_approach.distance);
row('closest pair', ca.pair.join(','), published.closest_approach.pair.join(','));
row('closest step', ca.step, published.closest_approach.step);
