'use client';
import { createContext, use, type ReactNode } from 'react';
import type { ErrorPageWords } from './error.words';

const Context = createContext<ErrorPageWords | null>(null);

/**
 * The error page's words, put within its reach. Next renders an error file itself and gives it
 * the error and nothing else, so no parent can hand it props; to speak the visitor's language
 * it once imported all eight catalogs and chose one in the browser. The document, which knows
 * the language, provides the page's two strings around every route instead
 * (src/app/venue-document.tsx).
 *
 * The value is the object the server sent and never changes, so no streamed boundary beneath
 * it is rendered again for it (see useMotion, src/components/motion-provider.tsx, for a value
 * that would). Next's catchError makes a boundary that takes props, which would need no
 * context; importing it brings the Pages Router's own error page into every route's script.
 */
export function ErrorWords({ t, children }: { t: ErrorPageWords; children: ReactNode }) {
  return <Context value={t}>{children}</Context>;
}

/** The two strings the error page says. */
export function useErrorWords(): ErrorPageWords {
  const t = use(Context);
  if (!t) throw new Error('The error page stands outside the venue document, which has its words.');
  return t;
}
