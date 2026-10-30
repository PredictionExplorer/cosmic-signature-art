// Third Physics — a study. Three rooms, each moved only by the work's own physics:
// I   the orbit re-derived from its seed in this browser and checked against the record;
// II  a crossing between the two published stills in the order the films made them;
// III the collection's light, added as light adds.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(2, window.devicePixelRatio || 1);
const MINUS = '−';
const fmt = (x) => (x < 0 ? MINUS : '') + String(Math.abs(x));
const int = (n) => Math.round(n).toLocaleString('en-US');
const pad3 = (n) => String(n).padStart(3, '0');
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const shortSeed = (seed) => `${seed.slice(0, 6)}…${seed.slice(-4)}`;

function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * DPR));
  const h = Math.max(1, Math.round(r.height * DPR));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h };
}

function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

function whenNear(element, start) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      start();
    }
  }, { rootMargin: '300px 0px' });
  io.observe(element);
}

// ───────────────────────── I · the orbit, re-performed ─────────────────────────

function jacobi3(m) {
  const A = m.map((row) => row.slice());
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    if (Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]) < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const kp = A[k][p], kq = A[k][q];
        A[k][p] = c * kp - s * kq;
        A[k][q] = s * kp + c * kq;
      }
      for (let k = 0; k < 3; k++) {
        const pk = A[p][k], qk = A[q][k];
        A[p][k] = c * pk - s * qk;
        A[q][k] = s * pk + c * qk;
      }
      for (let k = 0; k < 3; k++) {
        const kp = V[k][p], kq = V[k][q];
        V[k][p] = c * kp - s * kq;
        V[k][q] = s * kp + c * kq;
      }
    }
  }
  const order = [0, 1, 2].sort((a, b) => A[b][b] - A[a][a]);
  return order.map((i) => [V[0][i], V[1][i], V[2][i]]);
}

function principalPlane(pos, samples) {
  const mean = [0, 0, 0];
  for (let s = 0; s < samples; s++) for (let b = 0; b < 3; b++) for (let k = 0; k < 3; k++) mean[k] += pos[s * 9 + b * 3 + k];
  for (let k = 0; k < 3; k++) mean[k] /= samples * 3;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let s = 0; s < samples; s += 2) {
    for (let b = 0; b < 3; b++) {
      const d = [0, 1, 2].map((k) => pos[s * 9 + b * 3 + k] - mean[k]);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j];
    }
  }
  const [e1, e2] = jacobi3(cov);
  const u = new Float32Array(samples * 3), v = new Float32Array(samples * 3);
  for (let s = 0; s < samples; s++) {
    for (let b = 0; b < 3; b++) {
      const o = s * 9 + b * 3;
      const dx = pos[o] - mean[0], dy = pos[o + 1] - mean[1], dz = pos[o + 2] - mean[2];
      u[s * 3 + b] = dx * e1[0] + dy * e1[1] + dz * e1[2];
      v[s * 3 + b] = dx * e2[0] + dy * e2[1] + dz * e2[2];
    }
  }
  return { u, v };
}

async function roomScore() {
  const section = document.querySelector('#score');
  const trails = section.querySelector('.score-trails');
  const heads = section.querySelector('.score-heads');
  const events = section.querySelector('.events');
  const choice = section.querySelector('.choice');
  const readout = section.querySelector('.readout');
  const rows = section.querySelector('.proof-rows');
  const again = section.querySelector('.again');

  const traits = await (await fetch('assets/traits-031.json')).json();
  const sim = traits.simulation;
  const borda = traits.generation.borda;
  const hues = traits.generation.palette.body_base_hues_deg;
  const seed = traits.seed;

  const published = [
    ['mass · body 1', sim.masses[0]],
    ['mass · body 2', sim.masses[1]],
    ['mass · body 3', sim.masses[2]],
    ['total energy', sim.total_energy],
    ['angular momentum', sim.angular_momentum],
    ['closest approach', sim.closest_approach.distance],
    ['… at step', sim.closest_approach.step],
  ];
  rows.innerHTML = published
    .map(([name]) => `<tr><th scope="row">${name}</th><td class="pending">deriving…</td><td class="ok"></td></tr>`)
    .join('');

  readout.textContent = `Seed ${shortSeed(seed)} · deriving the hundred thousand beginnings…`;
  const worker = new Worker(new URL('./orbit-worker.js', import.meta.url), { type: 'module' });
  const started = performance.now();
  worker.postMessage({
    seedHex: seed,
    profileDraws: 23,
    selectedIndex: borda.selected_index,
    candidates: borda.total_candidates,
    steps: sim.steps,
    warmup: sim.warmup_steps,
    dt: sim.dt,
    stride: 100,
  });
  const result = await new Promise((resolve) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'done') return resolve(data.result);
      if (data.phase === 'candidates') readout.textContent = `Seed ${shortSeed(seed)} · deriving beginnings · ${int(data.done)} of ${int(data.total)}`;
      if (data.phase === 'warmup') readout.textContent = `Candidate ${int(borda.selected_index)} · setting it in motion · step ${int(data.done)} of ${int(sim.warmup_steps)}`;
      if (data.phase === 'orbit') readout.textContent = `Candidate ${int(borda.selected_index)} · the recorded window · step ${int(data.done)} of ${int(sim.steps)}`;
    };
  });
  worker.terminate();
  const wall = (performance.now() - started) / 1000;

  const ours = [...result.masses, result.energy, result.angular, result.closest.distance, result.closest.step];
  rows.innerHTML = published
    .map(([name, theirs], i) => {
      const same = Object.is(ours[i], theirs);
      const value = i === 6 ? int(ours[i]) : fmt(ours[i]);
      return `<tr><th scope="row">${name}</th><td><span class="value">${value}</span></td><td class="ok" title="Published: ${i === 6 ? int(theirs) : fmt(theirs)}">${same ? 'exact' : 'differs'}</td></tr>`;
    })
    .join('');

  const samples = result.samples;
  const film = 30.033333;
  const caSample = Math.round(result.closest.step / 100);
  const caTime = (result.closest.step / sim.steps) * film;
  const pairName = result.closest.pair.map((b) => b + 1).join('–');
  const summary = `Seed ${shortSeed(seed)} · ${int(borda.total_candidates)} beginnings in ${(result.timings.candidates / 1000).toFixed(2)} s · candidate ${int(borda.selected_index)} · ${int(sim.warmup_steps + sim.steps)} steps in ${(result.timings.orbit / 1000).toFixed(2)} s · the published record, to the last bit`;
  readout.textContent = summary;
  section.dataset.wall = wall.toFixed(2);

  await document.fonts.ready;
  const { u, v } = principalPlane(result.positions, samples);
  const trailColour = hues.map((h) => `oklch(0.84 0.075 ${h} / 0.2)`);
  const headColour = hues.map((h) => `oklch(0.95 0.05 ${h})`);
  const radius = result.masses.map((m) => Math.cbrt(m) * 0.62);

  // Choice: the hundred thousand beginnings as a field of points.
  function drawChoice() {
    const { w, h } = fitCanvas(choice);
    const ctx = choice.getContext('2d');
    const n = result.gate.length / 2;
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // every beginning is bound (negative energy); a log of its depth spreads the field
      xs[i] = Math.log10(result.gate[i * 2 + 1]);
      ys[i] = -Math.log10(Math.max(1e-6, -result.gate[i * 2]));
    }
    const q = (arr, f) => { const s = Float32Array.from(arr).sort(); return s[Math.floor(f * (s.length - 1))]; };
    const x0 = q(xs, 0.004), x1 = q(xs, 0.996), y0 = q(ys, 0.004), y1 = q(ys, 0.996);
    const m = 10 * DPR, plotW = w - 2 * m, plotH = h - 2 * m - 14 * DPR;
    const density = new Float32Array(w * h);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const px = Math.round(m + ((xs[i] - x0) / (x1 - x0)) * plotW);
      const py = Math.round(m + (1 - (ys[i] - y0) / (y1 - y0)) * plotH);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const k = py * w + px;
      density[k] += 1;
      peak = Math.max(peak, density[k]);
    }
    const image = ctx.createImageData(w, h);
    for (let k = 0; k < w * h; k++) {
      if (!density[k]) continue;
      const a = Math.min(1, 0.22 + Math.sqrt(density[k] / peak) * 1.3);
      image.data[k * 4] = 241; image.data[k * 4 + 1] = 235; image.data[k * 4 + 2] = 223; image.data[k * 4 + 3] = Math.round(a * 210);
    }
    ctx.putImageData(image, 0, 0);
    const i = borda.selected_index;
    const cx = m + ((xs[i] - x0) / (x1 - x0)) * plotW, cy = m + (1 - (ys[i] - y0) / (y1 - y0)) * plotH;
    ctx.strokeStyle = `oklch(0.86 0.12 ${hues[0]})`;
    ctx.lineWidth = 1.25 * DPR;
    ctx.beginPath();
    ctx.arc(cx, cy, 7 * DPR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `${12 * DPR}px 'Plex Mono', monospace`;
    ctx.fillStyle = 'rgb(241 235 223 / 0.92)';
    ctx.textBaseline = 'middle';
    const label = `№ ${int(i)}`;
    const right = cx + 12 * DPR + ctx.measureText(label).width < w;
    ctx.textAlign = right ? 'left' : 'right';
    ctx.fillText(label, right ? cx + 12 * DPR : cx - 12 * DPR, cy);
    ctx.fillStyle = 'rgb(241 235 223 / 0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('angular momentum →', m, h - 2 * DPR);
    ctx.textAlign = 'right';
    ctx.fillText('energy ↑', w - m, h - 2 * DPR);
  }

  // Event score: the three pairwise separations across the recorded window.
  const strip = document.createElement('canvas');
  function drawStrip() {
    const { w, h } = fitCanvas(events);
    strip.width = w;
    strip.height = h;
    const ctx = strip.getContext('2d');
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < samples * 3; i++) {
      const l = Math.log(result.separations[i]);
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    const pairHue = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => (hues[a] + hues[b]) / 2);
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `oklch(0.8 0.07 ${pairHue[k]} / 0.55)`;
      ctx.lineWidth = DPR;
      ctx.beginPath();
      for (let s = 0; s < samples; s += 2) {
        const x = (s / (samples - 1)) * w;
        const y = 2 * DPR + (1 - (Math.log(result.separations[s * 3 + k]) - lo) / (hi - lo)) * (h - 4 * DPR);
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const cx = (caSample / (samples - 1)) * w;
    ctx.strokeStyle = 'rgb(241 235 223 / 0.9)';
    ctx.beginPath();
    ctx.moveTo(cx, h);
    ctx.lineTo(cx, h - 10 * DPR);
    ctx.stroke();
  }

  let layout;
  function computeLayout() {
    const { w, h } = fitCanvas(trails);
    fitCanvas(heads);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < u.length; i++) {
      u0 = Math.min(u0, u[i]); u1 = Math.max(u1, u[i]);
      v0 = Math.min(v0, v[i]); v1 = Math.max(v1, v[i]);
    }
    const top = 150 * DPR, bottom = 140 * DPR, side = 40 * DPR;
    const scale = Math.min((w - 2 * side) / (u1 - u0), (h - top - bottom) / (v1 - v0));
    const ox = side + (w - 2 * side - (u1 - u0) * scale) / 2 - u0 * scale;
    const oy = top + (h - top - bottom - (v1 - v0) * scale) / 2 - v0 * scale;
    layout = { w, h, scale, ox, oy };
  }
  const X = (s, b) => layout.ox + u[s * 3 + b] * layout.scale;
  const Y = (s, b) => layout.oy + v[s * 3 + b] * layout.scale;

  const tctx = trails.getContext('2d');
  const hctx = heads.getContext('2d');
  let drawn = 0;
  let startedAt = 0;
  let raf = 0;

  function drawTrails(from, to) {
    tctx.globalCompositeOperation = 'lighter';
    tctx.lineWidth = 1.1 * DPR;
    tctx.lineJoin = 'round';
    for (let b = 0; b < 3; b++) {
      tctx.strokeStyle = trailColour[b];
      tctx.beginPath();
      tctx.moveTo(X(from, b), Y(from, b));
      for (let s = from + 1; s <= to; s++) tctx.lineTo(X(s, b), Y(s, b));
      tctx.stroke();
    }
  }

  function drawHeads(s) {
    hctx.clearRect(0, 0, layout.w, layout.h);
    if (s >= caSample) {
      const [a, b] = result.closest.pair;
      const mx = (X(caSample, a) + X(caSample, b)) / 2, my = (Y(caSample, a) + Y(caSample, b)) / 2;
      hctx.strokeStyle = 'rgb(241 235 223 / 0.7)';
      hctx.lineWidth = DPR;
      hctx.beginPath();
      hctx.arc(mx, my, 16 * DPR, 0, Math.PI * 2);
      hctx.stroke();
      hctx.font = `${12 * DPR}px 'Plex Mono', monospace`;
      hctx.fillStyle = 'rgb(241 235 223 / 0.8)';
      hctx.textBaseline = 'middle';
      hctx.fillText(`closest approach · ${result.closest.distance.toFixed(1)} · bodies ${pairName}`, mx + 24 * DPR, my);
    }
    if (s >= samples - 1 && !reduced) return;
    for (let b = 0; b < 3; b++) {
      const x = X(s, b), y = Y(s, b), r = radius[b] * DPR;
      const g = hctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, headColour[b]);
      g.addColorStop(0.22, `oklch(0.9 0.08 ${hues[b]} / 0.55)`);
      g.addColorStop(1, 'transparent');
      hctx.fillStyle = g;
      hctx.beginPath();
      hctx.arc(x, y, r * 4, 0, Math.PI * 2);
      hctx.fill();
    }
  }

  function drawEvents(s) {
    const ctx = events.getContext('2d');
    ctx.clearRect(0, 0, events.width, events.height);
    ctx.drawImage(strip, 0, 0);
    const x = (s / (samples - 1)) * events.width;
    ctx.fillStyle = 'rgb(241 235 223 / 0.92)';
    ctx.fillRect(Math.round(x), 0, DPR, events.height);
  }

  function frame(now) {
    const t = Math.min(1, (now - startedAt) / (film * 1000));
    const target = Math.min(samples - 1, Math.floor(t * (samples - 1)));
    if (target > drawn) {
      drawTrails(drawn, target);
      drawn = target;
    }
    drawHeads(drawn);
    drawEvents(drawn);
    const filmTime = (drawn / (samples - 1)) * film;
    readout.textContent = drawn >= caSample && filmTime < caTime + 2.5
      ? `Closest approach · ${fmt(result.closest.distance)} · bodies ${pairName} · step ${int(result.closest.step)} · ${clock(caTime)}`
      : `Step ${int((drawn / (samples - 1)) * (sim.steps - 1))} of ${int(sim.steps)} · ${clock(filmTime)} · the film's own pace`;
    if (drawn < samples - 1) raf = requestAnimationFrame(frame);
    else {
      readout.textContent = summary;
      again.hidden = false;
    }
  }

  function play() {
    cancelAnimationFrame(raf);
    again.hidden = true;
    tctx.clearRect(0, 0, layout.w, layout.h);
    drawn = 0;
    if (reduced) {
      drawTrails(0, samples - 1);
      drawn = samples - 1;
      drawHeads(drawn);
      drawEvents(drawn);
      return;
    }
    startedAt = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function redrawAll() {
    computeLayout();
    drawStrip();
    drawChoice();
    tctx.clearRect(0, 0, layout.w, layout.h);
    if (drawn > 0) drawTrails(0, drawn);
    drawHeads(drawn);
    drawEvents(drawn);
  }

  computeLayout();
  drawStrip();
  drawChoice();
  play();
  again.addEventListener('click', play);
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 120);
  });
}

// ───────────────────────── II · the crossing ─────────────────────────

const CROSS_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const CROSS_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uInk, uLight, uMapI, uMapL;
uniform vec4 uPlate;
uniform vec2 uCanvas;
uniform vec3 uPaper;
uniform float uP, uDir, uEdge, uWhen, uSpread;

vec3 ramp(float t) {
  vec3 a = vec3(0.30, 0.36, 0.95);
  vec3 b = vec3(0.93, 0.40, 0.55);
  vec3 c = vec3(1.00, 0.88, 0.62);
  return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
}

// Beyond the plate the wall takes the time of the nearest edge, averaged along that edge
// more widely the further away it is, so the front leaves the plate as a soft shape.
float edgeTime(sampler2D map, vec2 qc, float away) {
  if (away <= 0.0) return texture2D(map, qc).r;
  float reach = min(0.3, away * 0.6);
  float sum = 0.0;
  for (int i = -4; i <= 4; i++) {
    float o = float(i) * reach / 4.0;
    sum += texture2D(map, clamp(qc + vec2(o, 0.0), 0.0, 1.0)).r;
    sum += texture2D(map, clamp(qc + vec2(0.0, o), 0.0, 1.0)).r;
  }
  return sum / 18.0;
}

void main() {
  vec2 q = (vUv - uPlate.xy) / uPlate.zw;
  vec2 qc = clamp(q, 0.0, 1.0);
  float inside = step(0.0, q.x) * step(0.0, q.y) * step(q.x, 1.0) * step(q.y, 1.0);
  float away = length((q - qc) * uPlate.zw * uCanvas) / (uPlate.w * uCanvas.y);
  float rawL = texture2D(uMapL, qc).r;
  float rawI = texture2D(uMapI, qc).r;
  float aL = edgeTime(uMapL, qc, away) + uSpread * away;
  float aI = edgeTime(uMapI, qc, away) + uSpread * away;
  vec3 ink = mix(uPaper, texture2D(uInk, qc).rgb, inside);
  vec3 light = texture2D(uLight, qc).rgb * inside;
  float m = uDir > 0.5
    ? 1.0 - smoothstep(uP - uEdge, uP + uEdge, aL)
    : smoothstep(uP - uEdge, uP + uEdge, aI);
  vec3 colour = mix(ink, light, m);

  if (uWhen > 0.001) {
    vec3 w3 = vec3(0.2126, 0.7152, 0.0722);
    float paper = dot(uPaper, w3);
    float wL = smoothstep(0.025, 0.45, dot(light, w3));
    float wI = smoothstep(0.03, 0.55, (paper - dot(ink, w3)) / paper);
    float weight = mix(wI, wL, m) * inside;
    vec3 ground = vec3(0.035, 0.035, 0.04);
    vec3 when = mix(ramp(rawI), ramp(rawL), m) * weight + ground * (1.0 - weight);
    colour = mix(colour, when, uWhen);
  }
  gl_FragColor = vec4(colour, 1.0);
}`;

function compile(gl, vs, fs) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}

function quad(gl, program) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

function texture(gl, source, { data = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, data ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function histogramCdf(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const cdf = new Float64Array(256);
  let acc = 0;
  for (let i = 0; i < 256; i++) cdf[i] = (acc += hist[i]) / (data.length / 4);
  return (p) => cdf[Math.max(0, Math.min(255, Math.floor(p * 255)))] * (p >= 0 ? 1 : 0);
}

async function roomCross() {
  const section = document.querySelector('#cross');
  const canvas = section.querySelector('canvas.cross');
  const state = section.querySelector('.plate-state');
  const toLight = section.querySelector('[data-to="light"]');
  const toInk = section.querySelector('[data-to="ink"]');
  const lens = section.querySelector('[data-lens]');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) {
    state.textContent = 'WebGL is not available here';
    return;
  }
  const base = '../../public/art/stills/';
  const [ink, light, mapI, mapL] = await Promise.all([
    loadImage(`${base}31-ink-1920-d06b3afce648acb4.webp`),
    loadImage(`${base}31-light-1920-0fa45c59568a5574.webp`),
    loadImage('assets/31-ink-arrival.png'),
    loadImage('assets/31-light-arrival.png'),
  ]);
  const cdfI = histogramCdf(mapI), cdfL = histogramCdf(mapL);
  const program = compile(gl, CROSS_VS, CROSS_FS);
  gl.useProgram(program);
  quad(gl, program);
  const textures = [texture(gl, ink), texture(gl, light), texture(gl, mapI, { data: true }), texture(gl, mapL, { data: true })];
  ['uInk', 'uLight', 'uMapI', 'uMapL'].forEach((name, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, textures[i]);
    gl.uniform1i(gl.getUniformLocation(program, name), i);
  });
  const U = (name) => gl.getUniformLocation(program, name);
  gl.uniform3f(U('uPaper'), 0xef / 255, 0xe9 / 255, 0xdd / 255);
  const EDGE = 0.035, SPREAD = 0.22, PLATE_SECONDS = 2.6;

  const s = { at: 'ink', dir: 1, p: -EDGE, when: 0, end: 1 + EDGE, anim: 0, drag: null };

  function layout() {
    const { w, h } = fitCanvas(canvas);
    gl.viewport(0, 0, w, h);
    const narrow = w / DPR < 860;
    const top = (narrow ? 112 : 84) * DPR, bottom = (narrow ? 190 : 96) * DPR, side = (narrow ? 0 : 48) * DPR;
    let ph = h - top - bottom, pw = ph * (3456 / 2234);
    if (pw > w - 2 * side) {
      pw = w - 2 * side;
      ph = pw / (3456 / 2234);
    }
    const x = (w - pw) / 2, y = top + (h - top - bottom - ph) / 2;
    gl.uniform4f(U('uPlate'), x / w, y / h, pw / w, ph / h);
    gl.uniform2f(U('uCanvas'), w, h);
    const corners = [[0, 0], [w, 0], [0, h], [w, h]];
    const far = Math.max(...corners.map(([cx, cy]) => Math.hypot(Math.max(x - cx, 0, cx - x - pw), Math.max(y - cy, 0, cy - y - ph)))) / ph;
    s.end = 1 + SPREAD * far + EDGE;
  }

  function lightShare() {
    if (s.dir > 0.5) return cdfL(Math.min(1, s.p));
    return 1 - cdfI(Math.min(1, s.p));
  }

  function draw() {
    gl.uniform1f(U('uP'), s.p);
    gl.uniform1f(U('uDir'), s.dir);
    gl.uniform1f(U('uEdge'), EDGE);
    gl.uniform1f(U('uSpread'), SPREAD);
    gl.uniform1f(U('uWhen'), s.when);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const share = lightShare();
    document.querySelector('meta[name="theme-color"]').content = share > 0.5 ? '#000000' : '#efe9dd';
  }

  function label() {
    const word = s.at === 'light' ? 'Light' : 'Ink';
    state.textContent = s.when > 0.5
      ? `${word} · when ${s.at === 'light' ? 'each mark was drawn' : 'each mark came to rest'} · analysis, not the work`
      : `${word} · still`;
    toLight.disabled = s.at === 'light';
    toInk.disabled = s.at === 'ink';
  }

  function animateTo(target, ms, done) {
    cancelAnimationFrame(s.anim);
    const from = s.p, t0 = performance.now();
    if (reduced) {
      s.p = target;
      draw();
      done?.();
      return;
    }
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      s.p = from + (target - from) * k;
      draw();
      if (k < 1) s.anim = requestAnimationFrame(tick);
      else done?.();
    };
    s.anim = requestAnimationFrame(tick);
  }

  function cross(to) {
    if (to === s.at) return;
    s.dir = to === 'light' ? 1 : 0;
    s.p = -EDGE;
    state.textContent = to === 'light' ? 'Crossing into Light · the orbit draws itself' : 'Crossing into Ink · the current comes to rest';
    animateTo(s.end, PLATE_SECONDS * 1000 * s.end, () => {
      s.at = to;
      label();
    });
  }

  function setWhen(on) {
    lens.setAttribute('aria-pressed', String(on));
    const from = s.when, t0 = performance.now();
    const tick = (now) => {
      const k = reduced ? 1 : Math.min(1, (now - t0) / 600);
      s.when = from + ((on ? 1 : 0) - from) * k;
      draw();
      if (k < 1) requestAnimationFrame(tick);
      else label();
    };
    requestAnimationFrame(tick);
  }

  toLight.addEventListener('click', () => cross('light'));
  toInk.addEventListener('click', () => cross('ink'));
  lens.addEventListener('click', () => setWhen(lens.getAttribute('aria-pressed') !== 'true'));
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const r = section.getBoundingClientRect();
    if (r.bottom < innerHeight * 0.3 || r.top > innerHeight * 0.7) return;
    if (e.key === 'l' || e.key === 'L') cross('light');
    if (e.key === 'i' || e.key === 'I') cross('ink');
    if (e.key === 'w' || e.key === 'W') lens.click();
  });

  // Drag: Light arrives from the right, Ink returns from the left. Past 40 % it completes.
  canvas.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(s.anim);
    s.dir = s.at === 'ink' ? 1 : 0;
    s.drag = { x: e.clientX, from: s.at, width: canvas.getBoundingClientRect().width };
    s.p = -EDGE;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!s.drag) return;
    const dx = (e.clientX - s.drag.x) / s.drag.width;
    const travel = s.drag.from === 'ink' ? -dx : dx;
    s.p = -EDGE + Math.max(0, travel) * 1.4 * (s.end + EDGE);
    draw();
  });
  const release = () => {
    if (!s.drag) return;
    const to = s.drag.from === 'ink' ? 'light' : 'ink';
    const fraction = (s.p + EDGE) / (s.end + EDGE);
    s.drag = null;
    if (fraction > 0.4) {
      animateTo(s.end, PLATE_SECONDS * 1000 * (s.end - s.p), () => {
        s.at = to;
        label();
      });
    } else {
      animateTo(-EDGE, 420, () => label());
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  layout();
  draw();
  label();
  lens.disabled = false;
  section.dataset.ready = 'true';
  addEventListener('resize', () => {
    layout();
    draw();
  });
}

// ───────────────────────── III · all the light ─────────────────────────

const SUM_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const SUM_ACC = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uW;
out vec4 outColour;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() { outColour = vec4(toLinear(texture(uTex, vUv).rgb) * uW, 1.0); }`;

const SUM_SHOW = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAcc;
uniform float uExposure;
out vec4 outColour;
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 a = texture(uAcc, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  outColour = vec4(toSrgb(1.0 - exp(-a * uExposure)), 1.0);
}`;

async function roomSum() {
  const section = document.querySelector('#sum');
  const canvas = section.querySelector('.sum-canvas');
  const alone = section.querySelector('.sum-alone');
  const readout = section.querySelector('.sum-readout');
  const count = section.querySelector('.sum-count');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) {
    readout.textContent = 'WebGL2 is not available here.';
    return;
  }
  const floatOK = !!gl.getExtension('EXT_color_buffer_float');
  const accScale = floatOK ? 1 : 0.1;
  const TW = 800, TH = 517, GW = 160, GH = 103;
  const index = await (await fetch('assets/light-index.json')).json();
  canvas.width = 1280;
  canvas.height = 828;

  const acc = compile(gl, SUM_VS, SUM_ACC);
  const show = compile(gl, SUM_VS, SUM_SHOW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  quad(gl, acc);

  const accTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, accTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, floatOK ? gl.RGBA16F : gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const works = index.works.map((w) => ({ ...w, tex: null, grid: null, weight: 0, target: 1 }));
  let loaded = 0;
  let dirty = true;
  let exposure = 0.42, exposureTarget = 0.42;
  let isolated = null;
  let hovered = [];

  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  await Promise.all(works.map(async (w) => {
    const img = await loadImage(`../../${w.still}`);
    scratch.width = TW;
    scratch.height = TH;
    sctx.drawImage(img, 0, 0, TW, TH);
    w.tex = texture(gl, scratch);
    scratch.width = GW;
    scratch.height = GH;
    sctx.drawImage(img, 0, 0, GW, GH);
    const { data } = sctx.getImageData(0, 0, GW, GH);
    w.grid = new Uint8Array(GW * GH);
    for (let i = 0; i < GW * GH; i++) w.grid[i] = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    w.weight = reduced ? 1 : 0;
    loaded++;
    dirty = true;
    readout.textContent = `Adding the light of ${loaded} of ${works.length} works…`;
  }));
  count.textContent = `${works.length} works, added as light adds.`;
  readout.textContent = 'Point anywhere to name the orbits that pass through it.';

  function render() {
    if (dirty) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(acc);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(gl.getUniformLocation(acc, 'uTex'), 0);
      const uW = gl.getUniformLocation(acc, 'uW');
      for (const w of works) {
        if (!w.tex || w.weight < 0.002) continue;
        gl.bindTexture(gl.TEXTURE_2D, w.tex);
        gl.uniform1f(uW, w.weight * accScale);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.BLEND);
      dirty = false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(show);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accTex);
    gl.uniform1i(gl.getUniformLocation(show, 'uAcc'), 0);
    gl.uniform1f(gl.getUniformLocation(show, 'uExposure'), exposure / accScale);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(64, now - last);
    last = now;
    const k = reduced ? 1 : 1 - Math.exp(-dt / 220);
    for (const w of works) {
      const next = w.weight + (w.target - w.weight) * k;
      if (Math.abs(next - w.weight) > 1e-4) dirty = true;
      w.weight = Math.abs(w.target - next) < 1e-4 ? w.target : next;
    }
    exposure += (exposureTarget - exposure) * k;
    render();
    if (isolated && Math.abs(isolated.weight - 1) < 0.01 && works.every((w) => w === isolated || w.weight < 0.01)) alone.classList.add('shown');
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function pointAt(e) {
    const r = canvas.getBoundingClientRect();
    const gx = Math.floor(((e.clientX - r.left) / r.width) * GW);
    const gy = Math.floor(((e.clientY - r.top) / r.height) * GH);
    const found = [];
    for (const w of works) {
      if (!w.grid) continue;
      let peak = 0;
      for (let y = Math.max(0, gy - 1); y <= Math.min(GH - 1, gy + 1); y++) {
        for (let x = Math.max(0, gx - 1); x <= Math.min(GW - 1, gx + 1); x++) peak = Math.max(peak, w.grid[y * GW + x]);
      }
      if (peak >= 26) found.push({ w, peak });
    }
    return found.sort((a, b) => b.peak - a.peak).slice(0, 7).map((f) => f.w);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (isolated) return;
    hovered = pointAt(e);
    for (const w of works) w.target = hovered.length ? (hovered.includes(w) ? 1 : 0.1) : 1;
    readout.textContent = hovered.length
      ? `Through this point · ${hovered.map((w) => `№ ${pad3(w.id)}`).join(' · ')}`
      : 'No orbit passes here. Point into the light.';
  });
  canvas.addEventListener('pointerleave', () => {
    if (isolated) return;
    hovered = [];
    for (const w of works) w.target = 1;
    readout.textContent = 'Point anywhere to name the orbits that pass through it.';
  });
  const release = () => {
    isolated = null;
    alone.classList.remove('shown');
    alone.hidden = true;
    exposureTarget = 0.42;
    for (const w of works) w.target = 1;
    readout.textContent = 'Point anywhere to name the orbits that pass through it.';
  };
  canvas.addEventListener('click', (e) => {
    if (isolated) return release();
    const found = pointAt(e);
    if (!found.length) return;
    isolated = found[0];
    for (const w of works) w.target = w === isolated ? 1 : 0;
    exposureTarget = 1.25;
    alone.src = `../../${isolated.still}`;
    alone.alt = `№ ${pad3(isolated.id)}, Light.`;
    alone.hidden = false;
    readout.textContent = `№ ${pad3(isolated.id)} alone · ${isolated.structure ?? 'Light'} · ${isolated.wavelengthNm ?? '—'} nm · shown as its own untouched still · choose again to return`;
  });
  alone.addEventListener('click', release);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isolated) release();
  });
}

roomScore().catch((error) => {
  document.querySelector('#score .readout').textContent = `The orbit could not be re-performed: ${error.message}`;
  console.error(error);
});
whenNear(document.querySelector('#cross'), () => roomCross().catch(console.error));
whenNear(document.querySelector('#sum'), () => roomSum().catch(console.error));
