import type { PlateSpace } from '@/lib/first-light/samples';
import { LOOK, type Engine, type Exposure, type Look } from './first-light-engine';

/*
  First Light's light engine in WebGPU (docs/first-light.md §5B, §7): the WebGL 2 engine's light,
  on a canvas whose range reaches past the page's white.

  - The maths is the WebGL engine's, shader for shader, with the same uniforms and the same Look:
    ribbons pulled from the samples by vertex index, coloured by the still where their light came
    to rest, added up in a half-float target, with a glow from the light at a quarter of its size.
  - Only the tone map differs. Up to its knee it is the WebGL engine's curve, so in standard range
    the two engines show the same light. Past it the brightest light (the bodies, the flare, the
    densest crossings) rises above the page's white, toward HEADROOM times as bright.
  - A browser that cannot give it a device, a context or an extended-range canvas gets no engine
    here, and the WebGL engine draws instead (first-light-engines.ts).
*/

/** Where the light leaves the WebGL engine's curve: a share of the page's white, in linear light. */
export const KNEE = 0.8;
/** How far past the page's white the brightest light may rise, in linear light. */
export const HEADROOM = 4;

/**
 * The tone map, channel by channel, as the composite shader has it: the WebGL engine's 1 − e^−x up
 * to the knee, then a shoulder that leaves the knee at the curve's own slope and rises toward the
 * headroom without reaching it. Linear light in and out, the page's white at 1; the shader then
 * encodes it with the WebGL engine's 2.2 gamma.
 */
export function toneMap(exposed: number): number {
  const kneeAt = -Math.log(1 - KNEE);
  if (exposed <= kneeAt) return 1 - Math.exp(-exposed);
  const rate = (1 - KNEE) / (HEADROOM - KNEE);
  return HEADROOM - (HEADROOM - KNEE) * Math.exp((kneeAt - exposed) * rate);
}

/**
 * The still's colours are read from a copy this wide, at its own size, where the WebGL engine reads
 * its smaller sizes at this width: WebGPU makes no smaller sizes of a texture.
 */
const COLOUR_WIDTH = 520;
const LIGHT_FORMAT = 'rgba16float';

/** A number as a WGSL float literal. */
const float = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/** The trails and the bodies, added up in linear light: TRAIL_VERTEX and its company in WGSL. */
const LIGHT_SHADER = /* wgsl */ `
struct Frame {
  rotation: mat3x3f,
  focus: vec3f,
  inverseDistance: f32,
  invHalf: vec2f,
  offset: vec2f,
  viewport: vec2f,
  plate: vec2f,
  count: i32,
  driftWeight: f32,
  head: f32,
  heads: f32,
  headSpan: f32,
  width: f32,
  intensity: f32,
  bodySize: f32,
  flare: f32,
  bodies: f32,
}

struct Copy {
  matrix: mat2x2f,
  scale: f32,
}

@group(0) @binding(0) var<uniform> frame: Frame;
// Each sample's three bodies, and each sample's drift: x, y and z, in plate pixels.
@group(0) @binding(1) var<storage, read> points: array<f32>;
@group(0) @binding(2) var<storage, read> drift: array<f32>;
// Two rows per symmetry copy: its matrix's columns, then its scale in depth.
@group(0) @binding(3) var<storage, read> copies: array<vec4f>;
@group(0) @binding(4) var colours: texture_2d<f32>;
@group(0) @binding(5) var bilinear: sampler;

fn copyAt(index: u32) -> Copy {
  let columns = copies[index * 2u];
  return Copy(mat2x2f(columns.xy, columns.zw), copies[index * 2u + 1u].x);
}

fn rawPoint(node: i32, body: i32) -> vec3f {
  let i = (node * 3 + body) * 3;
  return vec3f(points[i], points[i + 1], points[i + 2]);
}

fn rawDrift(node: i32) -> vec3f {
  let i = node * 3;
  return vec3f(drift[i], drift[i + 1], drift[i + 2]);
}

// The point at a fractional sample, drifted by the given weight, in the symmetry copy.
fn placed(at: f32, body: i32, driftWeight: f32, copy: Copy) -> vec3f {
  let clamped = clamp(at, 0.0, f32(frame.count - 1));
  let lower = i32(floor(clamped));
  let upper = min(lower + 1, frame.count - 1);
  let t = clamped - f32(lower);
  var p = mix(rawPoint(lower, body), rawPoint(upper, body), t);
  let d = mix(rawDrift(lower), rawDrift(upper), t);
  p += d * driftWeight;
  return vec3f(copy.matrix * p.xy, p.z * copy.scale);
}

// Device pixels from the stage's centre, and the swelling with nearness.
fn seen(p: vec3f) -> vec3f {
  let q = frame.rotation * (p - frame.focus);
  let w = 1.0 - q.z * frame.inverseDistance;
  return vec3f((q.xy * frame.invHalf / w + frame.offset) * 0.5 * frame.viewport, 1.0 / w);
}

struct Trail {
  @builtin(position) clip: vec4f,
  @location(0) colour: vec3f,
  @location(1) across: f32,
  @location(2) bright: f32,
}

// Each instance is one body's trail in one symmetry copy; each pair of vertices is a node of it.
@vertex
fn trailVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Trail {
  let body = i32(instance % 3u);
  let copy = copyAt(instance / 3u);
  let node = vertex >> 1u;
  let side = select(1.0, -1.0, (vertex & 1u) == 0u);
  let at = min(f32(node), frame.head);
  let here = seen(placed(at, body, frame.driftWeight, copy));
  let before = seen(placed(max(at - 1.0, 0.0), body, frame.driftWeight, copy));
  let after = seen(placed(min(at + 1.0, frame.head), body, frame.driftWeight, copy));
  var along = after.xy - before.xy;
  let length2 = dot(along, along);
  along = select(vec2f(1.0, 0.0), along * inverseSqrt(length2), length2 > 1e-8);
  let across = vec2f(-along.y, along.x);
  let width = clamp(frame.width * here.z, frame.width * 0.5, frame.width * 3.0);
  let point = here.xy + across * side * width * 0.5;
  var trail: Trail;
  trail.clip = vec4f(point / (0.5 * frame.viewport), 0.0, 1.0);
  trail.across = side;

  // The still's light where this point came to rest on the plate: its hue, at full strength.
  let rest = placed(at, body, 1.0, copy);
  let uv = (rest.xy + 0.5 * frame.plate) / frame.plate;
  let still = pow(textureSampleLevel(colours, bilinear, uv, 0.0).rgb, vec3f(2.2));
  let strongest = max(max(still.r, still.g), still.b);
  let hue = select(vec3f(1.0, 0.93, 0.86), still / strongest, strongest > 0.004);
  // Reading the still at a smaller size blends a trail's hue with its neighbours'; a little of
  // the chroma that blending takes is given back, about the hue's own luminance.
  let luminance = dot(hue, vec3f(0.2126, 0.7152, 0.0722));
  trail.colour = max(mix(vec3f(luminance), hue, 1.25), vec3f(0.0));
  let behind = max(frame.head - at, 0.0);
  // Light farther from the eye is dimmer, nearer brighter: depth read as light falls off.
  // Flat, every point is at the centre plane's distance and nothing changes.
  let depth = clamp(here.z * here.z, 0.35, 1.6);
  trail.bright = (1.0 + frame.heads * 2.6 * exp(-behind / frame.headSpan)) * depth;
  return trail;
}

@fragment
fn trailFragment(
  @location(0) colour: vec3f,
  @location(1) across: f32,
  @location(2) bright: f32,
) -> @location(0) vec4f {
  let core = exp(-3.2 * across * across);
  return vec4f(colour * frame.intensity * bright * core, 1.0);
}

struct Body {
  @builtin(position) clip: vec4f,
  @location(0) offset: vec2f,
}

// Each instance is one body in one symmetry copy: a square of glare about its head.
@vertex
fn bodyVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Body {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let here = seen(placed(frame.head, i32(instance % 3u), frame.driftWeight, copyAt(instance / 3u)));
  let corner = corners[vertex];
  let size = frame.bodySize * clamp(here.z, 0.5, 3.0) * (1.0 + 0.8 * frame.flare);
  var body: Body;
  body.clip = vec4f((here.xy + corner * size) / (0.5 * frame.viewport), 0.0, 1.0);
  body.offset = corner;
  return body;
}

@fragment
fn bodyFragment(@location(0) offset: vec2f) -> @location(0) vec4f {
  let r2 = dot(offset, offset);
  let glare = exp(-r2 * 9.0) * 6.0 + exp(-r2 * 2.2) * 0.9;
  return vec4f(vec3f(1.0, 0.96, 0.9) * glare * frame.bodies * (1.0 + 2.5 * frame.flare), 1.0);
}
`;

/** The glow and the stage: full-screen passes over the light. */
const SCREEN_SHADER = /* wgsl */ `
struct Screen {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var bilinear: sampler;
// The blur's step between taps, in texture coordinates.
@group(0) @binding(2) var<uniform> spacing: vec4f;
@group(0) @binding(3) var glow: texture_2d<f32>;
// The glow's strength and the exposure, as the Look sets them.
@group(0) @binding(4) var<uniform> stage: vec4f;

const KNEE: f32 = ${float(KNEE)};
const HEADROOM: f32 = ${float(HEADROOM)};

@vertex
fn screenVertex(@builtin(vertex_index) vertex: u32) -> Screen {
  let corner = vec2f(f32((vertex << 1u) & 2u), f32(vertex & 2u));
  var screen: Screen;
  screen.clip = vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
  // A texture's rows run down its target, where clip space runs up.
  screen.uv = vec2f(corner.x, 1.0 - corner.y);
  return screen;
}

// The light at a quarter of its size: four bilinear taps, each the mean of a 2 × 2 block, make
// the mean of the 4 × 4 block about each texel, as the WebGL engine's smaller sizes are made.
@fragment
fn quarterFragment(@location(0) uv: vec2f) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  var sum = textureSampleLevel(source, bilinear, uv + texel * vec2f(-1.0, -1.0), 0.0).rgb;
  sum += textureSampleLevel(source, bilinear, uv + texel * vec2f(1.0, -1.0), 0.0).rgb;
  sum += textureSampleLevel(source, bilinear, uv + texel * vec2f(-1.0, 1.0), 0.0).rgb;
  sum += textureSampleLevel(source, bilinear, uv + texel * vec2f(1.0, 1.0), 0.0).rgb;
  return vec4f(sum * 0.25, 1.0);
}

@fragment
fn blurFragment(@location(0) uv: vec2f) -> @location(0) vec4f {
  var sum = textureSampleLevel(source, bilinear, uv, 0.0).rgb * 0.227027;
  sum += textureSampleLevel(source, bilinear, uv + spacing.xy * 1.384615, 0.0).rgb * 0.316216;
  sum += textureSampleLevel(source, bilinear, uv - spacing.xy * 1.384615, 0.0).rgb * 0.316216;
  sum += textureSampleLevel(source, bilinear, uv + spacing.xy * 3.230769, 0.0).rgb * 0.070270;
  sum += textureSampleLevel(source, bilinear, uv - spacing.xy * 3.230769, 0.0).rgb * 0.070270;
  return vec4f(sum, 1.0);
}

// The tone map (toneMap in first-light-gpu.ts): the WebGL engine's 1 − e^−x up to the knee, then
// a shoulder at the curve's own slope that rises toward the headroom.
fn toneMap(exposed: vec3f) -> vec3f {
  let kneeAt = -log(1.0 - KNEE);
  let rate = (1.0 - KNEE) / (HEADROOM - KNEE);
  let shoulder = HEADROOM - (HEADROOM - KNEE) * exp((kneeAt - exposed) * rate);
  return select(1.0 - exp(-exposed), shoulder, exposed > vec3f(kneeAt));
}

@fragment
fn compositeFragment(@builtin(position) pixel: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let glowing = textureSampleLevel(glow, bilinear, uv, 0.0).rgb * stage.x;
  let light = textureLoad(source, vec2i(pixel.xy), 0).rgb + glowing;
  return vec4f(pow(toneMap(light * stage.y), vec3f(1.0 / 2.2)), 1.0);
}
`;

/*
  WebGPU, as far as this engine uses it. TypeScript's DOM library does not describe it yet (5.9),
  and the venue takes no dependency for its types. The flags are the specification's own numbers.
*/
const BUFFER = { COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80 } as const;
const TEXTURE = { COPY_DST: 0x2, TEXTURE_BINDING: 0x4, RENDER_ATTACHMENT: 0x10 } as const;
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2 } as const;

interface GPUObject {
  label: string;
}
interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}
interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}
interface GPUBuffer extends GPUObject {
  destroy(): void;
}
interface GPUTexture extends GPUObject {
  readonly width: number;
  readonly height: number;
  createView(): GPUObject;
  destroy(): void;
}
interface GPUShaderModule extends GPUObject {
  getCompilationInfo(): Promise<{ messages: readonly GPUMessage[] }>;
}
interface GPUMessage {
  type: 'error' | 'warning' | 'info';
  message: string;
  lineNum: number;
}
interface GPURenderPipeline extends GPUObject {
  getBindGroupLayout(index: number): GPUObject;
}
interface GPURenderPass {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, group: GPUObject): void;
  draw(vertices: number, instances?: number): void;
  end(): void;
}
interface GPUCommandEncoder {
  beginRenderPass(descriptor: { colorAttachments: GPUColourAttachment[] }): GPURenderPass;
  finish(): GPUObject;
}
interface GPUColourAttachment {
  view: GPUObject;
  loadOp: 'clear';
  storeOp: 'store';
  clearValue: { r: number; g: number; b: number; a: number };
}
interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, offset: number, data: ArrayBufferView): void;
  submit(commands: GPUObject[]): void;
  copyExternalImageToTexture(
    source: { source: ImageBitmap },
    destination: { texture: GPUTexture },
    size: [number, number],
  ): void;
}
type GPUBlend = { srcFactor: 'one'; dstFactor: 'one'; operation: 'add' };
interface GPUPipelineDescriptor {
  layout: GPUObject | 'auto';
  vertex: { module: GPUShaderModule; entryPoint: string };
  fragment: {
    module: GPUShaderModule;
    entryPoint: string;
    targets: { format: string; blend?: { color: GPUBlend; alpha: GPUBlend } }[];
  };
  primitive: { topology: 'triangle-list' | 'triangle-strip' };
}
type GPULayoutEntry = { binding: number; visibility: number } & (
  | { buffer: { type: 'uniform' | 'read-only-storage' } }
  | { texture: { sampleType: 'float' } }
  | { sampler: { type: 'filtering' } }
);
type GPUResource = GPUObject | { buffer: GPUBuffer };
interface GPUDevice extends EventTarget {
  readonly queue: GPUQueue;
  readonly lost: Promise<{ reason: string; message: string }>;
  createBuffer(descriptor: { size: number; usage: number }): GPUBuffer;
  createTexture(descriptor: { size: [number, number]; format: string; usage: number }): GPUTexture;
  createSampler(descriptor: { magFilter: 'linear'; minFilter: 'linear' }): GPUObject;
  createShaderModule(descriptor: { code: string }): GPUShaderModule;
  createBindGroupLayout(descriptor: { entries: GPULayoutEntry[] }): GPUObject;
  createPipelineLayout(descriptor: { bindGroupLayouts: GPUObject[] }): GPUObject;
  createRenderPipelineAsync(descriptor: GPUPipelineDescriptor): Promise<GPURenderPipeline>;
  createBindGroup(descriptor: {
    layout: GPUObject;
    entries: { binding: number; resource: GPUResource }[];
  }): GPUObject;
  createCommandEncoder(): GPUCommandEncoder;
  pushErrorScope(filter: 'validation'): void;
  popErrorScope(): Promise<GPUError | null>;
  destroy(): void;
}
interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: typeof LIGHT_FORMAT;
  alphaMode: 'opaque';
  toneMapping: { mode: 'extended' };
}
interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  unconfigure(): void;
  getCurrentTexture(): GPUTexture;
}

/** The stage's canvas: half floats, light past the page's white where the screen has it, opaque. */
function configuration(device: GPUDevice): GPUCanvasConfiguration {
  return { device, format: LIGHT_FORMAT, alphaMode: 'opaque', toneMapping: { mode: 'extended' } };
}

function webgpuOf(canvas: HTMLCanvasElement): GPUCanvasContext | null {
  return canvas.getContext('webgpu') as unknown as GPUCanvasContext | null;
}

/**
 * Whether this browser can show a canvas's light past the page's white. One that has never heard
 * of a tone mapping never reads it from a configuration. It is asked on a canvas of its own, so
 * that the stage's canvas is still WebGL 2's to take when the answer is no.
 */
function extendedRange(device: GPUDevice): boolean {
  const probe = webgpuOf(document.createElement('canvas'));
  if (!probe) return false;
  const asked = configuration(device);
  let read = false;
  probe.configure({
    ...asked,
    get toneMapping() {
      read = true;
      return asked.toneMapping;
    },
  });
  probe.unconfigure();
  return read;
}

/** Everything an engine is made with before it asks for the stage's canvas. */
interface Kit {
  lightLayout: GPUObject;
  trail: GPURenderPipeline;
  body: GPURenderPipeline;
  quarter: GPURenderPipeline;
  blur: GPURenderPipeline;
  composite: GPURenderPipeline;
  sampler: GPUObject;
  frame: GPUBuffer;
  stage: GPUBuffer;
  spacing: GPUBuffer[];
  placeholder: GPUTexture;
}

/** The Frame struct: 36 floats, the count among them as an integer. */
const FRAME_FLOATS = 36;

/** The shaders compiled, the pipelines made and the fixed buffers: all of it checked. */
async function equip(device: GPUDevice): Promise<Kit> {
  device.pushErrorScope('validation');
  const modules = [LIGHT_SHADER, SCREEN_SHADER].map((code) => device.createShaderModule({ code }));
  const [light, screen] = modules;
  // A driver that cannot compile the light says why, for whoever looks.
  for (const module of modules) {
    const { messages } = await module.getCompilationInfo();
    const errors = messages.filter((message) => message.type === 'error');
    if (errors.length)
      throw new Error(errors.map((error) => `${error.lineNum}: ${error.message}`).join('\n'));
  }
  const lightLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.VERTEX | STAGE.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: STAGE.VERTEX, texture: { sampleType: 'float' } },
      { binding: 5, visibility: STAGE.VERTEX, sampler: { type: 'filtering' } },
    ],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [lightLayout] });
  const add: GPUBlend = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const lit = (entry: string, topology: GPUPipelineDescriptor['primitive']['topology']) =>
    device.createRenderPipelineAsync({
      layout,
      vertex: { module: light, entryPoint: `${entry}Vertex` },
      fragment: {
        module: light,
        entryPoint: `${entry}Fragment`,
        targets: [{ format: LIGHT_FORMAT, blend: { color: add, alpha: add } }],
      },
      primitive: { topology },
    });
  const full = (entry: string) =>
    device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module: screen, entryPoint: 'screenVertex' },
      fragment: { module: screen, entryPoint: entry, targets: [{ format: LIGHT_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
  const [trail, body, quarter, blur, composite] = await Promise.all([
    lit('trail', 'triangle-strip'),
    lit('body', 'triangle-list'),
    full('quarterFragment'),
    full('blurFragment'),
    full('compositeFragment'),
  ]);
  const uniform = (floats: number) =>
    device.createBuffer({ size: floats * 4, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
  const kit: Kit = {
    lightLayout,
    trail,
    body,
    quarter,
    blur,
    composite,
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
    frame: uniform(FRAME_FLOATS),
    stage: uniform(4),
    spacing: [0, 1, 2, 3].map(() => uniform(4)),
    // Black until the still's colours arrive: the WebGL engine's warm white where nothing is lit.
    placeholder: device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
    }),
  };
  const error = await device.popErrorScope();
  if (error) throw new Error(error.message);
  return kit;
}

/** The size a still is drawn at, whatever kind of source it is. */
function sizeOf(still: TexImageSource): [number, number] {
  if ('naturalWidth' in still && still.naturalWidth)
    return [still.naturalWidth, still.naturalHeight];
  if ('videoWidth' in still && still.videoWidth) return [still.videoWidth, still.videoHeight];
  if ('displayWidth' in still) return [still.displayWidth, still.displayHeight];
  return [still.width, still.height];
}

/** Each symmetry copy as the shader reads it: its matrix's columns, then its scale in depth. */
function copyRows(copies: PlateSpace['copies']): Float32Array {
  const rows = new Float32Array(copies.length * 8);
  copies.forEach((copy, i) => {
    const m = copy.mirror ? -1 : 1;
    const { cos, sin, scale } = copy;
    rows.set([m * cos * scale, m * sin * scale, -sin * scale, cos * scale, scale], i * 8);
  });
  return rows;
}

/** One full-screen pass of the glow: what it reads, through which pipeline, and where it writes. */
interface Pass {
  pipeline: GPURenderPipeline;
  group: GPUObject;
  view: GPUObject;
}

/** The light and its glow at one size of the stage. */
interface Targets {
  width: number;
  height: number;
  textures: GPUTexture[];
  light: GPUObject;
  glow: Pass[];
  composite: GPUObject;
}

/** Which engine has the canvas configured: React's development mode can mount two at once. */
const holders = new WeakMap<HTMLCanvasElement, GpuLightEngine>();

export class GpuLightEngine implements Engine {
  readonly canvas: HTMLCanvasElement;
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly kit: Kit;
  private readonly frameFloats = new Float32Array(FRAME_FLOATS);
  private readonly frameCount = new Int32Array(this.frameFloats.buffer, 24 * 4, 1);
  private readonly stageFloats = new Float32Array(4);
  private points: GPUBuffer | null = null;
  private drift: GPUBuffer | null = null;
  private copies: GPUBuffer | null = null;
  private colours: GPUTexture;
  private lightGroup: GPUObject | null = null;
  private targets: Targets | null = null;
  private space: PlateSpace | null = null;
  /** The scene the still's colours are on their way for, and whether they have come. */
  private scene = 0;
  private coloured = false;
  private headSpan = 200;
  private deviceLost = false;
  private failed = false;
  private disposed = false;
  look: Look = LOOK;

  /**
   * An engine on this canvas, or nothing where WebGPU cannot draw it in extended range. The canvas
   * is asked for its context only once the device and the pipelines are in hand: a canvas takes
   * one kind of context for good, and one this engine did not claim is still WebGL 2's.
   */
  static async create(canvas: HTMLCanvasElement): Promise<GpuLightEngine | null> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) return null;
    let device: GPUDevice | null = null;
    try {
      // The browser's own adapter: Chrome on Windows ignores a power preference, and says so.
      const adapter = await gpu.requestAdapter();
      if (!adapter) return null;
      device = await adapter.requestDevice();
      if (!extendedRange(device)) {
        device.destroy();
        return null;
      }
      const kit = await equip(device);
      const context = webgpuOf(canvas);
      if (!context) {
        device.destroy();
        return null;
      }
      context.configure(configuration(device));
      return new GpuLightEngine(canvas, device, context, kit);
    } catch (failure) {
      console.warn('First Light cannot draw in WebGPU here:', failure);
      device?.destroy();
      return null;
    }
  }

  // No parameter properties, as in the WebGL engine: Node can strip the types without transforming.
  private constructor(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    kit: Kit,
  ) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.kit = kit;
    this.colours = kit.placeholder;
    holders.set(canvas, this);
    device.lost.then(() => {
      this.deviceLost = true;
    });
    device.addEventListener('uncapturederror', this.onError);
  }

  get lost(): boolean {
    return this.deviceLost || this.failed;
  }

  /** A light that cannot be drawn gives the still back, and says why. */
  private readonly onError = (event: Event) => {
    if (!this.failed) {
      const { error } = event as Event & { error?: GPUError };
      console.warn('First Light cannot go on drawing in WebGPU:', error?.message);
    }
    this.failed = true;
  };

  private storage(values: Float32Array): GPUBuffer {
    const buffer = this.device.createBuffer({
      size: Math.max(16, values.byteLength),
      usage: BUFFER.STORAGE | BUFFER.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, values);
    return buffer;
  }

  private bindLight(): GPUObject {
    return this.device.createBindGroup({
      layout: this.kit.lightLayout,
      entries: [
        { binding: 0, resource: { buffer: this.kit.frame } },
        { binding: 1, resource: { buffer: this.points! } },
        { binding: 2, resource: { buffer: this.drift! } },
        { binding: 3, resource: { buffer: this.copies! } },
        { binding: 4, resource: this.colours.createView() },
        { binding: 5, resource: this.kit.sampler },
      ],
    });
  }

  /** The window to draw, and the still whose light colours it. */
  setScene(space: PlateSpace, still: TexImageSource) {
    for (const buffer of [this.points, this.drift, this.copies]) buffer?.destroy();
    this.space = space;
    this.points = this.storage(space.points);
    this.drift = this.storage(space.drift);
    this.copies = this.storage(copyRows(space.copies));
    this.headSpan = Math.max(8, space.count / 40);
    this.lightGroup = this.bindLight();
    // The light waits for the still's colours: a few milliseconds, while the canvas is unseen.
    this.coloured = false;
    const scene = ++this.scene;
    const [width, height] = sizeOf(still);
    const across = Math.max(1, Math.min(COLOUR_WIDTH, width));
    createImageBitmap(still, {
      resizeWidth: across,
      resizeHeight: Math.max(1, Math.round((height * across) / Math.max(1, width))),
      resizeQuality: 'high',
    })
      .then((bitmap) => {
        if (this.disposed || scene !== this.scene) {
          bitmap.close();
          return;
        }
        const size: [number, number] = [bitmap.width, bitmap.height];
        const texture = this.device.createTexture({
          size,
          format: 'rgba8unorm',
          usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, size);
        bitmap.close();
        const previous = this.colours;
        this.colours = texture;
        this.lightGroup = this.bindLight();
        if (previous !== this.kit.placeholder) previous.destroy();
      })
      .catch((failure) => {
        // Without them the light keeps the WebGL engine's warm white, as it does on black.
        console.warn("First Light cannot read the still's colours:", failure);
      })
      .finally(() => {
        if (scene === this.scene) this.coloured = true;
      });
  }

  private target(width: number, height: number): GPUTexture {
    return this.device.createTexture({
      size: [width, height],
      format: LIGHT_FORMAT,
      usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
    });
  }

  /** A bind group for a full-screen pass, its resources by binding. */
  private group(pipeline: GPURenderPipeline, resources: Record<number, GPUResource>): GPUObject {
    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: Object.entries(resources).map(([binding, resource]) => ({
        binding: Number(binding),
        resource,
      })),
    });
  }

  /** The canvas's drawing buffer for its CSS size, at up to twice the CSS pixels. */
  resize(width: number, height: number, ratio: number) {
    const scale = Math.min(Math.max(ratio, 1), 2);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    if (this.targets?.width === w && this.targets.height === h) return;
    for (const texture of this.targets?.textures ?? []) texture.destroy();
    const gw = Math.max(1, Math.round(w / 4));
    const gh = Math.max(1, Math.round(h / 4));
    const textures = [this.target(w, h), ...[0, 1, 2].map(() => this.target(gw, gh))];
    const [light, quarter, glowA, glowB] = textures.map((texture) => texture.createView());
    const { quarter: quartering, blur, composite, sampler, spacing, stage } = this.kit;
    // Across and down, then across and down again at twice the step, as the WebGL engine blurs.
    const steps = [1, 0, 0, 1, 2, 0, 0, 2];
    spacing.forEach((buffer, i) => {
      const step = [steps[i * 2] / gw, steps[i * 2 + 1] / gh, 0, 0];
      this.device.queue.writeBuffer(buffer, 0, new Float32Array(step));
    });
    const blurred = (from: GPUObject, i: number, view: GPUObject): Pass => ({
      pipeline: blur,
      group: this.group(blur, { 0: from, 1: sampler, 2: { buffer: spacing[i] } }),
      view,
    });
    this.targets = {
      width: w,
      height: h,
      textures,
      light,
      glow: [
        {
          pipeline: quartering,
          group: this.group(quartering, { 0: light, 1: sampler }),
          view: quarter,
        },
        blurred(quarter, 0, glowA),
        blurred(glowA, 1, glowB),
        blurred(glowB, 2, glowA),
        blurred(glowA, 3, glowB),
      ],
      composite: this.group(composite, { 0: light, 1: sampler, 3: glowB, 4: { buffer: stage } }),
    };
  }

  /** The Frame uniform for this moment: PLACE's uniforms and the trail's and the bodies'. */
  private writeFrame(exposure: Exposure, space: PlateSpace, head: number, ratio: number) {
    const floats = this.frameFloats;
    const { lens } = exposure;
    const r = lens.rotation;
    // The rotation's columns, so that the shader's rotation × p is the lens's row-major turn of p.
    floats.set([r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0]);
    floats.set(lens.focus, 12);
    floats[15] = lens.inverseDistance;
    floats.set(lens.invHalf, 16);
    floats.set(lens.offset, 18);
    floats.set([this.canvas.width, this.canvas.height, space.width, space.height], 20);
    this.frameCount[0] = space.count;
    floats.set(
      [
        exposure.drift,
        head,
        exposure.heads,
        this.headSpan,
        this.look.width * ratio,
        this.look.intensity,
        this.look.bodySize * ratio,
        exposure.flare,
        exposure.heads,
      ],
      25,
    );
    this.device.queue.writeBuffer(this.kit.frame, 0, floats);
  }

  /** One moment of the performance, on the canvas. */
  draw(exposure: Exposure) {
    const space = this.space;
    const targets = this.targets;
    const lightGroup = this.lightGroup;
    if (!space || !targets || !lightGroup || !this.coloured || this.disposed || this.lost) return;
    const { device, kit } = this;
    // Another engine may have configured the canvas while this one was being made.
    if (holders.get(this.canvas) !== this) {
      this.context.configure(configuration(device));
      holders.set(this.canvas, this);
    }
    const ratio = this.canvas.width / Math.max(1, this.canvas.clientWidth || this.canvas.width);
    const head = Math.min(1, Math.max(0, exposure.drawn)) * (space.count - 1);
    this.writeFrame(exposure, space, head, ratio);
    this.stageFloats[0] = this.look.glow;
    this.stageFloats[1] = this.look.exposure;
    device.queue.writeBuffer(kit.stage, 0, this.stageFloats);
    const encoder = device.createCommandEncoder();
    const begin = (view: GPUObject) =>
      encoder.beginRenderPass({
        colorAttachments: [
          { view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      });

    // The light, added up in linear light: every body's trail in every symmetry copy at once.
    const instances = space.copies.length * 3;
    const light = begin(targets.light);
    light.setPipeline(kit.trail);
    light.setBindGroup(0, lightGroup);
    light.draw((Math.ceil(head) + 1) * 2, instances);
    if (exposure.heads > 0.001) {
      light.setPipeline(kit.body);
      light.draw(6, instances);
    }
    light.end();

    // The glow: the light at a quarter of its size, blurred across and down, twice; then onto the
    // stage, tone mapped, where the brightest light may rise past the page's white.
    const stage: Pass = {
      pipeline: kit.composite,
      group: targets.composite,
      view: this.context.getCurrentTexture().createView(),
    };
    for (const { pipeline, group, view } of [...targets.glow, stage]) {
      const pass = begin(view);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.device.removeEventListener('uncapturederror', this.onError);
    if (holders.get(this.canvas) === this) {
      holders.delete(this.canvas);
      this.context.unconfigure();
    }
    // The device takes every buffer and texture made on it with it.
    this.device.destroy();
  }
}
