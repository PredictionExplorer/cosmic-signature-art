import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** The sale can be reviewed by direct URL, but is not part of public discovery yet. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuctionLayout({ children }: { children: ReactNode }) {
  return children;
}
