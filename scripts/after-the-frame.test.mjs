/*
  After the frame, with the frame held (docs/after-the-frame.md §8.3): every sentence the page
  can say of a work past its frame, for all 72 works on Light and on Ink, held to a separate
  reading of the same path. The page's own modules make the path, read it and word it; this
  file decides for itself, from the placed pixels alone, which body is off the frame at which
  sample, and takes each sentence apart to see that it is so.
*/
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
register('./lib/source-imports.mjs', import.meta.url, { data: { root } });

const src = (name) => import(new URL(`../src/${name}`, import.meta.url).href);
const { plateFrame } = await src('lib/art/orbit-frames.ts');
const { workOrbit } = await src('lib/art/orbit-records.ts');
const { performedOrbits } = await src('lib/art/orbit-windows.ts');
const { catalogs } = await src('lib/i18n/messages.ts');
const { beyondPath, confirmedAt } = await src('lib/physics/beyond.ts');
const { HeldPlacement } = await src('lib/physics/framing.ts');
const { lightFilmDuration } = await src('lib/physics/light-film.ts');
const { deriveFate } = await src('lib/physics/orbit.ts');
const { beyondFact, beyondLine, heldScript } = await src('components/orbit-beyond.ts');
const { platePicture } = await src('components/orbit-picture.ts');

const en = catalogs.en;
const number = new Intl.NumberFormat('en');
const WORKS = 72;

/** A work's fate run and its path past the window, as the orbit worker makes them. */
function carried(id) {
  const orbit = workOrbit(id);
  const [performed] = performedOrbits([id]);
  const steps = orbit.generation.steps;
  const pace = steps / lightFilmDuration(steps);
  const start = { masses: orbit.published.masses, dt: orbit.generation.dt, steps };
  const fate = deriveFate(
    { ...start, positions: performed.window.positions, velocities: performed.window.velocities },
    { steps, threshold: orbit.fate.escapeThreshold, horizonSteps: orbit.fate.horizonSteps },
  );
  const frame = plateFrame(id);
  const path = beyondPath({
    ...start,
    fate,
    pace,
    stride: 100,
    plate: new HeldPlacement(frame, start),
  });
  return { orbit, fate, frame, path, pace };
}

/** A printed span ("6.3 seconds", "1.7 minutes") in samples, with the half-digit its print allows. */
function span(text, perSecond) {
  const [, value, unit] = /([\d.]+) (seconds|minutes)/.exec(text);
  const seconds = unit === 'minutes' ? 60 : 1;
  return { samples: Number(value) * seconds * perSecond, slack: 0.05 * seconds * perSecond + 1 };
}

/** What is untrue of one work in one material, sentence by sentence and line by line. */
function untrue({ orbit, fate, frame, path, pace }, material) {
  const found = [];
  const perSecond = pace / path.stride;
  const names = frame.projection === 'position';
  const picture = platePicture(
    { stride: 100, count: 1, copies: path.copies, pixels: new Float32Array(path.copies * 12) },
    frame,
    material,
    900,
    582,
    1,
  );
  const script = heldScript(path, picture, fate, pace, names);
  // The separate reading: Light draws every copy of a body and Ink the first; a body is out of
  // the picture when no copy the material draws is on the frame.
  const copies = material === 'light' ? path.copies : 1;
  const isOut = (sample, body) => {
    for (let copy = 0; copy < copies; copy++) {
      const at = (sample * path.copies * 3 + copy * 3 + body) * 2;
      const x = path.pixels[at];
      const y = path.pixels[at + 1];
      if (x >= 0 && x <= frame.width && y >= 0 && y <= frame.height) return false;
    }
    return true;
  };
  const allOut = (sample) => [0, 1, 2].every((body) => isOut(sample, body));
  const last = path.samples - 1;
  const end = script.ending.sample;
  const lastStep = path.from + last * path.stride;
  const fact = beyondFact(script, path, fate, en, number);
  let left = null;
  for (const sentence of fact) {
    const wrong = (why) => found.push(`${why}: ${sentence}`);
    let m;
    if (
      (m =
        /^Body (\d) (left the picture again|left the picture|last left the picture) (.+) after the film ended\.$/.exec(
          sentence,
        ))
    ) {
      if (!names) wrong('a body named in a picture that does not draw positions');
      const body = Number(m[1]) - 1;
      const { samples, slack } = span(m[3], perSecond);
      let crossing = -1;
      const from = Math.max(1, Math.floor(samples - slack));
      for (let s = from; s <= Math.min(last, Math.ceil(samples + slack)); s++)
        if (!isOut(s - 1, body) && isOut(s, body)) crossing = s;
      if (crossing < 0) {
        wrong('no crossing of the edge at the time said');
        continue;
      }
      let before = false;
      for (let s = 0; s < crossing && !before; s++) before = isOut(s, body);
      let back = false;
      for (let s = crossing; s <= last && !back; s++) back = !isOut(s, body);
      if (m[2] === 'left the picture' && before) wrong('"left" of a body that had left before');
      if (m[2] === 'left the picture again' && !(before && back)) wrong('"left again" wrongly');
      if (m[2] === 'last left the picture' && !(before && !back)) wrong('"last left" wrongly');
      left = { body, sample: crossing };
    } else if ((m = /^It came back (.+) later\.$/.exec(sentence))) {
      const { samples, slack } = span(m[1], perSecond);
      const at = left.sample + samples;
      let back = -1;
      for (
        let s = Math.max(1, Math.floor(at - slack));
        s <= Math.min(last, Math.ceil(at + slack));
        s++
      )
        if (isOut(s - 1, left.body) && !isOut(s, left.body)) back = s;
      if (back < 0) wrong('not back at the time said');
      else
        for (let s = left.sample; s < back; s++)
          if (!isOut(s, left.body)) {
            wrong('back sooner than said');
            break;
          }
    } else if ((m = /^(.+) later the other two had left it too\.$/.exec(sentence))) {
      const { samples, slack } = span(m[1], perSecond);
      const at = left.sample + samples;
      let emptied = false;
      for (
        let s = Math.max(1, Math.floor(at - slack));
        s <= Math.min(last, Math.ceil(at + slack));
        s++
      )
        if (allOut(s) && !allOut(s - 1)) emptied = true;
      if (!emptied) wrong('all three not first out at the time said');
    } else if (sentence === 'The other two had already left it.') {
      if (![0, 1, 2].every((body) => body === left.body || isOut(left.sample, body)))
        wrong('the other two were not both out');
    } else if (/^(.+) later the other two were still in it\.$/.test(sentence)) {
      if ([0, 1, 2].some((body) => body !== left.body && isOut(end, body)))
        wrong('one of the other two is out at the end');
    } else if (
      (m = /^The record finds body (\d) no longer bound to the other two at step ([\d,]+)\.$/.exec(
        sentence,
      ))
    ) {
      const step = Number(m[2].replaceAll(',', ''));
      const recorded = orbit.fate;
      if (
        recorded.outcome !== 'ejection' ||
        recorded.escaper !== Number(m[1]) - 1 ||
        recorded.ejectionStep !== step
      )
        wrong('not what the record finds');
      if (confirmedAt(step) > lastStep) wrong('the path does not reach the step that confirms it');
    } else if (
      sentence ===
      'All three are still bound to one another at step 8,000,000, where the record stops looking.'
    ) {
      if (orbit.fate.outcome !== 'eternal_dance' || path.lost || lastStep !== 8_000_000)
        wrong('not bound to the horizon with its energy kept');
    } else if (
      sentence ===
      'At step 8,000,000, where the record stops looking, it has not come back, and all three are still bound to one another.'
    ) {
      if (orbit.fate.outcome !== 'eternal_dance' || path.lost || !isOut(last, left.body))
        wrong('back, or not bound to the horizon');
    } else if (
      (m = /^Past step ([\d,]+) this is not an orbit: the computed energy changed by .+\.$/.exec(
        sentence,
      ))
    ) {
      if (path.lost?.step !== Number(m[1].replaceAll(',', '')))
        wrong('not where the energy was lost');
    } else wrong('a sentence this test does not know');
  }
  // The running line, eight times a second of film, to the performance's end.
  const clock = /^\d\d:\d\d past the film · step [\d,]+$/;
  for (let sample = 0; sample <= end; sample += Math.max(1, Math.round(perSecond / 8))) {
    const line = beyondLine(script, path, sample, en, number);
    const wrong = (why) => found.push(`${why}, ${(sample / perSecond).toFixed(1)} s on: ${line}`);
    let m;
    if (!names && !clock.test(line)) wrong('a body named in a picture of another space');
    if (line.endsWith('all three are out of the picture')) {
      if (!allOut(sample)) wrong('not all three out');
    } else if ((m = /bodies (\d) and (\d) are out of the picture$/.exec(line))) {
      if (!isOut(sample, Number(m[1]) - 1) || !isOut(sample, Number(m[2]) - 1))
        wrong('one of the two is on the picture');
    } else if ((m = /body (\d) is out of the picture/.exec(line))) {
      if (!isOut(sample, Number(m[1]) - 1)) wrong('that body is on the picture');
    } else if (!clock.test(line)) wrong('a line this test does not know');
  }
  return { found, kind: script.ending.kind, seconds: end / perSecond, fact };
}

test('every sentence After the frame can say is true of its work, on Light and on Ink', () => {
  const kinds = { empty: [], returned: [], adrift: [], record: [], parted: [] };
  const lengths = [];
  const toldOtherwise = [];
  const problems = [];
  let sentences = 0;
  for (let id = 0; id < WORKS; id++) {
    const work = carried(id);
    const light = untrue(work, 'light');
    const ink = untrue(work, 'ink');
    for (const [material, read] of [
      ['Light', light],
      ['Ink', ink],
    ]) {
      sentences += read.fact.length;
      for (const one of read.found)
        problems.push(`№ ${String(id).padStart(3, '0')} on ${material}: ${one}`);
    }
    kinds[light.kind].push(id);
    lengths.push(light.seconds);
    if (light.fact.join(' ') !== ink.fact.join(' ')) toldOtherwise.push(id);
  }
  assert.deepEqual(problems, []);
  assert.equal(sentences, 344);

  // What §8.3 says of the collection, so the document cannot drift from the works.
  const counts = Object.fromEntries(Object.entries(kinds).map(([kind, ids]) => [kind, ids.length]));
  assert.deepEqual(counts, { empty: 27, returned: 28, adrift: 11, record: 4, parted: 2 });
  assert.deepEqual(kinds.parted, [16, 30]);
  // Three works have nothing to perform: their energy broke inside the recorded window.
  assert.deepEqual(
    lengths.flatMap((seconds, id) => (seconds === 0 ? [id] : [])),
    [22, 66, 68],
  );
  const sorted = lengths.toSorted((a, b) => a - b);
  assert.equal(Math.round((sorted[35] + sorted[36]) / 2), 47);
  assert.equal(lengths.filter((seconds) => seconds > 60).length, 31);
  assert.equal(lengths.filter((seconds) => seconds > 120).length, 19);
  // Each material is told of its own picture: only the work drawn twelve times differs.
  assert.deepEqual(toldOtherwise, [8]);
});
