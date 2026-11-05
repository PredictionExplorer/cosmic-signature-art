import { FRONT_EDGE } from '@/lib/crossing/timing';

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Black until the reveal reaches the time the film first drew a pixel, then the still's own
// pixel, mixed only across the soft edge of the front as it passes.
const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uStill, uMap;
uniform float uReveal, uEdge;
void main() {
  float arrived = 1.0 - smoothstep(uReveal - uEdge, uReveal + uEdge, texture2D(uMap, vUv).r);
  gl_FragColor = vec4(texture2D(uStill, vUv).rgb * arrived, 1.0);
}`;

/**
 * The Light still condensing out of the black in the order its film first drew it: the arrival
 * crossing's front (arrival-crossing.ts) with nothing on its far side but the night the Light
 * hangs on. Every pixel shown is the still's own, untouched, or black.
 */
export class Condensation {
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private reveal: WebGLUniformLocation | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** Upload the still and its map and compile; false where this browser cannot draw it so. */
  prepare(still: TexImageSource, map: TexImageSource): boolean {
    // The drawing buffer is kept, so a repaint between frames shows the last one, never black.
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl || gl.isContextLost()) return false;
    const program = gl.createProgram();
    if (!program) return false;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) return false;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
      if (!compiled) return false;
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = (unit: number, source: TexImageSource, data: boolean) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      // The map is data: its values are times, never to be colour-managed.
      gl.pixelStorei(
        gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
        data ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL,
      );
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    texture(0, still, false);
    texture(1, map, true);
    gl.uniform1i(gl.getUniformLocation(program, 'uStill'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'uMap'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'uEdge'), FRONT_EDGE);
    this.reveal = gl.getUniformLocation(program, 'uReveal');
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl = gl;
    return gl.getError() === gl.NO_ERROR;
  }

  /** Draw the still revealed up to `reveal` of its arrival order. */
  draw(reveal: number) {
    const gl = this.gl;
    if (!gl) return;
    gl.uniform1f(this.reveal, reveal);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Give the context back at once rather than at the collector's leisure. */
  dispose() {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
}
