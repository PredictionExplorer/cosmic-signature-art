'use client';
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ShowWork } from './first-light-show';
import { setOverturePhase } from './overture-store';

/** The day's work as First Light performs it on the home. */
export type OvertureWork = ShowWork;

// Only a first visit loads the performance: a returning visitor never downloads it.
const FirstLightOverture = lazy(() => import('./first-light-overture'));

/**
 * Whether the first paint asked for the Overture (src/lib/room.ts) and it is not over: the
 * request lives on <html> until the Overture ends, so coming back to the home later in the
 * visit never plays it again.
 */
function overtureAsked() {
  return document.documentElement.hasAttribute('data-overture');
}
const noSubscription = () => () => {};

/** The page stands as it would have opened, the head with it: nothing is performed. */
function standAside() {
  setOverturePhase('done');
  document.documentElement.removeAttribute('data-overture');
}

/** A performance that cannot load or run never keeps the head waiting. */
class Fallible extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    standAside();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The home's one timed event, on a first visit only: First Light (docs/first-light.md §4), which
 * succeeds the Overture (third-physics.md §5.8) in its place and keeps its name here. The first
 * paint decides it (src/lib/room.ts) and holds back the running head; this performs it over the
 * day's plate, or, without a work to perform, lets the page stand at once.
 */
export function Overture({ work, skip }: { work: OvertureWork | null; skip: string }) {
  const requested = useSyncExternalStore(noSubscription, overtureAsked, () => false);
  const [over, setOver] = useState(false);
  const end = useCallback(() => setOver(true), []);
  useEffect(() => {
    if (requested && !work) standAside();
  }, [requested, work]);
  if (!requested || !work || over) return null;
  return (
    <Fallible>
      <Suspense fallback={null}>
        <FirstLightOverture work={work} skip={skip} onEnd={end} />
      </Suspense>
    </Fallible>
  );
}
