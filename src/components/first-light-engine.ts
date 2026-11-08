import type { Lens } from '@/lib/first-light/camera';
import type { PlateSpace } from '@/lib/first-light/samples';

/*
  First Light's light engine (docs/first-light.md §7): the window's trails as ribbons of light,
  accumulated in linear light in a half-float target, with a glow, then tone mapped onto the stage.

  - Each trail takes its colour from the still itself, at the place on the plate its light came to
    rest. The live light therefore carries the work's own hues into depth, and lands on them again.
  - Points live in float textures, fetched by vertex index. Nothing about the orbit is computed
    here; samples.ts has done that, exactly.
  - A browser without WebGL 2 gets no engine. The still simply stays.
*/

const POINTS_WIDTH = 4096;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/** Shared by the trail and the bodies: a plate-space point at a fractional sample, carried and seen. */
const PLACE = `
uniform sampler2D uPoints;
uniform sampler2D uDrift;
uniform int uCount;
uniform float uDriftWeight;
uniform mat3 uRotation;
uniform vec2 uInvHalf;
uniform float uInverseDistance;
uniform vec3 uFocus;
uniform vec2 uOffset;
uniform vec2 uViewport;
uniform mat2 uCopy;
uniform float uCopyScale;
uniform vec2 uPlate;

ivec2 texel(int i) { return ivec2(i % ${POINTS_WIDTH}, i / ${POINTS_WIDTH}); }

vec3 rawPoint(int node, int body) {
  return texelFetch(uPoints, texel(node * 3 + body), 0).xyz;
}
vec3 rawDrift(int node) {
  return texelFetch(uDrift, texel(node), 0).xyz;
}

// The point at a fractional sample, drifted by the given weight, in the symmetry copy.
vec3 placed(float at, int body, float driftWeight) {
  float clamped = clamp(at, 0.0, float(uCount - 1));
  int lower = int(floor(clamped));
  int upper = min(lower + 1, uCount - 1);
  float t = clamped - float(lower);
  vec3 p = mix(rawPoint(lower, body), rawPoint(upper, body), t);
  vec3 d = mix(rawDrift(lower), rawDrift(upper), t);
  p += d * driftWeight;
  return vec3(uCopy * p.xy, p.z * uCopyScale);
}

// Device pixels from the stage's centre, and the swelling with nearness.
vec3 seen(vec3 p) {
  vec3 q = uRotation * (p - uFocus);
  float w = 1.0 - q.z * uInverseDistance;
  return vec3((q.xy * uInvHalf / w + uOffset) * 0.5 * uViewport, 1.0 / w);
}
`;

const TRAIL_VERTEX = `${HEADER}${PLACE}
uniform sampler2D uStill;
uniform float uColourLod;
uniform int uBody;
uniform float uHead;
uniform float uHeads;
uniform float uHeadSpan;
uniform float uWidth;
out vec3 vColour;
out float vAcross;
out float vBright;

void main() {
  // 'sample' is a reserved word in GLSL ES 3.00: each pair of vertices is a node of the trail.
  int node = gl_VertexID >> 1;
  float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  float at = min(float(node), uHead);
  vec3 here = seen(placed(at, uBody, uDriftWeight));
  vec3 before = seen(placed(max(at - 1.0, 0.0), uBody, uDriftWeight));
  vec3 after = seen(placed(min(at + 1.0, uHead), uBody, uDriftWeight));
  vec2 along = after.xy - before.xy;
  float length2 = dot(along, along);
  along = length2 > 1e-8 ? along * inversesqrt(length2) : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float width = clamp(uWidth * here.z, uWidth * 0.5, uWidth * 3.0);
  vec2 position = here.xy + across * side * width * 0.5;
  gl_Position = vec4(position / (0.5 * uViewport), 0.0, 1.0);
  vAcross = side;

  // The still's light where this point came to rest on the plate: its hue, at full strength.
  vec3 rest = placed(at, uBody, 1.0);
  vec2 uv = (rest.xy + 0.5 * uPlate) / uPlate;
  vec3 still = pow(textureLod(uStill, uv, uColourLod).rgb, vec3(2.2));
  float strongest = max(max(still.r, still.g), still.b);
  vColour = strongest > 0.004 ? still / strongest : vec3(1.0, 0.93, 0.86);
  float behind = max(uHead - at, 0.0);
  // Light farther from the eye is dimmer, nearer brighter: depth read as light falls off.
  // Flat, every point is at the centre plane's distance and nothing changes.
  float depth = clamp(here.z * here.z, 0.35, 1.6);
  vBright = (1.0 + uHeads * 2.6 * exp(-behind / uHeadSpan)) * depth;
}`;

const TRAIL_FRAGMENT = `${HEADER}
uniform float uIntensity;
in vec3 vColour;
in float vAcross;
in float vBright;
out vec4 colour;
void main() {
  float core = exp(-3.2 * vAcross * vAcross);
  colour = vec4(vColour * uIntensity * vBright * core, 1.0);
}`;

const BODY_VERTEX = `${HEADER}${PLACE}
uniform float uHead;
uniform float uBodySize;
uniform float uFlare;
out vec2 vOffset;
const vec2 CORNERS[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
  vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0)
);
void main() {
  vec3 here = seen(placed(uHead, gl_InstanceID, uDriftWeight));
  vec2 corner = CORNERS[gl_VertexID];
  float size = uBodySize * clamp(here.z, 0.5, 3.0) * (1.0 + 0.8 * uFlare);
  gl_Position = vec4((here.xy + corner * size) / (0.5 * uViewport), 0.0, 1.0);
  vOffset = corner;
}`;

const BODY_FRAGMENT = `${HEADER}
uniform float uBodies;
uniform float uFlare;
in vec2 vOffset;
out vec4 colour;
void main() {
  float r2 = dot(vOffset, vOffset);
  float glare = exp(-r2 * 9.0) * 6.0 + exp(-r2 * 2.2) * 0.9;
  colour = vec4(vec3(1.0, 0.96, 0.9) * glare * uBodies * (1.0 + 2.5 * uFlare), 1.0);
}`;

const SCREEN_VERTEX = `${HEADER}
out vec2 vUv;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const BLUR_FRAGMENT = `${HEADER}
uniform sampler2D uSource;
uniform vec2 uStep;
uniform float uLod;
in vec2 vUv;
out vec4 colour;
void main() {
  vec3 sum = textureLod(uSource, vUv, uLod).rgb * 0.227027;
  sum += textureLod(uSource, vUv + uStep * 1.384615, uLod).rgb * 0.316216;
  sum += textureLod(uSource, vUv - uStep * 1.384615, uLod).rgb * 0.316216;
  sum += textureLod(uSource, vUv + uStep * 3.230769, uLod).rgb * 0.070270;
  sum += textureLod(uSource, vUv - uStep * 3.230769, uLod).rgb * 0.070270;
  colour = vec4(sum, 1.0);
}`;

const COMPOSITE_FRAGMENT = `${HEADER}
uniform sampler2D uLight;
uniform sampler2D uGlow;
uniform float uGlowStrength;
uniform float uExposure;
in vec2 vUv;
out vec4 colour;
void main() {
  vec3 light = textureLod(uLight, vUv, 0.0).rgb + texture(uGlow, vUv).rgb * uGlowStrength;
  vec3 mapped = 1.0 - exp(-light * uExposure);
  colour = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
}`;

/** One moment, as the engine draws it. */
export interface Exposure {
  lens: Lens;
  /** How much of the generator's camera drift the points carry, 0 to 1. */
  drift: number;
  /** The share of the window drawn, 0 to 1. */
  drawn: number;
  /** How brightly the heads burn, and how visible the bodies are, 0 to 1. */
  heads: number;
  /** The closest approach's flare, 0 to 1. */
  flare: number;
}

/** How the light is set: tuned by eye against the stills. */
export interface Look {
  intensity: number;
  width: number;
  glow: number;
  exposure: number;
  bodySize: number;
}

export const LOOK: Look = { intensity: 0.5, width: 1.7, glow: 0.65, exposure: 1.35, bodySize: 10 };

/**
 * What a show needs of an engine, whichever draws it: WebGL 2 here, or WebGPU where the screen
 * can show light brighter than its white (first-light-engines.ts).
 */
export interface Engine {
  /** The context is gone: the show gives the still back. */
  readonly lost: boolean;
  look: Look;
  /** The window to draw, and the still whose light colours it. */
  setScene(space: PlateSpace, still: TexImageSource): void;
  /** The drawing buffer for the canvas's CSS size, at up to twice the CSS pixels. */
  resize(width: number, height: number, ratio: number): void;
  /** One moment of the performance, on the canvas. */
  draw(exposure: Exposure): void;
  dispose(): void;
}

type Program = { program: WebGLProgram; uniform: (name: string) => WebGLUniformLocation | null };

interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export class LightEngine implements Engine {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly floatTargets: boolean;
  private readonly trail: Program;
  private readonly body: Program;
  private readonly blur: Program;
  private readonly composite: Program;
  private readonly empty: WebGLVertexArrayObject;
  private points: WebGLTexture | null = null;
  private drift: WebGLTexture | null = null;
  private still: WebGLTexture | null = null;
  private space: PlateSpace | null = null;
  private light: Target | null = null;
  private glowA: Target | null = null;
  private glowB: Target | null = null;
  private stillLod = 1.5;
  private headSpan = 200;
  private contextLost = false;
  look: Look = LOOK;

  /** An engine on this canvas, or nothing where WebGL 2 cannot draw it. */
  static create(canvas: HTMLCanvasElement): LightEngine | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try {
      return new LightEngine(canvas, gl);
    } catch (failure) {
      // A driver that cannot compile the light leaves the still on view; say why, for whoever looks.
      console.warn('First Light cannot draw here:', failure);
      return null;
    }
  }

  // Node strips this file's types without transforming it, so no parameter properties here.
  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.floatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.trail = this.link(TRAIL_VERTEX, TRAIL_FRAGMENT);
    this.body = this.link(BODY_VERTEX, BODY_FRAGMENT);
    this.blur = this.link(SCREEN_VERTEX, BLUR_FRAGMENT);
    this.composite = this.link(SCREEN_VERTEX, COMPOSITE_FRAGMENT);
    this.empty = gl.createVertexArray()!;
    canvas.addEventListener('webglcontextlost', this.onLost);
  }

  get lost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  private readonly onLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
  };

  private link(vertex: string, fragment: string): Program {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? 'A shader did not compile');
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'A program did not link');
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      program,
      uniform: (name) => {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
        return cache.get(name)!;
      },
    };
  }

  private floatTexture(values: Float32Array, texels: number): WebGLTexture {
    const gl = this.gl;
    const height = Math.max(1, Math.ceil(texels / POINTS_WIDTH));
    const data = new Float32Array(POINTS_WIDTH * height * 4);
    for (let i = 0; i < texels; i++) {
      data[i * 4] = values[i * 3];
      data[i * 4 + 1] = values[i * 3 + 1];
      data[i * 4 + 2] = values[i * 3 + 2];
    }
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, POINTS_WIDTH, height, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  }

  /** The window to draw, and the still whose light colours it. */
  setScene(space: PlateSpace, still: TexImageSource) {
    const gl = this.gl;
    for (const texture of [this.points, this.drift, this.still])
      if (texture) gl.deleteTexture(texture);
    this.space = space;
    this.points = this.floatTexture(space.points, space.count * 3);
    this.drift = this.floatTexture(space.drift, space.count);
    this.headSpan = Math.max(8, space.count / 40);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, still);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.still = texture;
    // The hue is read from the still at about 320 pixels across: smoothed, never a speck.
    const width =
      'naturalWidth' in still && still.naturalWidth
        ? still.naturalWidth
        : 'width' in still
          ? Number(still.width)
          : 640;
    this.stillLod = Math.max(0, Math.log2(width / 320));
  }

  private target(
    width: number,
    height: number,
    previous: Target | null,
    mipmapped = false,
  ): Target {
    const gl = this.gl;
    if (previous && previous.width === width && previous.height === height) return previous;
    if (previous) {
      gl.deleteFramebuffer(previous.framebuffer);
      gl.deleteTexture(previous.texture);
    }
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (this.floatTargets)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // The light keeps its smaller sizes, so the glow is taken from all of it, not from a sample.
    if (mipmapped) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { framebuffer, texture, width, height };
  }

  /** The canvas's drawing buffer for its CSS size, at up to twice the CSS pixels. */
  resize(width: number, height: number, ratio: number) {
    const scale = Math.min(Math.max(ratio, 1), 2);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.light = this.target(w, h, this.light, true);
    const gw = Math.max(1, Math.round(w / 4));
    const gh = Math.max(1, Math.round(h / 4));
    this.glowA = this.target(gw, gh, this.glowA);
    this.glowB = this.target(gw, gh, this.glowB);
  }

  private place(program: Program, exposure: Exposure, copy: PlateSpace['copies'][number]) {
    const gl = this.gl;
    const space = this.space!;
    const { lens } = exposure;
    gl.uniform1i(program.uniform('uCount'), space.count);
    gl.uniform1f(program.uniform('uDriftWeight'), exposure.drift);
    gl.uniformMatrix3fv(program.uniform('uRotation'), true, lens.rotation);
    gl.uniform2f(program.uniform('uInvHalf'), lens.invHalf[0], lens.invHalf[1]);
    gl.uniform1f(program.uniform('uInverseDistance'), lens.inverseDistance);
    gl.uniform3f(program.uniform('uFocus'), lens.focus[0], lens.focus[1], lens.focus[2]);
    gl.uniform2f(program.uniform('uOffset'), lens.offset[0], lens.offset[1]);
    gl.uniform2f(program.uniform('uViewport'), this.canvas.width, this.canvas.height);
    gl.uniform2f(program.uniform('uPlate'), space.width, space.height);
    const m = copy.mirror ? -1 : 1;
    gl.uniformMatrix2fv(program.uniform('uCopy'), false, [
      m * copy.cos * copy.scale,
      m * copy.sin * copy.scale,
      -copy.sin * copy.scale,
      copy.cos * copy.scale,
    ]);
    gl.uniform1f(program.uniform('uCopyScale'), copy.scale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.points);
    gl.uniform1i(program.uniform('uPoints'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.drift);
    gl.uniform1i(program.uniform('uDrift'), 1);
  }

  /** One moment of the performance, on the canvas. */
  draw(exposure: Exposure) {
    const gl = this.gl;
    const space = this.space;
    if (!space || !this.light || !this.glowA || !this.glowB || this.lost) return;
    const ratio = this.canvas.width / Math.max(1, this.canvas.clientWidth || this.canvas.width);
    const head = Math.min(1, Math.max(0, exposure.drawn)) * (space.count - 1);
    gl.bindVertexArray(this.empty);

    // The light, added up in linear light.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.light.framebuffer);
    gl.viewport(0, 0, this.light.width, this.light.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    const trail = this.trail;
    gl.useProgram(trail.program);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.still);
    gl.uniform1i(trail.uniform('uStill'), 2);
    gl.uniform1f(trail.uniform('uColourLod'), this.stillLod);
    gl.uniform1f(trail.uniform('uHead'), head);
    gl.uniform1f(trail.uniform('uHeads'), exposure.heads);
    gl.uniform1f(trail.uniform('uHeadSpan'), this.headSpan);
    gl.uniform1f(trail.uniform('uWidth'), this.look.width * ratio);
    // Fewer, longer trails on a small stage would pile up: the light follows the stage's scale.
    gl.uniform1f(trail.uniform('uIntensity'), this.look.intensity);
    const vertices = (Math.ceil(head) + 1) * 2;
    for (const copy of space.copies) {
      this.place(trail, exposure, copy);
      for (let body = 0; body < 3; body++) {
        gl.uniform1i(trail.uniform('uBody'), body);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertices);
      }
    }

    if (exposure.heads > 0.001) {
      const body = this.body;
      gl.useProgram(body.program);
      gl.uniform1f(body.uniform('uHead'), head);
      gl.uniform1f(body.uniform('uBodySize'), this.look.bodySize * ratio);
      gl.uniform1f(body.uniform('uFlare'), exposure.flare);
      gl.uniform1f(body.uniform('uBodies'), exposure.heads);
      for (const copy of space.copies) {
        this.place(body, exposure, copy);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 3);
      }
    }
    gl.disable(gl.BLEND);

    // The glow: the light at a quarter of its size, blurred across and down, twice.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.light.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    const blur = this.blur;
    gl.useProgram(blur.program);
    gl.uniform1i(blur.uniform('uSource'), 0);
    const pass = (from: Target, to: Target, x: number, y: number, lod: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer);
      gl.viewport(0, 0, to.width, to.height);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      gl.uniform2f(blur.uniform('uStep'), x / to.width, y / to.height);
      gl.uniform1f(blur.uniform('uLod'), lod);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    pass(this.light, this.glowA, 1, 0, 2);
    pass(this.glowA, this.glowB, 0, 1, 0);
    pass(this.glowB, this.glowA, 2, 0, 0);
    pass(this.glowA, this.glowB, 0, 2, 0);

    // Onto the stage, tone mapped.
    const composite = this.composite;
    gl.useProgram(composite.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.light.texture);
    gl.uniform1i(composite.uniform('uLight'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.glowB.texture);
    gl.uniform1i(composite.uniform('uGlow'), 1);
    gl.uniform1f(composite.uniform('uGlowStrength'), this.look.glow);
    gl.uniform1f(
      composite.uniform('uExposure'),
      this.floatTargets ? this.look.exposure : this.look.exposure * 1.6,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    if (gl.isContextLost()) return;
    for (const texture of [this.points, this.drift, this.still])
      if (texture) gl.deleteTexture(texture);
    for (const target of [this.light, this.glowA, this.glowB]) {
      if (!target) continue;
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    }
    for (const { program } of [this.trail, this.body, this.blur, this.composite])
      gl.deleteProgram(program);
    gl.deleteVertexArray(this.empty);
  }
}
