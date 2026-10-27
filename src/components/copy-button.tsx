'use client';
import { useEffect, useRef, useState } from 'react';

/** The copied state rests for --t-hold before the word returns. */
const COPIED_MS = 1200;

/** One word that copies a value; it announces success quietly and never fails loudly. */
export function CopyButton({
  value,
  label,
  copied,
  className,
}: {
  value: string;
  label: string;
  copied: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), COPIED_MS);
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => void copy()}
      title={value}
      aria-live="polite"
    >
      {done ? copied : label} <span className="sr-only">{value}</span>
    </button>
  );
}
