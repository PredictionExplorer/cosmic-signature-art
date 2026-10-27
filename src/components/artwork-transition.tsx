'use client';

import { ViewTransition, type ReactNode } from 'react';
import { useMotion } from './motion-provider';
import styles from './artwork-transition.module.css';

/** Encode the expression without collapsing distinct names into the same CSS identity. */
function artworkIdentity(artworkId: number, interpretationId: string) {
  const expression = Array.from(interpretationId, (letter) => letter.codePointAt(0)!.toString(36));
  return `cs-art-${artworkId}-${expression.join('-')}`;
}

/**
 * React owns the native transition lifecycle, including canceled navigation and Suspense.
 * Links never wait for animation. Only the same token and expression can share a surface;
 * an uncached destination gets its arrival when the actual artwork mounts instead.
 */
export function ArtworkTransition({
  artworkId,
  interpretationId,
  role,
  disabled = false,
  className = '',
  children,
}: {
  artworkId: number;
  interpretationId: string;
  role: 'preview' | 'detail';
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { paused, reducedMotion, theatre } = useMotion();
  // A hushed theatre (bid review) walks between card and plate without the morph.
  const enabled = !disabled && !paused && !reducedMotion && theatre !== 'hushed';

  return (
    <ViewTransition
      name={artworkIdentity(artworkId, interpretationId)}
      default="none"
      share={enabled ? 'cosmic-art-shared' : 'none'}
      enter={enabled && role === 'detail' ? 'cosmic-art-arrival' : 'none'}
    >
      <div className={`${styles.surface} ${className}`.trim()}>{children}</div>
    </ViewTransition>
  );
}
