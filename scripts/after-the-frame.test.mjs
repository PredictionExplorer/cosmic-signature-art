/*
  After the frame (docs/after-the-frame.md §8.3 and §8.4): every sentence the page can say of a
  work past its frame, for all 72 works on Light and on Ink, held to a separate reading of the
  same path: with the frame held, and, where a visitor is asked whom to stay with, in the
  picture that stays with each of the three bodies. The page's own modules make the path, read
  it and word it; this file decides for itself, from the placed pixels alone, where a picture
  that stays with a body holds it, which body is off the picture at which sample, and takes
  each sentence apart to see that it is so.
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
const { HeldPlacement, framedSamples } = await src('lib/physics/framing.ts');
const { lightFilmDuration } = await src('lib/physics/light-film.ts');
const { deriveFate } = await src('lib/physics/orbit.ts');
const { beyondFact, beyondLine, heldScript } = await src('components/orbit-beyond.ts');
const { keptPicture, platePicture } = await src('components/orbit-picture.ts');

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
  // The recorded window as the frame places it: what the film itself showed, which a picture
  // kept on a body is read against.
  const framed = framedSamples(
    { ...start, positions: performed.window.positions, velocities: performed.window.velocities },
    frame,
    100,
  );
  const film = { pixels: framed.pixels, samples: framed.count + 1, size: framed.copies * 6 };
  return { orbit, fate, frame, path, pace, framed, film };
}

/** A printed span ("6.3 seconds", "1.7 minutes") in samples, with the half-digit its print allows. */
function span(text, perSecond) {
  const [, value, unit] = /([\d.]+) (seconds|minutes)/.exec(text);
  const seconds = unit === 'minutes' ? 60 : 1;
  return { samples: Number(value) * seconds * perSecond, slack: 0.05 * seconds * perSecond + 1 };
}

/**
 * Where a picture that stays with `held` holds it, worked out here and not by the page: as near
 * the middle as leaves every body drawn (`copies` of each) at least 0.045 of the frame's height
 * inside the picture as the film ends, or no nearer its edge than it stood. Each copy is moved
 * its own way by the same share, which is found by halving.
 */
function heldAt({ path, frame }, copies, held) {
  const { width, height } = frame;
  const margin = 0.045 * height;
  const at = (copy, body) => (copy * 3 + body) * 2;
  const fits = (share) => {
    for (let copy = 0; copy < copies; copy++) {
      const dx = (width / 2 - path.pixels[at(copy, held)]) * share;
      const dy = (height / 2 - path.pixels[at(copy, held) + 1]) * share;
      for (let body = 0; body < 3; body++) {
        const x = path.pixels[at(copy, body)];
        const y = path.pixels[at(copy, body) + 1];
        if (x + dx > Math.max(x, width - margin) || x + dx < Math.min(x, margin)) return false;
        if (y + dy > Math.max(y, height - margin) || y + dy < Math.min(y, margin)) return false;
      }
    }
    return true;
  };
  let share = 1;
  if (!fits(1)) {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 50; step++) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    share = low;
  }
  const anchors = [];
  for (let copy = 0; copy < copies; copy++) {
    const x = path.pixels[at(copy, held)];
    const y = path.pixels[at(copy, held) + 1];
    anchors.push([x + (width / 2 - x) * share, y + (height / 2 - y) * share]);
  }
  return { share, anchors };
}

/**
 * What is untrue of one work in one material, sentence by sentence and line by line: in the
 * work's own frame, or (`held`) in the picture that stays with one body.
 */
function untrue(work, material, held = null) {
  const { orbit, fate, frame, path, pace, framed, film } = work;
  const found = [];
  const perSecond = pace / path.stride;
  const names = frame.projection === 'position';
  const own = platePicture(
    { stride: 100, count: 1, copies: path.copies, pixels: new Float32Array(path.copies * 12) },
    frame,
    material,
    900,
    582,
    1,
  );
  const picture =
    held === null ? own : keptPicture(own, frame, framed, path.pixels, held, 900, 582);
  const script = heldScript(path, picture, fate, pace, names);
  // The separate reading: Light draws every copy of a body and Ink the first; a body is out of
  // the picture when no copy the material draws is on it. In a picture that stays with a body,
  // each copy is read from where that copy's own body is held.
  const copies = material === 'light' ? path.copies : 1;
  const placed = held === null ? null : heldAt(work, copies, held);
  if (placed && Math.abs(placed.share - picture.kept.towards) > 1e-6)
    found.push(`held ${placed.share} of the way to the middle here, ${picture.kept.towards} there`);
  const isOut = (sample, body) => {
    for (let copy = 0; copy < copies; copy++) {
      const at = (sample * path.copies * 3 + copy * 3 + body) * 2;
      let x = path.pixels[at];
      let y = path.pixels[at + 1];
      if (placed) {
        const from = (sample * path.copies * 3 + copy * 3 + held) * 2;
        x += placed.anchors[copy][0] - path.pixels[from];
        y += placed.anchors[copy][1] - path.pixels[from + 1];
      }
      if (x >= 0 && x <= frame.width && y >= 0 && y <= frame.height) return false;
    }
    return true;
  };
  const allOut = (sample) => [0, 1, 2].every((body) => isOut(sample, body));
  // What the page draws is where this reading puts it: every copy of every body, at a few
  // samples of the path, on the 900 by 582 canvas the picture was made for.
  if (placed) {
    const size = path.copies * 6;
    for (const sample of [0, Math.floor((path.samples - 1) / 2), path.samples - 1])
      for (let drawn = 0; drawn < copies * 3; drawn++) {
        const copy = Math.floor(drawn / 3);
        const from = sample * size + (copy * 3 + held) * 2;
        const x =
          path.pixels[sample * size + drawn * 2] - path.pixels[from] + placed.anchors[copy][0];
        const y =
          path.pixels[sample * size + drawn * 2 + 1] -
          path.pixels[from + 1] +
          placed.anchors[copy][1];
        const [px, py] = picture.continued(path.pixels, size, sample, drawn);
        const off = Math.hypot(px - (x * 900) / frame.width, py - (y * 582) / frame.height);
        // A share found by halving, and single-precision pixels: within a hundredth of a pixel.
        if (!(off < 0.01)) found.push(`body ${drawn} drawn ${off.toFixed(2)} px from its place`);
      }
  }
  /** In a picture that stays with a body: whether the other two are both out of it. */
  const others = [0, 1, 2].filter((body) => body !== held);
  const alone = (sample) => others.every((body) => isOut(sample, body));
  /** "Again": they had both been out before `since`, for as long as the line takes to say so. */
  const aloneBefore = (since) => {
    let longest = 0;
    let run = 0;
    for (let s = 0; s < since; s++) {
      run = alone(s) ? run + 1 : 0;
      if (run > longest) longest = run;
    }
    return longest >= Math.round(3 * perSecond);
  };
  /**
   * How far outside the picture a body stands at a sample, in widths of it: as far as the
   * nearest of the copies the material draws. `pixels` is the path past the window, or the
   * recorded window as the frame places it.
   */
  const farOut = (pixels, size, sample, body) => {
    let nearest = Infinity;
    for (let copy = 0; copy < copies; copy++) {
      let x = pixels[sample * size + (copy * 3 + body) * 2];
      let y = pixels[sample * size + (copy * 3 + body) * 2 + 1];
      if (placed) {
        x += placed.anchors[copy][0] - pixels[sample * size + (copy * 3 + held) * 2];
        y += placed.anchors[copy][1] - pixels[sample * size + (copy * 3 + held) * 2 + 1];
      }
      const dx = Math.max(0, -x, x - frame.width);
      const dy = Math.max(0, -y, y - frame.height);
      nearest = Math.min(nearest, Math.hypot(dx, dy) / frame.width);
    }
    return nearest;
  };
  /** How far outside this picture the film itself showed a body stand, at most. */
  const filmed = (body) => {
    let most = 0;
    for (let sample = 0; sample < film.samples; sample++)
      most = Math.max(most, farOut(film.pixels, film.size, sample, body));
    return most;
  };
  /**
   * Whether a body is seen to go within eight seconds of `back`: out for three seconds or to
   * the path's end, and a tenth of a width farther than the film ever showed it stand. A return
   * such a leaving follows is not one to end on, nor to tell as "It came back".
   */
  const goesAgain = (body, back) => {
    const size = path.copies * 6;
    const beyond = 0.1 + (placed ? filmed(body) : 0);
    for (let s = back; s < Math.min(last, back + Math.round(8 * perSecond)); s++) {
      if (!isOut(s, body) || isOut(s - 1, body)) continue;
      let until = s;
      let farthest = 0;
      while (until <= last && isOut(until, body)) {
        farthest = Math.max(farthest, farOut(path.pixels, size, until, body));
        until += 1;
      }
      if ((until > last || until - s >= Math.round(3 * perSecond)) && farthest >= beyond)
        return true;
    }
    return false;
  };
  if (placed) {
    if (!others.every((body) => !isOut(0, body))) found.push('a body out as the film ends');
    for (let sample = 0; sample < path.samples; sample += 97)
      if (isOut(sample, held)) found.push('the body the picture stays with is out of it');
  }
  const last = path.samples - 1;
  const end = script.ending.sample;
  const lastStep = path.from + last * path.stride;
  // What the film itself showed in this picture: whether a body stood off it at all, and
  // whether for three seconds at a stretch (§8.4: "What counts as an event").
  let filmShowsOut = false;
  let filmShowsOutLong = false;
  if (placed)
    for (const body of others) {
      let run = 0;
      for (let sample = 0; sample < film.samples; sample++) {
        run = farOut(film.pixels, film.size, sample, body) > 0 ? run + 1 : 0;
        if (run > 0) filmShowsOut = true;
        if (run >= Math.round(3 * perSecond)) filmShowsOutLong = true;
      }
    }
  // Where a performance ends, by this reading's own account of the rule (absences.ts), for an
  // orbit the record does not find a free body in as far as the path goes: on the first return
  // a visitor sees that stays, two seconds after it; unless a body they have seen go is out to
  // the path's end from before then, which the picture ends on instead. Every stretch a body
  // is off the picture is found from the pixels; one is seen if it lasts three seconds (or to
  // the path's end) and takes the body a tenth of a width farther than the film showed it; a
  // return stays if the body is then on the picture for two seconds and at the sample after
  // them (a crossing, or a stretch nobody sees, begins them again when it ends; one the path
  // ends inside means it has not stayed), and is not seen to go again within eight seconds.
  const beat = Math.round(2 * perSecond);
  const linger = Math.round(8 * perSecond);
  const long = Math.round(3 * perSecond);
  const stretches = (body) => {
    const found = [];
    let open = null;
    for (let s = 0; s <= last; s++) {
      if (isOut(s, body)) {
        if (!open) found.push((open = { body, from: s, to: null, farthest: 0 }));
        open.farthest = Math.max(open.farthest, farOut(path.pixels, path.copies * 6, s, body));
      } else if (open) {
        open.to = s;
        open = null;
      }
    }
    return found;
  };
  const shown = (held === null ? [0, 1, 2] : others).map(stretches);
  const farther = [0, 1, 2].map((body) => 0.1 + (placed ? filmed(body) : 0));
  const sees = (one) =>
    (one.to === null || one.to - one.from >= long) && one.farthest >= farther[one.body];
  const staysFrom = (one) => {
    const own = shown.find((list) => list[0]?.body === one.body);
    let at = one.to;
    for (const next of own) {
      if (next.from < at) continue;
      if (next.from - at > beat) break;
      if (sees(next) || next.to === null) return null;
      at = next.to;
    }
    if (path.lost && last - at < beat) return null;
    return own.some((next) => next.from >= at && next.from - at < linger && sees(next)) ? null : at;
  };
  const dated =
    fate.outcome === 'ejection' &&
    fate.ejectionStep !== null &&
    Math.ceil((confirmedAt(fate.ejectionStep) - path.from) / path.stride) <= last;
  if (!dated) {
    const first = shown
      .flat()
      .sort((a, b) => a.from - b.from || a.body - b.body)
      .map((one) => (one.to !== null && sees(one) ? { one, back: staysFrom(one) } : null))
      .find((candidate) => candidate && candidate.back !== null);
    const stays = first ? Math.min(last, first.back + beat) : null;
    // A body a visitor has seen go that is out to the path's end: on a stretch they see, or
    // one that follows such a stretch of that body's. Where the energy was lost the path
    // stops, and none is gone to its end.
    const [gone] = path.lost
      ? []
      : shown
          .flat()
          .filter(
            (one) =>
              one.to === null &&
              shown.flat().some((b) => b.body === one.body && b.from <= one.from && sees(b)),
          )
          .sort((a, b) => a.from - b.from);
    const expected = stays !== null && !(gone && gone.from < stays) ? stays : null;
    if (expected === null && script.ending.kind === 'returned')
      found.push(
        'ends on a return, where this reading finds none that stays before a body is gone',
      );
    if (expected !== null && (script.ending.kind !== 'returned' || end !== expected))
      found.push(
        `ends ${script.ending.kind} at ${(end / perSecond).toFixed(1)} s, where this reading has body ${first.one.body + 1} back to stay and the end at ${(expected / perSecond).toFixed(1)} s`,
      );
    // A body gone to the path's end, with no return to end on before it, is what the picture
    // ends on: that body away, the kept body alone, or the picture emptied.
    if (expected === null && gone && !['away', 'alone', 'empty'].includes(script.ending.kind))
      found.push(
        `ends ${script.ending.kind}, where this reading has body ${gone.body + 1} gone from ${(gone.from / perSecond).toFixed(1)} s to the path's end`,
      );
    // Nothing a visitor saw is performed and left untold: the horizon's ending is for a
    // picture in which no body was seen to go.
    if (script.ending.kind === 'record' && shown.flat().some(sees))
      found.push('ends as if nothing happened, where this reading sees a body go');
  }
  const fact = beyondFact(script, path, fate, en, number);
  if (placed && fact[0] !== `The picture stayed with body ${held + 1}.`)
    found.push(`not said first whom the picture stayed with: ${fact[0]}`);
  let left = null;
  for (const sentence of fact) {
    const wrong = (why) => found.push(`${why}: ${sentence}`);
    let m;
    // A sentence that leans on the leaving told before it, where this reading found none: said
    // so, and passed over, so that the rest of what is untrue is still listed.
    if (
      !left &&
      /^(It came back .+ later|.+ later (body \d was|the other two (had|were)) .+|The other two had already left it|At step [\d,]+, where the record stops looking, it has not come back.+)\.$/.test(
        sentence,
      )
    ) {
      wrong('said of a leaving this reading did not find');
      continue;
    }
    if ((m = /^The picture stayed with body (\d)\.$/.exec(sentence))) {
      if (held === null || Number(m[1]) - 1 !== held) wrong('not the picture on view');
    } else if (
      (m = /^Body (\d) was (again )?alone in it from (.+) after the film ended\.$/.exec(sentence))
    ) {
      if (Number(m[1]) - 1 !== held) wrong('not the body the picture stays with');
      const { samples, slack } = span(m[3], perSecond);
      let since = -1;
      for (
        let s = Math.max(1, Math.floor(samples - slack));
        s <= Math.min(last, Math.ceil(samples + slack));
        s++
      )
        if (alone(s) && !alone(s - 1)) since = s;
      if (since < 0) {
        wrong('the other two not first both out at the time said');
        continue;
      }
      for (let s = since; s <= last; s++)
        if (!alone(s)) {
          wrong('one of the other two is back before the path ends');
          break;
        }
      if (!!m[2] !== aloneBefore(since))
        wrong(aloneBefore(since) ? 'alone before, and not said again' : '"again" wrongly');
    } else if (
      (m = /^Body (\d) was (again )?alone in it for (.+), from (.+) after the film ended\.$/.exec(
        sentence,
      ))
    ) {
      if (Number(m[1]) - 1 !== held) wrong('not the body the picture stays with');
      const length = span(m[3], perSecond);
      const from = span(m[4], perSecond);
      let since = -1;
      for (
        let s = Math.max(1, Math.floor(from.samples - from.slack));
        s <= Math.min(last, Math.ceil(from.samples + from.slack));
        s++
      )
        if (alone(s) && !alone(s - 1)) since = s;
      if (since < 0) {
        wrong('the other two not first both out at the time said');
        continue;
      }
      let until = since;
      while (until <= last && alone(until)) until += 1;
      if (until > last) wrong('alone to the path’s end, not for a while');
      if (Math.abs(until - since - length.samples) > length.slack + 1)
        wrong(`alone for ${((until - since) / perSecond).toFixed(1)} s`);
      if (!!m[2] !== aloneBefore(since))
        wrong(aloneBefore(since) ? 'alone before, and not said again' : '"again" wrongly');
    } else if ((m = /^(.+) later body (\d) was still in it\.$/.exec(sentence))) {
      const body = Number(m[2]) - 1;
      if (body === held || body === left.body) wrong('not the one that stayed by it');
      const { samples, slack } = span(m[1], perSecond);
      if (Math.abs(left.sample + samples - end) > slack + 1)
        wrong('not at the last sample performed');
      for (let s = left.sample; s <= end; s++)
        if (isOut(s, body)) {
          wrong('that body is out of the picture in the time said');
          break;
        }
    } else if (
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
      // "Again" and "last" are said after an earlier absence that lasted three seconds, which
      // the line had named; a crossing of a few samples before does not make them so.
      let before = false;
      for (let s = 0, run = 0; s < crossing && !before; s++) {
        run = isOut(s, body) ? run + 1 : 0;
        before = run >= Math.round(3 * perSecond);
      }
      let back = false;
      for (let s = crossing; s <= last && !back; s++) back = !isOut(s, body);
      if (m[2] === 'left the picture' && before)
        wrong('"left" of a body the line had named out before');
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
      else {
        // Until then it may have crossed the edge, but never stood on the picture two seconds.
        for (let s = left.sample, on = 0; s < back; s++) {
          on = isOut(s, left.body) ? 0 : on + 1;
          if (on >= beat) {
            wrong('on the picture for two seconds before the time said');
            break;
          }
        }
        // A return to end on stays: the body is on the picture as the performance ends, and
        // is not seen to go again within eight seconds of coming back.
        if (isOut(end, left.body)) wrong('out of the picture again as the performance ends');
        if (goesAgain(left.body, back)) wrong('seen to go again within eight seconds');
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
  // The running line, eight times a second of film, to the performance's end. In a picture
  // that stays with a body it says so first, and never that all three are out.
  const clock = /^\d\d:\d\d past the film · step [\d,]+$/;
  const prefix = (body) => en.beyondKeptLine.replace('{body}', body + 1).replace('{line}', '');
  const first = held === null ? '' : prefix(held);
  for (let sample = 0; sample <= end; sample += Math.max(1, Math.round(perSecond / 8))) {
    const said = beyondLine(script, path, sample, en, number);
    const wrong = (why) => found.push(`${why}, ${(sample / perSecond).toFixed(1)} s on: ${said}`);
    if (
      !said.startsWith(first) ||
      (held === null && [0, 1, 2].some((body) => said.startsWith(prefix(body))))
    )
      wrong('not said whom the picture stays with');
    const line = said.slice(first.length);
    let m;
    if (!names && !clock.test(line)) wrong('a body named in a picture of another space');
    if (line.endsWith('all three are out of the picture')) {
      if (held !== null || !allOut(sample)) wrong('not all three out');
    } else if ((m = /bodies (\d) and (\d) are out of the picture$/.exec(line))) {
      if (!isOut(sample, Number(m[1]) - 1) || !isOut(sample, Number(m[2]) - 1))
        wrong('one of the two is on the picture');
    } else if ((m = /body (\d) is out of the picture/.exec(line))) {
      if (!isOut(sample, Number(m[1]) - 1)) wrong('that body is on the picture');
    } else if (!clock.test(line)) wrong('a line this test does not know');
  }
  return {
    found,
    kind: script.ending.kind,
    seconds: end / perSecond,
    fact,
    towards: placed ? placed.share : null,
    filmShowsOut,
    filmShowsOutLong,
  };
}

/**
 * Nothing untrue: fails with the first of what was found, and how many more. (The whole list
 * is not handed to the assertion: every sample of every line can be on it, and comparing a
 * list that long with an empty one takes more memory than a machine has.)
 */
function assertNone(problems) {
  const more = problems.length > 40 ? `\n… and ${problems.length - 40} more` : '';
  assert.equal(problems.length, 0, problems.slice(0, 40).join('\n') + more);
}

/** Each work carried once, for both tests. */
const carriedWorks = new Map();
const workOf = (id) => {
  if (!carriedWorks.has(id)) carriedWorks.set(id, carried(id));
  return carriedWorks.get(id);
};

test('every sentence After the frame can say is true of its work, on Light and on Ink', () => {
  const kinds = { empty: [], returned: [], adrift: [], away: [], record: [], parted: [] };
  const lengths = [];
  const askedLengths = [];
  const leftAgain = [];
  const lastLeft = [];
  const toldOtherwise = [];
  const problems = [];
  let sentences = 0;
  for (let id = 0; id < WORKS; id++) {
    const work = workOf(id);
    const light = untrue(work, 'light');
    const ink = untrue(work, 'ink');
    if (work.frame.projection === 'position' && work.path.samples > 1)
      askedLengths.push(light.seconds);
    if (light.fact.some((sentence) => / left the picture again /.test(sentence)))
      leftAgain.push(id);
    if (light.fact.some((sentence) => / last left the picture /.test(sentence))) lastLeft.push(id);
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
  assertNone(problems);
  assert.equal(sentences, 344);

  // What §8.3 says of the collection, so the document cannot drift from the works.
  const counts = Object.fromEntries(Object.entries(kinds).map(([kind, ids]) => [kind, ids.length]));
  assert.deepEqual(counts, { empty: 28, returned: 27, adrift: 11, away: 2, record: 2, parted: 2 });
  assert.deepEqual(kinds.parted, [16, 30]);
  // A mark of another space last leaves its picture, and the performance ends a while after
  // (no sentence names it); and two in which nothing a visitor sees leaves at all.
  assert.deepEqual(kinds.away, [7, 33]);
  assert.deepEqual(kinds.record, [12, 15]);
  // Three works have nothing to perform: their energy broke inside the recorded window.
  assert.deepEqual(
    lengths.flatMap((seconds, id) => (seconds === 0 ? [id] : [])),
    [22, 66, 68],
  );
  const sorted = lengths.toSorted((a, b) => a - b);
  assert.equal(Math.round((sorted[35] + sorted[36]) / 2), 50);
  assert.equal(lengths.filter((seconds) => seconds > 60).length, 32);
  assert.equal(lengths.filter((seconds) => seconds > 120).length, 20);
  // Each material is told of its own picture: only the work drawn twelve times differs.
  assert.deepEqual(toldOtherwise, [8]);
  // "Again" and "last" are said after an earlier absence the line had named (§8.4).
  assert.deepEqual(leftAgain, [11, 18, 27, 34, 41]);
  assert.deepEqual(lastLeft, [9, 13, 14, 17, 30, 38, 40, 47, 60, 65, 69, 71]);
  // The frame's median over the 58 works a visitor is asked about, which §8.4 sets beside
  // that of the pictures kept on a body.
  const asked = askedLengths.toSorted((a, b) => a - b);
  assert.equal(asked.length, 58);
  assert.equal(Math.round((asked[28] + asked[29]) / 2), 51);
});

test('every sentence of a picture that stays with one body is true of its work, on Light and on Ink', () => {
  const kinds = { alone: [], parted: [], returned: [], adrift: [], away: [], record: [] };
  const lengths = [];
  const brought = { middle: 0, part: 0, none: 0 };
  const again = [];
  const aloneFor = [];
  const aloneForAgain = [];
  const film = { showsOut: 0, showsOutLong: 0 };
  let stillInIt = 0;
  const toldOtherwise = [];
  const aloneBound = [];
  const problems = [];
  const asked = [];
  let sentences = 0;
  for (let id = 0; id < WORKS; id++) {
    const work = workOf(id);
    // A visitor is asked whom to stay with where the picture draws the bodies where they were,
    // and the path holds something to perform.
    if (work.frame.projection !== 'position' || work.path.samples < 2) continue;
    asked.push(id);
    for (let held = 0; held < 3; held++) {
      const name = `№ ${String(id).padStart(3, '0')} with body ${held + 1}`;
      const light = untrue(work, 'light', held);
      const ink = untrue(work, 'ink', held);
      for (const [material, read] of [
        ['Light', light],
        ['Ink', ink],
      ]) {
        sentences += read.fact.length;
        for (const one of read.found) problems.push(`${name} on ${material}: ${one}`);
      }
      kinds[light.kind].push(`${id}/${held + 1}`);
      if (light.kind === 'alone' && work.orbit.fate.outcome !== 'ejection')
        aloneBound.push(`${id}/${held + 1}`);
      lengths.push(light.seconds);
      // Found by halving, so nothing is exactly none of the way.
      brought[light.towards > 1 - 1e-9 ? 'middle' : light.towards < 1e-9 ? 'none' : 'part'] += 1;
      if (light.fact.some((sentence) => / was again alone in it from /.test(sentence)))
        again.push(`${id}/${held + 1}`);
      if (light.fact.some((sentence) => / alone in it for /.test(sentence)))
        aloneFor.push(`${id}/${held + 1}`);
      if (light.fact.some((sentence) => / was again alone in it for /.test(sentence)))
        aloneForAgain.push(`${id}/${held + 1}`);
      if (light.filmShowsOut) film.showsOut += 1;
      if (light.filmShowsOutLong) film.showsOutLong += 1;
      if (light.fact.some((sentence) => / was still in it\.$/.test(sentence))) stillInIt += 1;
      if (light.fact.join(' ') !== ink.fact.join(' ')) toldOtherwise.push(`${id}/${held + 1}`);
    }
  }
  assertNone(problems);

  // What §8.4 says of the collection, so the document cannot drift from the works: one tally,
  // so that a change prints all of it.
  const sorted = lengths.toSorted((a, b) => a - b);
  assert.deepEqual(
    {
      asked: asked.length,
      endings: Object.fromEntries(Object.entries(kinds).map(([kind, ids]) => [kind, ids.length])),
      // A body goes and is not back when the record stops looking; and no picture in which
      // nothing a visitor sees happens at all.
      away: kinds.away,
      record: kinds.record,
      // Two bodies alone in a bound orbit: the one that goes apart from the other two.
      aloneBound,
      brought,
      again,
      aloneFor: aloneFor.length,
      aloneForAgain,
      // Pictures in which the film itself showed a body off them, and for three seconds.
      film,
      // The one that stayed by the body, said to be still in it: there for all eight seconds.
      stillInIt,
      median: Math.round((sorted[86] + sorted[87]) / 2),
      overAMinute: lengths.filter((seconds) => seconds > 60).length,
      overTwo: lengths.filter((seconds) => seconds > 120).length,
      sentences,
      // Each material is told of its own picture.
      toldOtherwise,
    },
    {
      asked: 58,
      endings: { alone: 25, parted: 46, returned: 77, adrift: 21, away: 5, record: 0 },
      away: ['37/3', '52/1', '52/2', '62/1', '62/2'],
      record: [],
      aloneBound: ['52/3', '62/3'],
      brought: { middle: 142, part: 32, none: 0 },
      again: ['13/3', '14/2', '17/1', '30/3', '38/3', '40/1', '47/3', '52/3', '69/3', '71/2'],
      aloneFor: 32,
      aloneForAgain: ['27/3', '36/2'],
      film: { showsOut: 86, showsOutLong: 30 },
      stillInIt: 44,
      median: 51,
      overAMinute: 70,
      overTwo: 29,
      sentences: 1191,
      toldOtherwise: ['46/1', '46/2', '46/3'],
    },
  );
});
