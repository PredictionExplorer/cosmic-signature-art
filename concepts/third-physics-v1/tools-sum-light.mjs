// Usage: node tools-sum-light.mjs [exposure=0.9] [out.png]
// Quick look: the collection's Light added as light adds (linear-light sum, then a soft tone curve).
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(`${repo}/package.json`);
const sharp = require('sharp');
const dir = `${repo}/public/art/stills`;
const files = readdirSync(dir).filter((f) => /^\d+-light-1280-/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const W = 1280, H = 828;
const acc = new Float64Array(W * H * 3);
const toLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lut = Float64Array.from({ length: 256 }, (_, i) => toLinear(i));
for (const f of files) {
  const { data, info } = await sharp(`${dir}/${f}`).resize(W, H).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < W * H * 3; i++) acc[i] += lut[data[i]];
  if (info.width !== W) throw new Error(f);
}
const exposure = Number(process.argv[2] ?? 0.9);
const out = Buffer.alloc(W * H * 3);
for (let i = 0; i < acc.length; i++) {
  const x = acc[i] * exposure;
  const t = 1 - Math.exp(-x); // soft shoulder: light keeps adding without clipping
  const s = t <= 0.0031308 ? 12.92 * t : 1.055 * t ** (1 / 2.4) - 0.055;
  out[i] = Math.max(0, Math.min(255, Math.round(255 * s)));
}
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(process.argv[3] ?? 'maps/all-the-light.png');
console.log(`summed ${files.length} Light stills`);
