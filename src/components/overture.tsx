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
import type { OvertureWork } from './overture-performance';
import { setOverturePhase } from './overture-store';

export type { OvertureWork };

// Only a first visit loads the performance: a returning visitor never downloads it.
const OverturePerformance = lazy(() => import('./overture-performance'));

/**
 * Whether the first paint asked for the Overture (src/lib/room.ts) and it is not over: the
 * request lives on <html> until the Overture ends, so coming back to the home later in the
 * visit never plays it again.
 */
function overtureAsked() {
  return document.documentElement.hasAttribute('data-overture');
}
const noSubscription = () => () => {};

/** The black lifts and the page stands as it would have opened: nothing is performed. */
function standAside() {
  setOverturePhase('done');
  document.documentElement.removeAttribute('data-overture');
}

/** A performance that cannot load or run never keeps the page behind the black. */
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
 * The Overture (third-physics.md §5.8): the home's one timed event, on a first visit only. The
 * first paint decides it (src/lib/room.ts) and holds the page under black; this performs it
 * over the black, or, without a work to perform, lifts the black at once.
 */
export function Overture({ work }: { work: OvertureWork | null }) {
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
        <OverturePerformance work={work} onEnd={end} />
      </Suspense>
    </Fallible>
  );
}
