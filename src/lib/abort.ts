/**
 * One signal for work that stops when its owner does or when `ms` have passed, whichever comes
 * first.
 *
 * `AbortSignal.any([owner, AbortSignal.timeout(ms)])` says the same in a line, but `any` came
 * with Chrome 116, Firefox 124 and Safari 17.4, after the browsers the venue supports
 * (package.json, "browserslist"). In those it is not a function: the request that names it
 * throws before it is sent. So the two are linked by hand here, with what every supported
 * browser has, and eslint.config.mjs sends the next `AbortSignal.any` to this file.
 *
 * `done` lets go of the timer and of the owner once the work is over, so a finished request
 * leaves nothing waiting on an owner that lives on.
 */
export function withDeadline(
  owner: AbortSignal,
  ms: number,
): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const stop = () => controller.abort(owner.reason);
  const expire = () =>
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
  if (owner.aborted) stop();
  else owner.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(expire, ms);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      owner.removeEventListener('abort', stop);
    },
  };
}
