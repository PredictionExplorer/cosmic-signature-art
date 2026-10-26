import { describe, expect, it, vi } from 'vitest';
import { DUSK_CANCEL_EVENTS, DuskController } from './dusk';

describe('the Dusk', () => {
  it('fires once per resolution, only when armed, and is spent after it is performed', async () => {
    const perform = vi.fn().mockResolvedValue(true);
    const dusk = new DuskController();
    expect(await dusk.fire(perform)).toBe(false);
    expect(dusk.arm()).toBe(true);
    expect(dusk.isArmed).toBe(true);
    expect(await dusk.fire(perform)).toBe(true);
    expect(perform).toHaveBeenCalledOnce();
    expect(dusk.arm()).toBe(false);
    expect(await dusk.fire(perform)).toBe(false);
    dusk.reset();
    expect(dusk.arm()).toBe(true);
  });

  it('is disarmed by input before it begins and asks the caller to cancel one in flight', async () => {
    let finish!: (value: boolean) => void;
    const perform = () => new Promise<boolean>((resolve) => (finish = resolve));
    const dusk = new DuskController();
    expect(dusk.input()).toBe('none');
    dusk.arm();
    expect(dusk.input()).toBe('disarmed');
    expect(await dusk.fire(perform)).toBe(false);
    dusk.arm();
    const firing = dusk.fire(perform);
    expect(dusk.isRunning).toBe(true);
    expect(dusk.input()).toBe('cancel');
    finish(false);
    expect(await firing).toBe(false);
    // A cancelled Dusk was not spent; the next resolution may arm it again.
    expect(dusk.arm()).toBe(true);
  });

  it('names the inputs that cancel it', () => {
    expect(DUSK_CANCEL_EVENTS).toEqual(
      expect.arrayContaining([
        'wheel',
        'scroll',
        'keydown',
        'touchstart',
        'pointerdown',
        'focusin',
      ]),
    );
  });
});
