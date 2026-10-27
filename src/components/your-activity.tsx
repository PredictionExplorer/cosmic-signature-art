'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { isAddress, type Address, type EIP1193Provider } from 'viem';
import { readActivity, type Activity } from '@/lib/auction/activity';
import { compactAddress, formatEth } from '@/lib/auction/catalogue';
import { workNumber } from '@/lib/art/number';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { AuctionSheet } from './auction-sheet';
import styles from './auction-sheets.module.css';

type ProviderDetail = { info: { uuid: string; name: string }; provider: EIP1193Provider };

/**
 * "Your activity": a collector's own view of the sale, read from the chain for any wallet
 * address, theirs or one they type. Leading bids and the ETH they commit, the credit they may
 * retrieve, the works won and awaiting delivery, the works of this sale their wallet holds.
 * It never initiates a transaction; the panel's own refund and withdraw remain the actions.
 */
export function YourActivity({
  open,
  onClose,
  returnFocusRef,
  t,
  locale,
  page = 0,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  t: Messages;
  locale: Locale;
  /** The batch the sale currently shows; activity is read against the same lots. */
  page?: number;
}) {
  const [address, setAddress] = useState('');
  const [providers, setProviders] = useState<ProviderDetail[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'ready' | 'failed' | 'invalid'>('idle');
  const reading = useRef(false);
  useEffect(() => {
    if (!open) return;
    const announced = (event: Event) => {
      const detail = (event as CustomEvent<ProviderDetail>).detail;
      if (
        !detail?.provider?.request ||
        typeof detail.info?.uuid !== 'string' ||
        typeof detail.info?.name !== 'string'
      )
        return;
      setProviders((previous) =>
        previous.some((item) => item.info.uuid === detail.info.uuid)
          ? previous
          : [...previous, detail],
      );
    };
    window.addEventListener('eip6963:announceProvider', announced);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', announced);
  }, [open]);

  async function read(account: Address) {
    if (reading.current) return;
    reading.current = true;
    setStatus('reading');
    try {
      const value = await readActivity(account, page);
      setActivity(value);
      setStatus('ready');
    } catch {
      setStatus('failed');
    } finally {
      reading.current = false;
    }
  }
  function lookUp(event: FormEvent) {
    event.preventDefault();
    const candidate = address.trim();
    if (!isAddress(candidate)) {
      setStatus('invalid');
      return;
    }
    void read(candidate);
  }
  async function connectWallet(detail: ProviderDetail) {
    try {
      const accounts = (await detail.provider.request({
        method: 'eth_requestAccounts',
      })) as unknown;
      const account = Array.isArray(accounts) ? accounts[0] : null;
      if (typeof account === 'string' && isAddress(account)) {
        setAddress(account);
        void read(account);
      } else setStatus('failed');
    } catch {
      setStatus('failed');
    }
  }
  const eth = (value: bigint) => formatEth(value);
  const lot = (tokenId: number) => (
    <Link href={localizedPath(locale, `/auctions/${tokenId}`)}>{workNumber(tokenId)}</Link>
  );
  return (
    <AuctionSheet
      open={open}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      label={t.yourActivity}
      closeLabel={t.close}
      handleLabel={t.sheetHandle}
    >
      <p className={styles.intro}>{t.activityIntro}</p>
      <form className={styles.lookup} onSubmit={lookUp}>
        <label>
          {t.activityAddress}
          <input
            name="activity-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
          />
        </label>
        <div className={styles.lookupActions}>
          <button type="submit" className="outline-button" disabled={status === 'reading'}>
            {t.activityLookUp}
          </button>
          {providers.map((detail) => (
            <button
              key={detail.info.uuid}
              type="button"
              className="outline-button"
              disabled={status === 'reading'}
              onClick={() => void connectWallet(detail)}
            >
              {t.activityUseWallet} · {detail.info.name.slice(0, 40)}
            </button>
          ))}
        </div>
        {status === 'invalid' ? (
          <p className="notice" role="status">
            {t.invalidAddress}
          </p>
        ) : status === 'failed' ? (
          <p className="notice" role="status">
            {t.activityUnavailable}
          </p>
        ) : null}
      </form>
      {activity ? (
        <section
          className={styles.activity}
          aria-label={fill(t.activityFor, { address: compactAddress(activity.account) })}
        >
          <p className={styles.activityFor}>
            {fill(t.activityFor, { address: compactAddress(activity.account) })}
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>{t.activityLeading}</dt>
              <dd>
                {activity.leading.length ? (
                  <ul>
                    {activity.leading.map((entry) => (
                      <li key={entry.tokenId}>
                        {lot(entry.tokenId)} · {eth(entry.amount)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  t.activityNone
                )}
              </dd>
            </div>
            <div>
              <dt>{t.activityCommitted}</dt>
              <dd>{eth(activity.committed)}</dd>
            </div>
            <div>
              <dt>{t.activityRefundable}</dt>
              <dd>{eth(activity.refundable)}</dd>
            </div>
            <div>
              <dt>{t.activityWon}</dt>
              <dd>
                {activity.won.filter((entry) => !entry.delivered).length ? (
                  <ul>
                    {activity.won
                      .filter((entry) => !entry.delivered)
                      .map((entry) => (
                        <li key={entry.tokenId}>
                          {lot(entry.tokenId)} · {eth(entry.amount)}
                        </li>
                      ))}
                  </ul>
                ) : (
                  t.activityNone
                )}
              </dd>
            </div>
            <div>
              <dt>{t.activityHeld}</dt>
              <dd>
                {activity.held.length ? (
                  <ul>
                    {activity.held.map((tokenId) => (
                      <li key={tokenId}>{lot(tokenId)}</li>
                    ))}
                  </ul>
                ) : (
                  t.activityNone
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : status === 'reading' ? (
        <p className={styles.quiet} aria-busy="true">
          {t.refresh}…
        </p>
      ) : null}
    </AuctionSheet>
  );
}
