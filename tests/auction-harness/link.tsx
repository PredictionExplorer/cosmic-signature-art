import type { ComponentProps } from 'react';
// Browser harness tests hrefs, not Next's router. Production still uses next/link.
export default function Link(props: ComponentProps<'a'> & { prefetch?: boolean }) {
  const anchor = { ...props };
  delete anchor.prefetch;
  return <a {...anchor} />;
}
