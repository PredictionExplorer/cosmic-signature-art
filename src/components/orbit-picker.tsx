'use client';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { workNumber } from '@/lib/art/number';
import styles from './orbit-picker.module.css';

/** The field's name, and the query a form sent before the page could answer it: `?work=31`. */
export const WORK_PARAM = 'work';
/** A work's number as typed or pasted: "031", "№ 031" and "#31" are all thirty-one. */
export const typedDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/**
 * The door to Verify an orbit: a work's number, and on to that work's page, where the derivation
 * runs. A number without a record says so in place. Without JavaScript the form sends the number
 * to this page, which goes on to the work as soon as it can.
 */
export function OrbitPicker({
  ids,
  locale,
  t,
}: {
  /** Every work with a record, by number. */
  ids: readonly number[];
  locale: Locale;
  t: Messages;
}) {
  const router = useRouter();
  const field = useId();
  const message = `${field}-message`;
  const [value, setValue] = useState('');
  const [unknown, setUnknown] = useState<number | null>(null);
  const page = (id: number) => localizedPath(locale, `/verify/orbit/${id}`);

  // A number the form sent before this page could answer it goes on to its work as it arrives.
  useEffect(() => {
    const sent = typedDigits(new URLSearchParams(window.location.search).get(WORK_PARAM) ?? '');
    if (sent && ids.includes(Number(sent)))
      router.replace(localizedPath(locale, `/verify/orbit/${Number(sent)}`));
  }, [ids, locale, router]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = typedDigits(value);
    if (!digits) return;
    const id = Number(digits);
    if (!ids.includes(id)) {
      setUnknown(id);
      return;
    }
    setUnknown(null);
    router.push(page(id));
  };

  return (
    <form
      className={styles.picker}
      action={localizedPath(locale, '/verify/orbit')}
      method="get"
      onSubmit={submit}
      noValidate
    >
      <label className={styles.label} htmlFor={field}>
        {t.verifyOrbitNumber}
      </label>
      <div className={styles.row}>
        <input
          id={field}
          className={styles.input}
          name={WORK_PARAM}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={8}
          value={value}
          onChange={(event) => {
            setValue(typedDigits(event.target.value));
            setUnknown(null);
          }}
          aria-invalid={unknown !== null ? true : undefined}
          aria-describedby={message}
        />
        <button type="submit" className={`outline-button ${styles.go}`}>
          {t.verifyOrbitGo}
        </button>
      </div>
      <p id={message} className={styles.message} aria-live="polite">
        {unknown !== null ? fill(t.verifyOrbitUnknown, { work: workNumber(unknown) }) : null}
      </p>
    </form>
  );
}
