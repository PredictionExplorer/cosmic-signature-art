import { describe, expect, it } from 'vitest';
import { beyondReducer, type Beyond, type BeyondAct } from './orbit-beyond-state';

/** After the frame after a run of acts, from the frame. */
const after = (...acts: BeyondAct[]) =>
  acts.reduce<Beyond | null>((state, act) => beyondReducer(state, act), null);

const ask: BeyondAct = { type: 'ask', whom: true };
const unasked: BeyondAct = { type: 'ask', whom: false };
const stay = (body: number | null): BeyondAct => ({ type: 'stay', body });
const rest: BeyondAct = { type: 'rest' };
const tell: BeyondAct = { type: 'tell' };
const leave: BeyondAct = { type: 'leave' };

describe('where After the frame stands', () => {
  it('begins with the question where the visitor is asked whom to stay with', () => {
    expect(after(ask)).toEqual({ run: 1, phase: 'choosing' });
  });

  it('begins performing in the work’s own frame where there is no one to stay with', () => {
    expect(after(unasked)).toEqual({ run: 1, phase: 'running', kept: null });
  });

  it('performs with the visitor’s answer: one of the three, or the frame', () => {
    expect(after(ask, stay(2))).toEqual({ run: 2, phase: 'running', kept: 2 });
    expect(after(ask, stay(null))).toEqual({ run: 2, phase: 'running', kept: null });
  });

  it('counts each asking and each answer as a performance of its own', () => {
    // A repeat starts afresh: the drawing and the page are keyed by the count.
    expect(after(ask, stay(0), tell, ask)).toEqual({ run: 3, phase: 'choosing' });
    expect(after(unasked, unasked)?.run).toBe(2);
    // Leaving forgets the count: the next asking is the first again.
    expect(after(ask, stay(0), leave, ask)).toEqual({ run: 1, phase: 'choosing' });
  });

  it('rests when a performance reaches its end, in the picture it was performed in', () => {
    expect(after(ask, stay(1), rest)).toEqual({ run: 2, phase: 'resting', kept: 1 });
    expect(after(unasked, rest)).toEqual({ run: 1, phase: 'resting', kept: null });
  });

  it('is told after the rest, or at the visitor’s word while it runs', () => {
    expect(after(ask, stay(1), rest, tell)).toEqual({ run: 2, phase: 'told', kept: 1 });
    expect(after(ask, stay(1), tell)).toEqual({ run: 2, phase: 'told', kept: 1 });
    expect(after(unasked, tell)).toEqual({ run: 1, phase: 'told', kept: null });
  });

  it('tells the frame’s own picture if told before the question was answered', () => {
    expect(after(ask, tell)).toEqual({ run: 1, phase: 'told', kept: null });
  });

  it('goes back to the frame from wherever it stands', () => {
    for (const acts of [[ask], [ask, stay(0)], [unasked, rest], [unasked, tell]])
      expect(after(...acts, leave)).toBeNull();
    expect(after(leave)).toBeNull();
  });

  describe('what cannot follow leaves it as it was', () => {
    it('does not rest unless a performance is running', () => {
      for (const acts of [[ask], [unasked, rest], [unasked, tell]]) {
        const stands = after(...acts);
        expect(beyondReducer(stands, rest)).toBe(stands);
      }
      expect(beyondReducer(null, rest)).toBeNull();
    });

    it('is not told twice, nor told at the frame', () => {
      const told = after(unasked, tell);
      // The same state, so nothing is drawn or said again (a rest's timer that fires late).
      expect(beyondReducer(told, tell)).toBe(told);
      expect(beyondReducer(null, tell)).toBeNull();
    });

    it('does not rest after it has been told', () => {
      const told = after(ask, stay(2), tell);
      expect(beyondReducer(told, rest)).toBe(told);
    });
  });
});
