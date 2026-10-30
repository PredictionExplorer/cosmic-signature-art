// Usage: node tools-arrival-map.mjs <film.mp4> light|ink <out-prefix> [width=432] [figure-weight=0.65]
// Measure a film's "arrival map": for every pixel, when its mark arrived.
//   light: first time a pixel reaches half its final luminance (the orbit drawing itself)
//   ink:   the time after which a pixel stays within tolerance of the final still (the ink coming to rest)
// Ground pixels inherit the time of the nearest figure, delayed by distance, so the front
// spreads outward from the marks. Output: 16-bit grayscale PNG (0 = first, 65535 = last).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../package.json', import.meta.url));
const sharp = require('sharp');

const [input, mode, out, widthArg = '432', figureArg = '0.65'] = process.argv.slice(2);
const FIGURE = Number(figureArg);
const W = Number(widthArg);
const H = Math.round((W * 2234) / 3456);
const FPS = 30;

function decode() {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', input, '-vf', `fps=${FPS},scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
    const chunks = [];
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.stderr.on('data', (d) => process.stderr.write(d));
    ff.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg ${code}`))));
  });
}

const raw = await decode();
const N = W * H;
const frames = Math.floor(raw.length / N);
const last = raw.subarray((frames - 1) * N, frames * N);
console.log(`${input.split('/').pop()}: ${frames} frames at ${W}x${H}`);

const INF = 1e9;
const field = new Float64Array(N).fill(INF);
const figure = new Uint8Array(N);
let figures = 0, unstable = 0;

if (mode === 'light') {
  for (let p = 0; p < N; p++) {
    const fin = last[p];
    if (fin < 14) continue;
    const half = Math.max(8, fin * 0.5);
    let t = -1;
    for (let f = 0; f < frames; f++) if (raw[f * N + p] >= half) { t = f; break; }
    if (t < 0) continue;
    // stability: once lit, does the pixel stay lit? (would fail if the camera moved the canvas)
    let dropped = false;
    for (let f = t + 1; f < frames; f += 7) if (raw[f * N + p] < half * 0.5) { dropped = true; break; }
    if (dropped) unstable++;
    field[p] = t / (frames - 1);
    figure[p] = 1;
    figures++;
  }
} else {
  // the paper tone is the most common final value
  const hist = new Uint32Array(256);
  for (let p = 0; p < N; p++) hist[last[p]]++;
  const paper = hist.indexOf(Math.max(...hist));
  for (let p = 0; p < N; p++) {
    const fin = last[p];
    if (Math.abs(fin - paper) < 10) continue; // paper: inherits from the ink around it
    let settled = 0;
    for (let f = frames - 1; f >= 0; f--) if (Math.abs(raw[f * N + p] - fin) > 10) { settled = f + 1; break; }
    field[p] = settled / (frames - 1);
    figure[p] = 1;
    figures++;
  }
  console.log(`paper tone ${paper}`);
}
console.log(`figure pixels ${figures} (${((100 * figures) / N).toFixed(1)}%), unstable ${unstable}`);

// Weighted chamfer distance transform seeded with the figure times: the ground is reached
// at (time of nearest figure) + c * distance. c = time per pixel of travel.
const c = 0.35 / Math.hypot(W, H);
const a = c, b = c * Math.SQRT2;
for (let pass = 0; pass < 2; pass++) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    let v = field[p];
    if (x > 0) v = Math.min(v, field[p - 1] + a);
    if (y > 0) {
      v = Math.min(v, field[p - W] + a);
      if (x > 0) v = Math.min(v, field[p - W - 1] + b);
      if (x < W - 1) v = Math.min(v, field[p - W + 1] + b);
    }
    field[p] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const p = y * W + x;
    let v = field[p];
    if (x < W - 1) v = Math.min(v, field[p + 1] + a);
    if (y < H - 1) {
      v = Math.min(v, field[p + W] + a);
      if (x < W - 1) v = Math.min(v, field[p + W + 1] + b);
      if (x > 0) v = Math.min(v, field[p + W - 1] + b);
    }
    field[p] = v;
  }
}

// Soften: three box blurs approximate a gaussian; keep figure pixels sharper.
function blur(src, r) {
  const tmp = new Float64Array(N), dst = new Float64Array(N);
  for (let y = 0; y < H; y++) {
    let s = 0, n = 0;
    for (let x = -r; x < W + r; x++) {
      if (x + r < W) { s += src[y * W + Math.min(W - 1, x + r)]; n++; }
      if (x - r - 1 >= 0) { s -= src[y * W + x - r - 1]; n--; }
      if (x >= 0 && x < W) tmp[y * W + x] = s / n;
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let y = -r; y < H + r; y++) {
      if (y + r < H) { s += tmp[Math.min(H - 1, y + r) * W + x]; n++; }
      if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * W + x]; n--; }
      if (y >= 0 && y < H) dst[y * W + x] = s / n;
    }
  }
  return dst;
}
let soft = field;
for (let i = 0; i < 3; i++) soft = blur(soft, Math.max(1, Math.round(W / 220)));
const mixed = new Float64Array(N);
for (let p = 0; p < N; p++) mixed[p] = figure[p] ? FIGURE * field[p] + (1 - FIGURE) * soft[p] : soft[p];

let lo = Infinity, hi = -Infinity;
for (let p = 0; p < N; p++) { lo = Math.min(lo, mixed[p]); hi = Math.max(hi, mixed[p]); }
const out16 = new Uint16Array(N);
for (let p = 0; p < N; p++) out16[p] = Math.round((65535 * (mixed[p] - lo)) / (hi - lo || 1));
await sharp(Buffer.from(out16.buffer), { raw: { width: W, height: H, channels: 1, premultiplied: false } })
  .toColourspace('grey16').png({ compressionLevel: 9 }).toFile(`${out}.png`);
const out8 = Buffer.alloc(N);
for (let p = 0; p < N; p++) out8[p] = Math.round((255 * (mixed[p] - lo)) / (hi - lo || 1));
await sharp(out8, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toFile(`${out}-8bit.png`);

// A false-colour "When" view for inspection: time through a dark-to-light ramp, figures only.
const rgb = Buffer.alloc(N * 3);
const ramp = (t) => [Math.round(255 * Math.min(1, 0.15 + 1.6 * t)), Math.round(255 * Math.min(1, Math.max(0, 1.4 * t - 0.2))), Math.round(255 * Math.max(0, 0.9 - 1.2 * t))];
for (let p = 0; p < N; p++) {
  const t = (mixed[p] - lo) / (hi - lo || 1);
  const [r, g, bl] = figure[p] ? ramp(t) : [Math.round(30 * (1 - t)), Math.round(30 * (1 - t)), Math.round(34 * (1 - t))];
  rgb[p * 3] = r; rgb[p * 3 + 1] = g; rgb[p * 3 + 2] = bl;
}
await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${out}-when.png`);
console.log(`wrote ${out}.png and ${out}-when.png`);
