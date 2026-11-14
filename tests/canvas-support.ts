/** jsdom has no canvas; this stands in for a drawing context in unit tests. */

/** One thing a drawing asked of its context, with the styles that stood as it asked. */
export interface Drawn {
  name: string;
  args: unknown[];
  /** Every property the drawing had set by then: `strokeStyle`, `globalAlpha`, and the rest. */
  set: Record<string, unknown>;
}

/**
 * A drawing context that draws nothing and keeps what it was asked, in order. A property reads
 * back as it was last set; anything else is a call, which is recorded.
 */
export function recordingContext() {
  const calls: Drawn[] = [];
  const state: Record<string, unknown> = {};
  const context = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args: unknown[]) => {
        calls.push({ name: key, args, set: { ...target } });
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return {
    context: context as unknown as CanvasRenderingContext2D,
    calls,
    /** The calls of one name, in order. */
    named: (name: string) => calls.filter((call) => call.name === name),
    /** Forgets what was drawn so far. */
    clear: () => {
      calls.length = 0;
    },
  };
}
