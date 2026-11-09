/**
 * An Ink film measured against its clock as it is decoded, frame by frame, at its own size, in
 * grey levels (scripts/build-ink-clocks.mjs).
 *
 * `places` holds, for every frame of the film, where the clock puts the three bodies: the primary
 * copy's pixels at the step the frame shows (src/lib/physics/ink-film.ts), as x, y for each body.
 * Each body is a solid ellipse of the area of a disc whose radius is 2.5 % of the sheet's height;
 * it holds no ink, and the water it carries is clear, so it travels in a hollow of paper ringed
 * by the ink it lays. The measure asks the film four things:
 *
 * - **The pre-roll.** Frame 0 is bare paper. Before `firstInked` no pixel is darker than it by
 *   `ink` levels or more, and at `firstInked` some are: the ink begins on the frame the clock
 *   says, exactly. Every pixel of that first ink lies within `firstInkReach` radii of the path a
 *   body took since the pre-roll ended (`path`: x, y for each body at every step from the first
 *   step inked to the frame's): the ink arrives where the bodies are. The soak zone of the most
 *   stretched body reaches 2.33 radii from its centre; the water carries fresh ink a little
 *   further within the frame.
 * - **The bodies.** From `firstInked` on, the pixel at every body's place is paper, never ink.
 * - **The hollows.** Where the paper around a body's place closes within `hollow.reach` radii
 *   into a hollow of a body's size, its centroid is compared with the body's places `offsets`
 *   frames either side: the median distance must be least at the frame's own place, and the
 *   point of the track nearest the centroid must lie, in the median, within `accept.offset` of a
 *   frame. The hollow is the clear water around a body, not its outline, so its centroid sits a
 *   few pixels off the body; what it gives is when, not where.
 * - **Repeats.** No frame after the first ink repeats the frame before it.
 */
export function createInkClockMeasure(
  { places, path, frames, firstInked, width, height },
  parameters,
) {
  const { ink, paperMargin, bodyRadius, firstInkReach, hollow, offsets } = parameters;
  if (places.length !== frames * 6) throw new Error('the places are not one set for each frame');
  if (!path.length || path.length % 6) throw new Error('the path since the pre-roll is empty');
  const size = width * height;
  const radius = bodyRadius * height;
  const reach = hollow.reach * radius;
  const side = 2 * Math.ceil(reach) + 3;
  const seen = new Int32Array(side * side);
  const stack = new Int32Array(side * side * 2);
  let stamp = 0;
  let first = null;
  let previous = null;
  let paper = 0;
  let index = 0;
  const preRoll = { inkedBefore: 0, firstInk: 0, beside: 0, farthest: 0 };
  const bodies = { placed: 0, onInk: 0 };
  const hollows = { measured: 0, open: 0 };
  const distances = Array.from({ length: 2 * offsets + 1 }, () => []);
  const nearest = [];
  let repeats = 0;

  const place = (frame, body) => [places[frame * 6 + body * 2], places[frame * 6 + body * 2 + 1]];
  /** How far, in radii, (x, y) lies from the bodies' path since the pre-roll ended. */
  const fromPath = (x, y) => {
    let closest = Infinity;
    for (let p = 0; p < path.length; p += 2) {
      const distance = Math.hypot(x - path[p], y - path[p + 1]);
      if (distance < closest) closest = distance;
    }
    return closest / radius;
  };

  /** The hollow around a place: the paper connected to it within reach, if it closes there. */
  function hollowAt(pixels, x, y) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const threshold = paper - paperMargin;
    const isPaper = (px, py) =>
      px >= 0 && py >= 0 && px < width && py < height && pixels[py * width + px] >= threshold;
    if (!isPaper(cx, cy)) return null;
    const left = cx - (side >> 1);
    const top = cy - (side >> 1);
    stamp += 1;
    let pointer = 0;
    stack[pointer++] = cx;
    stack[pointer++] = cy;
    seen[(cy - top) * side + (cx - left)] = stamp;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    while (pointer) {
      const py = stack[--pointer];
      const px = stack[--pointer];
      sumX += px + 0.5;
      sumY += py + 0.5;
      count += 1;
      for (let k = 0; k < 4; k++) {
        const nx = px + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = py + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return { open: true };
        if (Math.hypot(nx + 0.5 - x, ny + 0.5 - y) > reach) {
          if (isPaper(nx, ny)) return { open: true };
          continue;
        }
        const cell = (ny - top) * side + (nx - left);
        if (seen[cell] === stamp || !isPaper(nx, ny)) continue;
        seen[cell] = stamp;
        stack[pointer++] = nx;
        stack[pointer++] = ny;
      }
    }
    const disc = Math.sqrt(count / Math.PI) / radius;
    if (disc < hollow.radius[0] || disc > hollow.radius[1]) return { open: false, sized: false };
    return { open: false, sized: true, x: sumX / count, y: sumY / count };
  }

  /** How far along the body's track, in frames from `frame`, the point nearest (x, y) lies. */
  function along(frame, body, x, y) {
    let best = Infinity;
    let at = 0;
    for (let d = -offsets; d < offsets; d++) {
      const [ax, ay] = place(frame + d, body);
      const [bx, by] = place(frame + d + 1, body);
      const ex = bx - ax;
      const ey = by - ay;
      const length = ex * ex + ey * ey;
      const u = length > 0 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / length)) : 0;
      const distance = Math.hypot(ax + u * ex - x, ay + u * ey - y);
      if (distance < best) {
        best = distance;
        at = d + u;
      }
    }
    return at;
  }

  return {
    push(pixels) {
      if (index >= frames) throw new Error(`the film has more than its ${frames} frames`);
      if (pixels.length !== size) throw new Error('a frame is not the film’s size');
      if (index === 0) {
        first = Uint8Array.from(pixels);
        // Bare paper's own level: the first frame's median.
        const counts = new Int32Array(256);
        for (const value of first) counts[value] += 1;
        let seenCount = 0;
        for (let value = 0; value < 256; value++) {
          seenCount += counts[value];
          if (seenCount * 2 >= size) {
            paper = value;
            break;
          }
        }
      }
      if (index <= firstInked) {
        let inked = 0;
        for (let p = 0; p < size; p++)
          if (first[p] - pixels[p] >= ink) {
            inked += 1;
            if (index !== firstInked) continue;
            const away = fromPath((p % width) + 0.5, Math.floor(p / width) + 0.5);
            if (away <= firstInkReach) preRoll.beside += 1;
            if (away > preRoll.farthest) preRoll.farthest = away;
          }
        if (index < firstInked) preRoll.inkedBefore += inked;
        else preRoll.firstInk = inked;
      }
      if (index > firstInked && previous) {
        let same = true;
        for (let p = 0; p < size && same; p += 7) same = pixels[p] === previous[p];
        if (same) repeats += 1;
      }
      if (index >= firstInked) {
        previous ??= new Uint8Array(size);
        previous.set(pixels);
        for (let body = 0; body < 3; body++) {
          const [x, y] = place(index, body);
          const px = Math.floor(x);
          const py = Math.floor(y);
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          bodies.placed += 1;
          if (pixels[py * width + px] < paper - paperMargin) bodies.onInk += 1;
          const found = hollowAt(pixels, x, y);
          if (!found) continue;
          if (found.open) {
            hollows.open += 1;
            continue;
          }
          if (!found.sized) continue;
          hollows.measured += 1;
          for (let d = -offsets; d <= offsets; d++) {
            const frame = index + d;
            if (frame < 0 || frame >= frames) continue;
            const [ox, oy] = place(frame, body);
            distances[d + offsets].push(Math.hypot(found.x - ox, found.y - oy));
          }
          if (index - offsets >= 0 && index + offsets < frames)
            nearest.push(along(index, body, found.x, found.y));
        }
      }
      index += 1;
    },
    finish() {
      if (index !== frames)
        throw new Error(`the film ended after ${index} of its ${frames} frames`);
      const median = (values) => {
        if (!values.length) return null;
        const sorted = Float64Array.from(values).sort();
        return sorted[sorted.length >> 1];
      };
      return {
        frames: index,
        paper,
        preRoll: { ...preRoll, farthest: Math.round(preRoll.farthest * 1000) / 1000 },
        bodies,
        hollows: {
          ...hollows,
          distance: distances.map(median),
          offset: median(nearest),
        },
        repeats,
      };
    },
  };
}

/**
 * How a derivative of a film keeps its frames: each of its frames is compared, at a small size,
 * with the film's frame the clock says it holds (`start + j·every`) and with the film's frames
 * either side. A frame keeps its place when no neighbour matches it better by more than
 * `tolerance` grey levels in the mean; in bare paper every frame matches every other. Push the
 * derivative's frames first, then the film's.
 */
export function createDerivativeMatch({ start, every, frames }, { tolerance }) {
  const held = [];
  const scores = [];
  let sourceIndex = 0;
  const mean = (a, b) => {
    let sum = 0;
    for (let p = 0; p < a.length; p++) sum += Math.abs(a[p] - b[p]);
    return sum / a.length;
  };
  return {
    pushDerivative(pixels) {
      if (held.length >= frames)
        throw new Error(`the derivative has more than its ${frames} frames`);
      held.push(Uint8Array.from(pixels));
      scores.push([Infinity, Infinity, Infinity]);
    },
    pushSource(pixels) {
      if (held.length !== frames)
        throw new Error(`the derivative ended after ${held.length} of its ${frames} frames`);
      // The derivative's frames this source frame stands at, or beside.
      const s = sourceIndex;
      for (let j = Math.max(0, Math.floor((s - 1 - start) / every)); j < frames; j++) {
        const expected = start + j * every;
        if (expected - 1 > s) break;
        const d = s - expected;
        if (d >= -1 && d <= 1) scores[j][d + 1] = mean(held[j], pixels);
      }
      sourceIndex += 1;
    },
    finish() {
      let displaced = 0;
      let worst = 0;
      scores.forEach(([before, own, after], j) => {
        // The film's first and last frames have one neighbour only.
        const neighbour = Math.min(before, after);
        if (!Number.isFinite(own)) throw new Error(`the film has no frame ${start + j * every}`);
        const lead = own - neighbour;
        if (lead > tolerance) displaced += 1;
        if (lead > worst) worst = lead;
      });
      const own = scores.map((score) => score[1]);
      return {
        frames: held.length,
        displaced,
        worst: Math.round(worst * 1000) / 1000,
        meanDifference: Math.round((own.reduce((a, b) => a + b, 0) / own.length) * 1000) / 1000,
      };
    },
  };
}
