import { FLOOR, INK_BAND, PAPER_DEPTH, type Rgb, type Toward } from '@/lib/crossing/material';
import { sheetBytes, type Sheet, type Sheets } from '@/lib/crossing/sheet';

/*
  The sheet's painter: one WebGL pass over the whole stage. For every pixel it reads when the
  front reaches it from the sheet (src/lib/crossing/sheet.ts), and paints what the pixel is made
  of as the front passes (src/lib/crossing/material.ts): the two published stills on the work,
  the two grounds beyond it. It knows nothing of the page; arrival-crossing.ts tells it where
  the work lies and where the front stands.

  A painter may also paint `through`: only what the Turn brings, over whatever lies beneath its
  canvas. The viewing room's does (room-crossing.ts): the room sets one expression at a time, and
  what it shows of it (a still at the room's own size, a film still playing, from any host) is
  left to show itself until the front has passed.
*/

/** A number as a GLSL float literal. */
const glsl = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * The fragment shader. Where the browser can say how fast a value changes from pixel to pixel,
 * the front's edge is never thinner than a pixel and a half, however steep the order is there.
 */
const fragment = (derivatives: boolean) => `
${derivatives ? '#extension GL_OES_standard_derivatives : enable' : ''}
precision highp float;
varying vec2 vUv;
uniform sampler2D uInk, uLight, uSheet, uFrame;
uniform vec2 uFrameFor;
uniform vec4 uArt;
uniform vec2 uCanvas;
uniform vec3 uPaper;
// The sheet: its grid, where a canvas pixel falls on it, the span its sixteen bits cover, and
// where the front stands on it.
uniform vec2 uCells;
uniform vec4 uGrid;
uniform vec2 uSpan;
uniform float uFront, uEdge, uTrail, uTowardNight, uShare;
// Painting through: 1 where only what the Turn brings is painted, over what lies beneath.
uniform float uThrough;
// 1 where the Turn brings its ground alone, with nothing yet drawn on it.
uniform float uBare;

float cellTime(vec2 cell) {
  vec4 s = texture2D(uSheet, (cell + 0.5) / uCells);
  return uSpan.x + uSpan.y * (s.r * 65280.0 + s.g * 255.0) / 65535.0;
}

// When the front reaches a canvas pixel: the sheet read between its cells, as sheetTime reads it.
float timeAt(vec2 px) {
  vec2 f = clamp(px * uGrid.xy + uGrid.zw - 0.5, vec2(0.0), uCells - 1.0);
  vec2 i = floor(f);
  vec2 w = f - i;
  vec2 j = min(i + 1.0, uCells - 1.0);
  float top = mix(cellTime(i), cellTime(vec2(j.x, i.y)), w.x);
  float bottom = mix(cellTime(vec2(i.x, j.y)), cellTime(j), w.x);
  return mix(top, bottom, w.y);
}

// The paper beneath the ink: the still itself as deep as the sheet goes, and beneath ink the
// sheet's own tone, reached smoothly across the faintest washes.
vec3 paperBeneath(vec3 ink) {
  vec3 sheet = max(uPaper, vec3(${glsl(FLOOR)}));
  vec3 depth = ink / sheet;
  vec3 under = 1.0 - smoothstep(vec3(${glsl(PAPER_DEPTH - INK_BAND)}), vec3(${glsl(PAPER_DEPTH)}), depth);
  vec3 beneath = sheet * (${glsl(PAPER_DEPTH)} + ${glsl(1 - PAPER_DEPTH)} * under);
  return mix(beneath, ink, step(${glsl(PAPER_DEPTH)}, depth));
}

void main() {
  vec2 q = (vUv - uArt.xy) / uArt.zw;
  vec2 qc = clamp(q, 0.0, 1.0);
  float inside = step(0.0, q.x) * step(0.0, q.y) * step(q.x, 1.0) * step(q.y, 1.0);
  // The film the departing layer is playing lies over its still as the page lays it, at the
  // film's own opacity: x for Ink, y for Light. Beyond the work the sheet is bare.
  vec3 frame = texture2D(uFrame, qc).rgb;
  vec3 ink = mix(uPaper, mix(texture2D(uInk, qc).rgb, frame, uFrameFor.x), inside);
  vec3 light = mix(texture2D(uLight, qc).rgb, frame, uFrameFor.y) * inside;
  // A Turn that brings its ground alone: the night with no light on it, the sheet with no ink.
  if (uBare > 0.5) {
    if (uTowardNight > 0.5) light = vec3(0.0);
    else ink = uPaper;
  }
  // At either end the plate is the published still itself; painted through, the Turn has
  // brought nothing yet at its start, and the canvas is clear.
  if (uShare <= 0.0) {
    gl_FragColor = uThrough > 0.5 ? vec4(0.0) : vec4(uTowardNight > 0.5 ? ink : light, 1.0);
    return;
  }
  if (uShare >= 1.0) {
    gl_FragColor = vec4(uTowardNight > 0.5 ? light : ink, 1.0);
    return;
  }
  float t = timeAt(vUv * uCanvas);
  float edge = ${derivatives ? 'max(uEdge, 0.75 * fwidth(t))' : 'uEdge'};
  // How far the front has passed this pixel, and how far the mark behind it has arrived
  // (passed and arrived, sheet.ts); then what the pixel is made of (matterOf, material.ts).
  float passed = 1.0 - smoothstep(uFront - edge, uFront + edge, t);
  float arrived = smoothstep(0.0, 1.0, (uFront - t) / uTrail);
  // Painted through, the pixel is what the Turn brings alone, as if the front had passed it
  // wholly, and it covers what lies beneath by as much as the front has passed.
  float through = mix(passed, 1.0, uThrough);
  float ground = uTowardNight > 0.5 ? 1.0 - through : through;
  float inkOn = uTowardNight > 0.5 ? 1.0 - through : arrived;
  float lightOn = uTowardNight > 0.5 ? arrived : 1.0 - through;
  // materialPixel: the light lit on the ground as light adds, the ink a transmittance on its paper.
  vec3 bare = paperBeneath(ink);
  vec3 lit = 1.0 - (1.0 - bare * ground) * (1.0 - light * lightOn);
  vec3 transmit = max(ink, vec3(${glsl(FLOOR)})) / max(bare, vec3(${glsl(FLOOR)}));
  float cover = mix(1.0, passed, uThrough);
  gl_FragColor = vec4(lit * pow(transmit, vec3(inkOn)) * cover, cover);
}`;

const UNIFORMS = [
  'uInk',
  'uLight',
  'uSheet',
  'uFrame',
  'uFrameFor',
  'uArt',
  'uCanvas',
  'uPaper',
  'uCells',
  'uGrid',
  'uSpan',
  'uFront',
  'uEdge',
  'uTrail',
  'uTowardNight',
  'uShare',
  'uThrough',
  'uBare',
] as const;
type Uniform = (typeof UNIFORMS)[number];
/** Texture units, in the order the samplers are bound: each ground's sheet has its own. */
const UNITS = { ink: 0, light: 1, night: 2, paper: 3, frame: 4 } as const;

/**
 * The canvas's context. The drawing buffer is kept: a repaint that comes without a new frame (a
 * snapshot, a print, an engine that paints the canvas outside its compositor) shows the last
 * frame painted, never a cleared one. A canvas painted through is clear where nothing has been
 * brought, and its colours are given already multiplied by how much they cover.
 */
function context(canvas: HTMLCanvasElement, through: boolean) {
  return canvas.getContext('webgl', {
    alpha: through,
    antialias: false,
    premultipliedAlpha: through,
    preserveDrawingBuffer: true,
  });
}

/** One frame of the stage. */
export interface StageFrame {
  /** The ground the Turn brings, and the sheet that orders it. */
  toward: Toward;
  sheet: Sheet;
  /** Where the front stands, and how far the Turn has come: 0 and 1 paint a still itself. */
  front: number;
  share: number;
  edge: number;
  trail: number;
  /** The canvas's own pixels to one pixel of the sheet's region. */
  ratio: number;
  /** The work on the canvas, in the canvas's own pixels. */
  art: { x: number; y: number; width: number; height: number };
  /** The sheet's own tone: the paper wall beyond the work. */
  paper: Rgb;
  /** The layer the Turn leaves, and how much of it its playing film is (0 on its still). */
  leaving: 'ink' | 'light';
  film: number;
  /**
   * The Turn brings its ground alone, with nothing drawn on it yet: the room's, when the film of
   * the expression arriving is about to begin there.
   */
  bare?: boolean;
}

export class SheetPainter {
  private readonly uniforms: Partial<Record<Uniform, WebGLUniformLocation | null>>;
  private readonly textures: Record<keyof typeof UNITS, WebGLTexture | null>;

  private constructor(
    private readonly gl: WebGLRenderingContext,
    private readonly program: WebGLProgram,
    private readonly buffer: WebGLBuffer | null,
    private readonly through: boolean,
  ) {
    // Looked up once: every frame sets its values by these locations.
    this.uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    this.textures = {
      ink: this.texture(UNITS.ink),
      light: this.texture(UNITS.light),
      night: this.texture(UNITS.night),
      paper: this.texture(UNITS.paper),
      frame: this.texture(UNITS.frame),
    };
    gl.uniform1i(this.uniforms.uInk ?? null, UNITS.ink);
    gl.uniform1i(this.uniforms.uLight ?? null, UNITS.light);
    gl.uniform1i(this.uniforms.uFrame ?? null, UNITS.frame);
  }

  /** Whether this browser gives the canvas a context to paint with, asked before anything is loaded. */
  static offered(canvas: HTMLCanvasElement, through = false) {
    const gl = context(canvas, through);
    return !!gl && !gl.isContextLost();
  }

  /**
   * A painter on this canvas, or null where the browser cannot give it one (no WebGL, a lost
   * context, a program it refuses). `through` paints only what a Turn brings, over what lies
   * beneath the canvas; a canvas is asked the same way every time.
   */
  static on(canvas: HTMLCanvasElement, through = false): SheetPainter | null {
    const gl = context(canvas, through);
    if (!gl || gl.isContextLost()) return null;
    const program = gl.createProgram();
    if (!program) return null;
    const derivatives = !!gl.getExtension('OES_standard_derivatives');
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment(derivatives)],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
      gl.attachShader(program, shader);
      // The program keeps the compiled code; the shader object itself is no longer needed.
      gl.deleteShader(shader);
      if (!compiled) {
        gl.deleteProgram(program);
        return null;
      }
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    gl.useProgram(program);
    // Each pixel is written as computed, so a still painted at either end of a Turn is its own.
    gl.disable(gl.DITHER);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    return new SheetPainter(gl, program, buffer, through);
  }

  get lost() {
    return this.gl.isContextLost();
  }

  /** A texture on its unit, one black pixel until it is given something. */
  private texture(unit: number) {
    const { gl } = this;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  /** A picture on its unit, in the colours the browser would paint it in. */
  private picture(unit: keyof typeof UNITS, source: TexImageSource) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + UNITS[unit]);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[unit]);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  /** The two published stills, uploaded once: the textures are the painter's own copies. */
  stills(ink: TexImageSource, light: TexImageSource) {
    this.picture('ink', ink);
    this.picture('light', light);
  }

  /** One expression's still alone: a painter that paints through needs only the one a Turn brings. */
  still(expression: 'ink' | 'light', source: TexImageSource) {
    this.picture(expression, source);
  }

  /** The two sheets for a layout: read cell by cell, never smoothed by the GPU. */
  lay(sheets: Sheets) {
    const { gl } = this;
    for (const toward of ['night', 'paper'] as const) {
      const sheet = sheets[toward];
      gl.activeTexture(gl.TEXTURE0 + UNITS[toward]);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[toward]);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        sheet.cols,
        sheet.rows,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        sheetBytes(sheet),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
  }

  /** The frame a film is showing; false where this canvas may not read it. */
  film(video: HTMLVideoElement) {
    try {
      this.picture('frame', video);
      return true;
    } catch {
      return false;
    }
  }

  /** Paint one frame on a drawing buffer of this size. */
  paint(frame: StageFrame, width: number, height: number) {
    const { gl, uniforms } = this;
    const { sheet } = frame;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniforms.uCanvas ?? null, width, height);
    gl.uniform3f(uniforms.uPaper ?? null, frame.paper[0], frame.paper[1], frame.paper[2]);
    gl.uniform4f(
      uniforms.uArt ?? null,
      frame.art.x / width,
      frame.art.y / height,
      frame.art.width / width,
      frame.art.height / height,
    );
    gl.uniform2f(
      uniforms.uFrameFor ?? null,
      frame.leaving === 'ink' ? frame.film : 0,
      frame.leaving === 'light' ? frame.film : 0,
    );
    gl.uniform1i(uniforms.uSheet ?? null, UNITS[frame.toward]);
    gl.uniform2f(uniforms.uCells ?? null, sheet.cols, sheet.rows);
    // A canvas pixel's place on the sheet's grid: the canvas begins at the stage's own corner,
    // and the region may begin above it.
    gl.uniform4f(
      uniforms.uGrid ?? null,
      1 / (frame.ratio * sheet.cell),
      1 / (frame.ratio * sheet.cell),
      -sheet.region.x / sheet.cell,
      -sheet.region.y / sheet.cell,
    );
    gl.uniform2f(uniforms.uSpan ?? null, sheet.first, sheet.last - sheet.first);
    gl.uniform1f(uniforms.uFront ?? null, frame.front);
    gl.uniform1f(uniforms.uEdge ?? null, frame.edge);
    gl.uniform1f(uniforms.uTrail ?? null, frame.trail);
    gl.uniform1f(uniforms.uTowardNight ?? null, frame.toward === 'night' ? 1 : 0);
    gl.uniform1f(uniforms.uShare ?? null, frame.share);
    gl.uniform1f(uniforms.uThrough ?? null, this.through ? 1 : 0);
    gl.uniform1f(uniforms.uBare ?? null, frame.bare ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Give back what the painter made, but keep the context: the canvas outlives it, and a
   * context lost on purpose would stay lost for the next painter.
   */
  dispose() {
    const { gl } = this;
    if (gl.isContextLost()) return;
    for (const texture of Object.values(this.textures)) if (texture) gl.deleteTexture(texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
  }
}
