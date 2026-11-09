import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAT, lensFor } from '@/lib/first-light/camera';
import type { PlateSpace } from '@/lib/first-light/samples';
import { LightEngine, type InkPalette } from './first-light-engine';

/*
  The light engine against a context that records what it is asked to do. CI has no GPU, so what
  is checked here is the engine's own logic: which passes run, how many copies are drawn, and
  what each material sets. The pixels are checked in a browser (tests/e2e/orbit-hand.spec.ts).
*/

type Call = { name: string; args: unknown[] };
let calls: Call[] = [];
let compiled: string[] = [];

/** A WebGL 2 context that says yes to everything and remembers each call. */
function recordingContext() {
  let next = 0;
  const handle = (kind: string) => ({ kind, id: ++next });
  return new Proxy(
    {},
    {
      get: (_, property: string) => {
        // Constants: any number will do, as long as each name keeps its own.
        if (/^[A-Z0-9_]+$/.test(property)) return property.length;
        switch (property) {
          case 'canvas':
            return undefined;
          case 'getExtension':
            return () => ({});
          case 'getShaderParameter':
          case 'getProgramParameter':
            return () => true;
          case 'isContextLost':
            return () => false;
          case 'getUniformLocation':
            return (_program: unknown, name: string) => ({ uniform: name });
          case 'shaderSource':
            return (_shader: unknown, source: string) => compiled.push(source);
          default:
            if (property.startsWith('create')) return () => handle(property.slice(6));
            return (...args: unknown[]) => {
              calls.push({ name: property, args });
            };
        }
      },
    },
  ) as WebGL2RenderingContext;
}

/** A small window of three samples, drawn in two symmetry copies. */
function space(): PlateSpace {
  return {
    stride: 100,
    count: 3,
    steps: Float64Array.from([0, 100, 199]),
    width: 3_456,
    height: 2_234,
    scale: 1,
    points: Float32Array.from({ length: 27 }, (_, i) => (i % 7) * 10),
    drift: new Float32Array(9),
    depthCentre: 0,
    centre: [0, 0, 0],
    copies: [
      { cos: 1, sin: 0, scale: 1, mirror: false },
      { cos: -1, sin: 0, scale: 1, mirror: false },
    ],
  };
}

const INK: InkPalette = {
  paper: [0.86, 0.81, 0.73],
  trails: [
    [1, 0.9, 0.8],
    [0.9, 1, 0.8],
    [0.8, 0.9, 1],
  ],
  bodies: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
  bodyRadius: 0.025,
};

function canvasWithContext() {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockImplementation(
    () => recordingContext() as unknown as RenderingContext,
  );
  Object.defineProperty(canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(canvas, 'clientHeight', { value: 517 });
  return canvas;
}

/** One moment, flat, with the whole window drawn and the bodies shown. */
function exposure(scene: PlateSpace) {
  return {
    lens: lensFor(FLAT, { width: 800, height: 517 }, scene),
    drift: 1,
    drawn: 1,
    heads: 1,
    flare: 0.5,
  };
}

const uniforms = (name: string) =>
  calls.filter(
    (call) =>
      call.name.startsWith('uniform') && (call.args[0] as { uniform: string }).uniform === name,
  );
const draws = (name: string) => calls.filter((call) => call.name === name);

beforeEach(() => {
  calls = [];
  compiled = [];
});
afterEach(() => vi.restoreAllMocks());

describe('the light engine', () => {
  it('draws light: every copy, the glow, and the tone map', () => {
    const scene = space();
    const engine = LightEngine.create(canvasWithContext())!;
    expect(engine).not.toBeNull();
    const still = document.createElement('canvas');
    engine.setScene(scene, still);
    engine.resize(800, 517, 2);
    calls = [];
    engine.draw(exposure(scene));
    // Three trails in each of two copies, then the bodies in each copy.
    expect(draws('drawArrays').filter((call) => call.args[2] !== 3)).toHaveLength(6);
    expect(draws('drawArraysInstanced')).toHaveLength(2);
    // Six blur passes and the composite: seven full-screen triangles.
    expect(draws('drawArrays').filter((call) => call.args[2] === 3)).toHaveLength(7);
    expect(uniforms('uFixedColour').at(-1)!.args[1]).toBe(0);
    expect(uniforms('uInk').at(-1)!.args[1]).toBe(0);
    expect(uniforms('uRing').at(-1)!.args[1]).toBe(0);
    expect(uniforms('uFlare').at(-1)!.args[1]).toBe(0.5);
  });

  it('lays ink on the sheet: one copy, each body’s own colour, no glow', () => {
    const scene = space();
    const engine = LightEngine.create(canvasWithContext(), INK)!;
    // Ink needs no still to read colours from.
    engine.setScene(scene);
    engine.resize(800, 517, 2);
    calls = [];
    engine.draw(exposure(scene));
    // The primary copy alone: three trails, one set of bodies.
    expect(draws('drawArrays').filter((call) => call.args[2] !== 3)).toHaveLength(3);
    expect(draws('drawArraysInstanced')).toHaveLength(1);
    // No glow: the one full-screen triangle is the composite onto the sheet.
    expect(draws('drawArrays').filter((call) => call.args[2] === 3)).toHaveLength(1);
    expect(uniforms('uFixedColour').at(-1)!.args[1]).toBe(1);
    expect(uniforms('uBodyColour').map((call) => call.args.slice(1))).toEqual(INK.trails);
    expect(uniforms('uInk').at(-1)!.args[1]).toBe(1);
    expect(uniforms('uPaper').at(-1)!.args.slice(1)).toEqual([...INK.paper]);
    expect(uniforms('uRing').at(-1)!.args[1]).toBe(1);
    // Ink has no flare; each body is ringed at its hollow's size on the plate.
    expect(uniforms('uFlare').at(-1)!.args[1]).toBe(0);
    const size = uniforms('uBodySize').at(-1)!.args[1] as number;
    const pixelScale = exposure(scene).lens.pixelScale;
    expect(size).toBeCloseTo((0.025 * 2_234 * pixelScale * 2) / 0.8, 6);
  });

  it('compiles shaders that name what each material sets', () => {
    LightEngine.create(canvasWithContext());
    const source = compiled.join('\n');
    for (const name of ['uFixedColour', 'uBodyColour', 'uHeadGain', 'uRing', 'uInk', 'uPaper'])
      expect(source).toContain(name);
    // 'sample' is reserved in GLSL ES 3.00 and would not compile outside a comment.
    expect(source.replace(/\/\/.*$/gm, '')).not.toMatch(/\bsample\b/);
  });
});
