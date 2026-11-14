import { describe, expect, it } from 'vitest';
import type { FramedSamples } from '@/lib/physics/framing';
import { recordingContext } from '../../tests/canvas-support';
import { drawChoice, numberPlaces, pressTargets, pressedBody, type Target } from './orbit-choice';
import { MATERIALS, platePicture, type Material } from './orbit-picture';

const far = ([ax, ay]: readonly number[], [bx, by]: readonly number[]) =>
  Math.hypot(ax - bx, ay - by);

describe('where the three numbers stand', () => {
  /** Three bodies well apart on a 400 × 400 picture, each drawn 10 px from its centre. */
  const centres = [
    [100, 100],
    [300, 100],
    [200, 300],
  ] as const;
  const reaches = [10, 10, 10];
  const size = 20;
  const middle = [200, 500 / 3];

  it('sets each beside its body, away from the middle of the three', () => {
    const places = numberPlaces(centres, reaches, size, 400, 400);
    expect(places).toHaveLength(3);
    places.forEach((place, body) => {
      // Off its body by as far as the body is drawn and three quarters of the numeral…
      expect(far(place, centres[body])).toBeCloseTo(25, 9);
      // …on the line from the middle through the body, on the far side.
      expect(far(place, middle)).toBeCloseTo(far(centres[body], middle) + 25, 9);
    });
  });

  it('sets a number straight up where its body stands on the middle of the three', () => {
    const inLine = [
      [200, 200],
      [100, 200],
      [300, 200],
    ] as const;
    const [first] = numberPlaces(inLine, reaches, size, 400, 400);
    expect(first[0]).toBeCloseTo(200, 9);
    expect(first[1]).toBeCloseTo(175, 9);
  });

  it('turns a number about its body until it stands whole on the picture', () => {
    // Body 1 is in the corner: away from the middle is off the picture.
    const cornered = [
      [14, 14],
      [300, 100],
      [200, 300],
    ] as const;
    const [first] = numberPlaces(cornered, reaches, size, 400, 400);
    expect(far(first, cornered[0])).toBeCloseTo(25, 9);
    // Whole: no nearer an edge than six tenths of the numeral.
    expect(first[0]).toBeGreaterThanOrEqual(12);
    expect(first[1]).toBeGreaterThanOrEqual(12);
    // And at each of the other edges.
    for (const corner of [
      [386, 14],
      [386, 386],
      [14, 386],
    ] as const) {
      const [place] = numberPlaces([corner, [200, 150], [220, 250]], reaches, size, 400, 400);
      expect(place[0]).toBeGreaterThanOrEqual(12);
      expect(place[0]).toBeLessThanOrEqual(388);
      expect(place[1]).toBeGreaterThanOrEqual(12);
      expect(place[1]).toBeLessThanOrEqual(388);
    }
  });

  it('keeps a number clear of every body drawn, and no nearer another than its own', () => {
    // A second copy of body 3 stands just where body 1's number would be set.
    const first = numberPlaces(centres, reaches, size, 400, 400)[0];
    const crowded = [...centres, [900, 900], [900, 900], first] as const;
    const wide = [...reaches, 10, 10, 10];
    const [moved] = numberPlaces(crowded, wide, size, 400, 400);
    expect(far(moved, first)).toBeGreaterThanOrEqual(25);
    expect(far(moved, crowded[0])).toBeCloseTo(25, 9);
    // No nearer that body than its own, 25 px: thirty degrees round is still too near (13 px),
    // sixty is just far enough.
    const turned =
      Math.atan2(moved[1] - 100, moved[0] - 100) - Math.atan2(first[1] - 100, first[0] - 100);
    expect(Math.abs(turned)).toBeCloseTo(Math.PI / 3, 9);
  });

  it('keeps a number clear of the numbers already set', () => {
    // Bodies 1 and 2 stand one above the other, the third far to the left: both numbers
    // would be set to the right, the second on the first.
    const stacked = [
      [300, 200],
      [300, 206],
      [0, 203],
    ] as const;
    const [one, two] = numberPlaces(stacked, [2, 2, 2], size, 400, 400);
    expect(far(one, two)).toBeGreaterThanOrEqual(size);
  });

  it('falls back on the first place, kept on the picture, where no turn will do', () => {
    // A picture too small for any turn to stand whole on.
    const tiny = [
      [15, 15],
      [16, 15],
      [15, 16],
    ] as const;
    for (const [x, y] of numberPlaces(tiny, reaches, size, 30, 30)) {
      expect(x).toBeGreaterThanOrEqual(12);
      expect(x).toBeLessThanOrEqual(18);
      expect(y).toBeGreaterThanOrEqual(12);
      expect(y).toBeLessThanOrEqual(18);
    }
  });
});

describe('what a pointer may press', () => {
  it('offers every copy of each body, then each number, in CSS pixels of the stage', () => {
    const centres = [
      [100, 100],
      [300, 100],
      [200, 300],
      [120, 100],
      [320, 100],
      [220, 300],
    ] as const;
    const targets = pressTargets(
      centres,
      [10, 10, 60, 10, 10, 60],
      [
        [80, 80],
        [330, 80],
        [200, 380],
      ],
      (drawn) => drawn % 3,
      2,
    );
    expect(targets.map((target) => target.body)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
    // A body answers within half a 44 px target, or as far as it is drawn where that is farther.
    expect(targets[0]).toEqual({ x: 50, y: 50, body: 0, reach: 22 });
    expect(targets[5]).toEqual({ x: 110, y: 150, body: 2, reach: 30 });
    // A number answers for its body within its own size.
    expect(targets[8]).toEqual({ x: 100, y: 190, body: 2, reach: 13 });
  });

  const targets: Target[] = [
    { x: 100, y: 100, body: 0, reach: 22 },
    { x: 108, y: 100, body: 2, reach: 22 },
    { x: 300, y: 100, body: 1, reach: 22 },
    { x: 300, y: 60, body: 1, reach: 13 },
  ];

  it('takes a mouse at its word: the nearest body within its reach, or none', () => {
    expect(pressedBody(targets, 102, 100, false)).toEqual({ body: 0 });
    expect(pressedBody(targets, 107, 100, false)).toEqual({ body: 2 });
    expect(pressedBody(targets, 300, 122, false)).toEqual({ body: 1 });
    expect(pressedBody(targets, 300, 123, false)).toBeNull();
    // A number answers for its body, no farther than its own size.
    expect(pressedBody(targets, 300, 48, false)).toEqual({ body: 1 });
    expect(pressedBody(targets, 300, 46, false)).toBeNull();
  });

  it('does not take a finger that covers two bodies: it says which it could not tell apart', () => {
    expect(pressedBody(targets, 102, 100, true)).toEqual({ unsure: [0, 2] });
    expect(pressedBody(targets, 107, 100, true)).toEqual({ unsure: [0, 2] });
    // Nearer by less than a careful tap strays: still not told apart.
    expect(pressedBody(targets, 90, 100, true)).toEqual({ unsure: [0, 2] });
    // The other no longer under the finger: taken.
    expect(pressedBody(targets, 85, 100, true)).toEqual({ body: 0 });
    // Alone under the finger: taken, by its light or by its number.
    expect(pressedBody(targets, 310, 105, true)).toEqual({ body: 1 });
    expect(pressedBody(targets, 600, 600, true)).toBeNull();
  });
});

describe('the picture a visitor chooses in', () => {
  /** The film ends with the three well apart, in two copies; the frame is drawn one to two. */
  const ends = [...[200, 200, 600, 200, 400, 600], ...[240, 200, 640, 200, 440, 600]];
  const framed: FramedSamples = {
    stride: 100,
    count: 1,
    copies: 2,
    pixels: Float32Array.from([...ends, ...ends]),
  };
  const frame = { width: 800, height: 800 };
  const masses = [100, 200, 300];

  function chosen(material: Material) {
    const mark = recordingContext();
    const names = recordingContext();
    const done: string[] = [];
    const picture = platePicture(framed, frame, material, 400, 400, 2);
    const choice = drawChoice({
      picture,
      painter: {
        strokes: (from, to) => done.push(`strokes ${from}→${to}`),
        lights: (at) => done.push(`lights ${at(1).join(',')}`),
      },
      mark: mark.context,
      names: names.context,
      width: 400,
      height: 400,
      ratio: 2,
      masses,
      font: 'Plex Mono',
      ground: 'rgb(8 9 12)',
    });
    return { choice, picture, mark, names, done };
  }

  it('draws the window whole and the three where the film left them, and no number yet', () => {
    const { mark, names, done } = chosen('light');
    expect(done).toEqual(['strokes 0→1', 'lights 300,100']);
    expect(mark.named('clearRect')).toHaveLength(1);
    expect(names.calls).toEqual([]);
  });

  it('numbers the three by the first copy of each, outlined in the ground’s own tone', () => {
    const { choice, names } = chosen('light');
    choice.ring([]);
    expect(names.calls[0]).toMatchObject({ name: 'clearRect', args: [0, 0, 400, 400] });
    expect(names.named('fillText').map((call) => call.args[0])).toEqual(['1', '2', '3']);
    const [outline] = names.named('strokeText');
    expect(outline.set).toMatchObject({
      font: '26px Plex Mono',
      strokeStyle: 'rgb(8 9 12)',
      shadowColor: 'rgb(8 9 12)',
      lineWidth: 6,
    });
    const [figure] = names.named('fillText');
    expect(figure.set).toMatchObject({ fillStyle: MATERIALS.light.mark, shadowBlur: 0 });
    // The figure stands where its outline does; no body is ringed.
    expect(figure.args.slice(1)).toEqual(outline.args.slice(1));
    expect(names.named('arc')).toEqual([]);
  });

  it('rings a body pointed at in every copy, and draws the numbers’ layer alone again', () => {
    const { choice, picture, names, mark, done } = chosen('light');
    choice.ring([]);
    names.clear();
    mark.clear();
    done.length = 0;
    choice.ring([1]);
    // Both copies of body 2, a little inside its light.
    expect(names.named('arc').map((call) => call.args.slice(0, 3))).toEqual([
      [300, 100, picture.reach(200) * 0.9],
      [320, 100, picture.reach(200) * 0.9],
    ]);
    expect(names.named('fillText')).toHaveLength(3);
    // The picture itself is not drawn again.
    expect(done).toEqual([]);
    expect(mark.calls).toEqual([]);
  });

  it('rings a body on paper a little outside its outline', () => {
    const { choice, picture, names } = chosen('ink');
    choice.ring([0, 2]);
    expect(names.named('arc').map((call) => call.args.slice(0, 3))).toEqual([
      [100, 100, picture.reach(100) + 8],
      [200, 300, picture.reach(300) + 8],
    ]);
    expect(names.named('fillText')[0].set.fillStyle).toBe(MATERIALS.ink.mark);
  });

  it('finds a press on a body’s light, on any copy of it, or on its number', () => {
    const { choice, names } = chosen('light');
    choice.ring([]);
    // In CSS pixels of the stage: half the canvas's, at two pixels to one.
    expect(choice.pressed(50, 50, false)).toEqual({ body: 0 });
    expect(choice.pressed(160, 52, false)).toEqual({ body: 1 });
    const [, x, y] = names.named('fillText')[2].args as [string, number, number];
    expect(choice.pressed(x / 2, y / 2, false)).toEqual({ body: 2 });
    expect(choice.pressed(100, 100, false)).toBeNull();
    // A finger between two copies of one body has nothing to tell apart.
    expect(choice.pressed(55, 50, true)).toEqual({ body: 0 });
  });
});
