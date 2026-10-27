/**
 * The Dusk: the home's one automatic event. After the film has resolved and rested, with no
 * input since, the paper wall goes down to the same orbit in light. It is armed once per
 * resolution, cancelled by any input, and never performed while the venue is paused,
 * reduced, hushed, in fullscreen or under a sheet; the caller checks those gates.
 */
export class DuskController {
  private armed = false;
  private running = false;
  private spent = false;

  get isArmed() {
    return this.armed;
  }
  get isRunning() {
    return this.running;
  }

  /** Resolution and rest are over: perform now unless the visitor has moved since. */
  arm() {
    if (this.spent || this.running) return false;
    this.armed = true;
    return true;
  }

  /** The rest has elapsed with the room still: the Dusk begins with the caller's performance. */
  async fire(perform: () => Promise<boolean>): Promise<boolean> {
    if (!this.armed || this.running || this.spent) return false;
    this.armed = false;
    this.running = true;
    const done = await perform();
    this.running = false;
    this.spent = done;
    return done;
  }

  /** Any input: a Dusk that has not begun is forgotten; one in flight is cancelled by the caller. */
  input(): 'disarmed' | 'cancel' | 'none' {
    if (this.running) return 'cancel';
    if (this.armed) {
      this.armed = false;
      return 'disarmed';
    }
    return 'none';
  }

  /** A fresh resolution (Again) may arm the Dusk once more. */
  reset() {
    this.armed = false;
    this.running = false;
    this.spent = false;
  }
}

/** The events that cancel the Dusk, listened for on the window and document. */
export const DUSK_CANCEL_EVENTS: readonly (keyof WindowEventMap)[] = [
  'wheel',
  'scroll',
  'keydown',
  'touchstart',
  'pointerdown',
  'focusin',
];
