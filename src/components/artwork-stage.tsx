'use client';

import {
  addTransitionType,
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  ViewTransition,
  type ReactNode,
} from 'react';
import type { ArtInterpretation } from '@/lib/art/types';
import { useMotion } from './motion-provider';
import styles from './artwork-stage.module.css';

const preparationDeadline = 8000;
const transitionTypes = {
  ink: 'cosmic-expression-to-ink',
  light: 'cosmic-expression-to-light',
  default: 'cosmic-expression-dissolve',
};

/**
 * Prepare only an explicitly requested still. The current work remains visible until
 * its replacement can be decoded; a slow or unavailable image never leaves a blank room.
 * The enclosing viewer keys this hook by artwork identity and initial expression.
 */
export function useArtworkExpression({
  media,
  initialExpression,
  onCommit,
}: {
  media: readonly ArtInterpretation[];
  initialExpression?: string;
  onCommit?: (expression: string) => void;
}) {
  const [expression, setExpression] = useState(
    media.find((item) => item.id === initialExpression)?.id ??
      (media.some((item) => item.id === 'ink') ? 'ink' : (media[0]?.id ?? 'light')),
  );
  const [pendingExpression, setPendingExpression] = useState<string | null>(null);
  const [failedExpression, setFailedExpression] = useState<string | null>(null);
  const preparation = useRef<(() => void) | null>(null);
  const request = useRef(0);
  const previousExpression = useRef(expression);
  const reportCommit = useEffectEvent((committed: string) => onCommit?.(committed));
  const { paused, reducedMotion } = useMotion();
  useEffect(() => {
    if (previousExpression.current === expression) return;
    previousExpression.current = expression;
    // A prepared transition can still suspend or be superseded. Report only a real
    // commit, so canceled selections never reset a parent's active transport state.
    reportCommit(expression);
  }, [expression]);
  // A preference change while decoding must apply to the eventual transition too.
  const motion = useRef({ paused, reducedMotion });
  useEffect(() => {
    motion.current = { paused, reducedMotion };
  }, [paused, reducedMotion]);
  useEffect(
    () => () => {
      request.current += 1;
      preparation.current?.();
    },
    [],
  );

  function cancelPending() {
    request.current += 1;
    preparation.current?.();
    preparation.current = null;
    // Supersede even a decoded selection whose concurrent render has not committed.
    // A request-id check alone cannot invalidate React's eagerly evaluated state update.
    setExpression(expression);
    setPendingExpression(null);
    setFailedExpression(null);
  }

  function selectExpression(id: string) {
    const target = media.find((item) => item.id === id);
    // Do not let an unknown interpretation interrupt a valid pending selection.
    if (!target) return;
    cancelPending();
    if (target.id === expression) return;
    if (!target.still) {
      setFailedExpression(target.id);
      return;
    }

    const identity = request.current;
    const image = new window.Image();
    let settled = false;
    const release = () => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      // Removing the source also abandons unnecessary bytes on cancellation.
      image.removeAttribute('src');
    };
    preparation.current = () => {
      settled = true;
      release();
    };
    const finish = (ready: boolean) => {
      if (settled || identity !== request.current) return;
      settled = true;
      release();
      preparation.current = null;
      setPendingExpression(null);
      if (!ready) {
        setFailedExpression(target.id);
        return;
      }
      const commit = () => {
        // A newer click can supersede a transition before React commits it.
        setExpression((current) => (identity === request.current ? target.id : current));
      };
      if (!motion.current.paused && !motion.current.reducedMotion) {
        startTransition(() => {
          addTransitionType(
            target.id === 'ink'
              ? transitionTypes.ink
              : target.id === 'light'
                ? transitionTypes.light
                : transitionTypes.default,
          );
          commit();
        });
      } else commit();
    };

    setPendingExpression(target.id);
    const timer = setTimeout(() => finish(false), preparationDeadline);
    image.decoding = 'async';
    image.onload = () => {
      // Older browsers do not expose decode(); load still establishes readiness.
      if (typeof image.decode !== 'function') finish(true);
    };
    image.onerror = () => finish(false);
    image.src = target.still;
    if (typeof image.decode === 'function') {
      void image.decode().then(
        () => finish(true),
        () => finish(false),
      );
    }
  }

  return { expression, pendingExpression, failedExpression, selectExpression, cancelPending };
}

/**
 * Native snapshots preserve the outgoing film's actual frame without keeping a second
 * live player mounted. Unsupported browsers perform the same ready-image swap directly.
 */
export function ArtworkStage({
  artworkId,
  expression,
  scope = 'page',
  disabled = false,
  children,
}: {
  artworkId: number;
  expression: string;
  scope?: 'page' | 'room';
  disabled?: boolean;
  children: ReactNode;
}) {
  const { paused, reducedMotion } = useMotion();
  const enabled = !disabled && !paused && !reducedMotion;
  return (
    <ViewTransition
      name={`cs-expression-${artworkId}-${scope}`}
      default="none"
      update={
        enabled
          ? {
              [transitionTypes.ink]: transitionTypes.ink,
              [transitionTypes.light]: transitionTypes.light,
              [transitionTypes.default]: transitionTypes.default,
              default: 'none',
            }
          : 'none'
      }
    >
      <div className={styles.stage} data-artwork-stage={scope} data-expression={expression}>
        {children}
      </div>
    </ViewTransition>
  );
}
