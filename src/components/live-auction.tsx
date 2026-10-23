'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatEther,
  isAddress,
  isAddressEqual,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import {
  readAuction,
  submitAction,
  switchChain,
  AuctionConfigurationError,
  zeroAddress,
  type Snapshot,
  type AuctionAction,
} from '@/lib/auction/client';
import { auctionAddress, chainId } from '@/lib/auction/config';
import { auctionPhase, bidFunding, parseEthInput } from '@/lib/auction/rules';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import styles from './live-auction.module.css';

type ProviderDetail = { info: { uuid: string; name: string }; provider: EIP1193Provider };
type EventProvider = EIP1193Provider;
function isUnknownAuction(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UnknownAuction');
}
function deadlineDate(timestamp: bigint): Date | null {
  const milliseconds = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 8.64e15)
    return null;
  return new Date(milliseconds);
}
type LiveAuctionProps = { tokenId: number; t: Messages; locale: Locale };

export function LiveAuction(props: LiveAuctionProps) {
  // A reviewed payment and all asynchronous wallet work belong to exactly one lot.
  return <AuctionSession key={props.tokenId} {...props} />;
}

function AuctionSession({ tokenId, t, locale }: LiveAuctionProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderDetail[]>([]);
  const [provider, setProvider] = useState<EventProvider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [walletChain, setWalletChain] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [review, setReview] = useState<{ total: bigint; funding: bigint } | null>(null);
  const [pending, setPending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [hash, setHash] = useState<Hex | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [now, setNow] = useState(0);
  const active = useRef(true);
  const submission = useRef(false);
  const connection = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const cancelReview = useRef<HTMLButtonElement>(null);
  const reviewOpen = review !== null;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
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
    const legacy = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    const fallbackTimer = setTimeout(() => {
      if (legacy)
        setProviders((previous) =>
          previous.length
            ? previous
            : [{ info: { uuid: 'legacy', name: t.connect }, provider: legacy }],
        );
    }, 0);
    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('eip6963:announceProvider', announced);
    };
  }, [t.connect]);
  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (value: unknown) => {
      const next =
        Array.isArray(value) && typeof value[0] === 'string' && isAddress(value[0])
          ? (value[0] as Address)
          : null;
      setAccount(next);
      setRecipient(next ?? '');
      setReview(null);
      setSnapshot(null);
    };
    const chainChanged = (value: unknown) => {
      setWalletChain(typeof value === 'string' ? Number.parseInt(value, 16) : null);
      setReview(null);
      setSnapshot(null);
      setRefreshCounter((value) => value + 1);
    };
    const disconnected = () => {
      setAccount(null);
      setProvider(null);
      setWalletChain(null);
      setRecipient('');
      setReview(null);
      setSnapshot(null);
    };
    provider.on?.('disconnect', disconnected);
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', chainChanged);
    return () => {
      provider.removeListener?.('disconnect', disconnected);
      provider.removeListener?.('accountsChanged', accountsChanged);
      provider.removeListener?.('chainChanged', chainChanged);
    };
  }, [provider]);
  useEffect(() => {
    let live = true;
    let reading = false;
    async function refresh() {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const value = await readAuction(tokenId, account ?? undefined);
        if (live) {
          setSnapshot(value);
          setProblem(null);
        }
      } catch (error) {
        if (live) {
          setSnapshot(null);
          setProblem(
            error instanceof AuctionConfigurationError
              ? t.configMismatch
              : isUnknownAuction(error)
                ? t.unregistered
                : t.liveUnavailable,
          );
        }
      } finally {
        reading = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 12000);
    const visible = () => void refresh();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [tokenId, account, refreshCounter, t]);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !reviewOpen) return;
    // Safari does not focus pointer-activated buttons, so remember the actual opener.
    const opener = reviewTrigger.current;
    const overflowProperties = ['overflow', 'overflow-x', 'overflow-y'];
    const locked = [document.documentElement, document.body].map((target) => ({
      target,
      declarations: Array.from(target.style)
        .filter((property) => overflowProperties.includes(property))
        .map((property) => ({
          property,
          value: target.style.getPropertyValue(property),
          priority: target.style.getPropertyPriority(property),
        })),
    }));
    for (const { target } of locked) target.style.setProperty('overflow', 'hidden');
    element.showModal();
    cancelReview.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      for (const { target, declarations } of locked) {
        for (const property of overflowProperties) target.style.removeProperty(property);
        for (const { property, value, priority } of declarations)
          target.style.setProperty(property, value, priority);
      }
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [reviewOpen]);
  const refresh = useCallback(() => setRefreshCounter((value) => value + 1), []);
  async function connect(detail: ProviderDetail) {
    if (connection.current || submission.current) return;
    connection.current = true;
    setConnecting(true);
    setMessage(null);
    try {
      const addresses = await detail.provider.request({ method: 'eth_requestAccounts' });
      const network = await detail.provider.request({ method: 'eth_chainId' });
      if (active.current && addresses[0]) {
        setSnapshot(null);
        setReview(null);
        setProvider(detail.provider);
        setAccount(addresses[0]);
        setWalletChain(Number.parseInt(network, 16));
        setRecipient(addresses[0]);
      }
    } catch {
      if (active.current) setMessage(t.transactionFailed);
    } finally {
      connection.current = false;
      if (active.current) setConnecting(false);
    }
  }
  async function execute(action: AuctionAction) {
    if (!provider || !account || submission.current) return;
    // Lock synchronously: two activations can occur before React commits disabled=true.
    submission.current = true;
    setPending(true);
    setReview(null);
    setMessage(t.walletPending);
    setHash(null);
    try {
      await submitAction(provider, account, tokenId, action, (nextHash) => {
        if (active.current) {
          setHash(nextHash);
          setMessage(t.transactionPending);
        }
      });
      if (active.current) {
        setMessage(t.transactionConfirmed);
        setAmount('');
        refresh();
      }
    } catch {
      if (active.current) {
        setMessage(t.transactionFailed);
        refresh();
      }
    } finally {
      submission.current = false;
      if (active.current) setPending(false);
    }
  }
  const deadline = snapshot ? deadlineDate(snapshot.lot.endAt || snapshot.lot.eligibleAt) : null;
  const stale = !snapshot || deadline === null || (now > 0 && now - snapshot.fetchedAt > 25000);
  const phase = snapshot ? auctionPhase(snapshot.lot, snapshot.blockTime) : null;
  const leader = !!account && !!snapshot && isAddressEqual(account, snapshot.lot.highestBidder);
  const target = recipient;
  const recipientValid =
    isAddress(target) &&
    !isAddressEqual(target, zeroAddress) &&
    (!auctionAddress || !isAddressEqual(target, auctionAddress));
  const ready = !!account && walletChain === chainId && !pending && !stale;
  const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    [locale],
  );
  function prepareBid(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || !snapshot || (phase !== 'waiting' && phase !== 'active')) return;
    const total = parseEthInput(amount);
    if (total === null) {
      setMessage(t.invalidAmount);
      return;
    }
    if (total < snapshot.minimum) {
      setMessage(t.bidTooLow);
      return;
    }
    setMessage(null);
    setReview({ total, funding: bidFunding(total, snapshot.lot.highestBid, leader) });
  }
  let funding: bigint | null = null;
  try {
    if (review !== null && snapshot)
      funding = bidFunding(review.total, snapshot.lot.highestBid, leader);
  } catch {
    /* A competing bid invalidates the review without changing the user's amount. */
  }
  const reviewValid =
    review !== null &&
    funding !== null &&
    funding === review.funding &&
    snapshot !== null &&
    review.total >= snapshot.minimum &&
    (phase === 'waiting' || phase === 'active');
  const remaining =
    snapshot && !stale
      ? Math.max(
          0,
          Number((snapshot.lot.endAt || snapshot.lot.eligibleAt) - snapshot.blockTime) -
            Math.max(0, Math.floor((now - snapshot.fetchedAt) / 1000)),
        )
      : 0;
  const countdown = `${Math.floor(remaining / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((remaining % 3600) / 60)
    .toString()
    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  return (
    <section className={`${styles.panel} live-auction`} aria-label={t.auctions}>
      <div className={`${styles.heading} auction-panel-heading`}>
        <div>
          <p className="eyebrow">{t.auctionKicker}</p>
          <h2>{phase && !stale ? t[phase] : t.status}</h2>
        </div>
      </div>
      {problem ? (
        <p className="notice" role="status">
          {problem}
        </p>
      ) : !snapshot ? (
        <p className="notice" aria-busy="true">
          {t.refresh}…
        </p>
      ) : stale || deadline === null ? (
        <p className="notice" role="status">
          {t.liveUnavailable}
        </p>
      ) : (
        <>
          <dl className={`${styles.facts} lot-facts`}>
            <div className={styles.primaryPrice}>
              <dt>{snapshot.lot.highestBid === 0n ? t.openingBid : t.highest}</dt>
              <dd>
                {formatEther(snapshot.lot.highestBid || snapshot.minimum)} <small>ETH</small>
              </dd>
            </div>
            {snapshot.lot.highestBid > 0n && phase === 'active' ? (
              <div className={styles.nextPrice}>
                <dt>{t.minimum}</dt>
                <dd>
                  {formatEther(snapshot.minimum)} <small>ETH</small>
                </dd>
              </div>
            ) : null}
            <div className={styles.deadline}>
              <dt>{snapshot.lot.endAt === 0n ? t.eligible : t.ends}</dt>
              <dd>
                <time dateTime={deadline.toISOString()}>{dateFormatter.format(deadline)} UTC</time>
              </dd>
            </div>
          </dl>
          {phase === 'active' || phase === 'preview' ? (
            <div className={styles.clock} aria-live="off">
              <p>{phase === 'active' ? t.bidCountdown : t.previewCountdown}</p>
              <p className={`${styles.countdown} auction-countdown`}>{countdown}</p>
            </div>
          ) : null}
          <p className={`${styles.chainClock} chain-clock`}>{t.chainClock}</p>
          {snapshot.lot.highestBidder !== zeroAddress ? (
            <p className={`${styles.leader} leading-wallet`}>
              {t.leadingWallet}:{' '}
              <a
                href={`https://arbiscan.io/address/${snapshot.lot.highestBidder}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(snapshot.lot.highestBidder)} ↗
              </a>
            </p>
          ) : null}
        </>
      )}
      <div className={`${styles.wallet} wallet-bar`}>
        {account ? (
          <>
            <span className={styles.account} title={account}>
              {short(account)}
            </span>
            <button
              onClick={() => {
                setAccount(null);
                setProvider(null);
                setWalletChain(null);
                setRecipient('');
                setSnapshot(null);
                setReview(null);
              }}
              disabled={pending}
            >
              {t.disconnect}
            </button>
            {walletChain !== chainId ? (
              <button
                className="primary-button"
                onClick={() => {
                  if (provider)
                    void switchChain(provider)
                      .then(() => {
                        setWalletChain(chainId);
                        refresh();
                      })
                      .catch(() => setMessage(t.transactionFailed));
                }}
                disabled={pending}
              >
                {t.wrongNetwork}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <span className={styles.walletLabel}>{t.chooseWallet}</span>
            {providers.length ? (
              providers.map((detail) => (
                <button
                  key={detail.info.uuid}
                  className="outline-button"
                  onClick={() => void connect(detail)}
                  disabled={connecting}
                >
                  {connecting ? t.walletPending : detail.info.name.slice(0, 80)}
                </button>
              ))
            ) : (
              <p>{t.walletMissing}</p>
            )}
          </>
        )}
      </div>
      {snapshot && (phase === 'waiting' || phase === 'active') ? (
        <form className={`${styles.bidForm} bid-form`} onSubmit={prepareBid}>
          <label>
            {t.bidTotal}
            <input
              name="bid"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={!stale ? formatEther(snapshot.minimum) : undefined}
              disabled={pending}
            />
          </label>
          <button className="primary-button" disabled={!ready} type="submit" ref={reviewTrigger}>
            {t.bidReviewAction} <span aria-hidden="true">↗</span>
          </button>
          {leader ? <p>{t.yourBid}</p> : null}
        </form>
      ) : null}
      {snapshot && phase === 'ended' ? (
        <button
          className="primary-button"
          disabled={!ready}
          onClick={() => void execute({ kind: 'settle' })}
        >
          {t.settle}
        </button>
      ) : null}
      {snapshot?.lot.settled ? (
        <div className={`${styles.actions} settlement-actions`}>
          <p>
            {t.winner}: <code>{short(snapshot.lot.highestBidder)}</code>
          </p>
          {snapshot.lot.delivered ? (
            <p>{t.delivered}</p>
          ) : leader ? (
            <>
              <label>
                {t.recipient}
                <input
                  value={target}
                  onChange={(event) => setRecipient(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                />
              </label>
              <button
                className="primary-button"
                disabled={!ready || !recipientValid}
                onClick={() => void execute({ kind: 'claimNft', recipient: target as Address })}
              >
                {t.claim}
              </button>
            </>
          ) : null}
          {snapshot.lot.proceedsForwarded ? (
            <p>{t.proceedsSent}</p>
          ) : (
            <button
              className="outline-button"
              disabled={!ready}
              onClick={() => void execute({ kind: 'forwardProceeds' })}
            >
              {t.forward}
            </button>
          )}
        </div>
      ) : null}
      {snapshot && snapshot.refund > 0n && account ? (
        <div className={`${styles.actions} refund-panel`}>
          <p>
            {t.refund}: <strong>{formatEther(snapshot.refund)} ETH</strong>
          </p>
          <label>
            {t.recipient}
            <input
              value={target}
              onChange={(event) => setRecipient(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
          </label>
          <button
            className="outline-button"
            disabled={!ready || !recipientValid}
            onClick={() => void execute({ kind: 'withdrawRefund', recipient: target as Address })}
          >
            {t.withdraw}
          </button>
          {!recipientValid ? <p>{t.invalidAddress}</p> : null}
        </div>
      ) : null}
      <div
        className={`${styles.transactionStatus} transaction-status`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
        <span>
          {hash ? (
            <a href={`https://arbiscan.io/tx/${hash}`} target="_blank" rel="noreferrer">
              {t.viewChain} ↗
            </a>
          ) : null}
        </span>
      </div>
      <div className={styles.footer}>
        <button className="text-link" onClick={refresh} disabled={pending}>
          {t.refresh} <span aria-hidden="true">↻</span>
        </button>
        <a
          className="text-link"
          href={`https://arbiscan.io/address/${auctionAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          {t.contract} <span aria-hidden="true">↗</span>
        </a>
      </div>
      <dialog
        className={`${styles.dialog} bid-dialog`}
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          setReview(null);
        }}
        aria-labelledby={`bid-review-title-${tokenId}`}
        aria-describedby={`bid-review-description-${tokenId}`}
      >
        <p className={`${styles.reviewIdentity} eyebrow`}>
          {t.signature} {String(tokenId).padStart(3, '0')} · ETH
        </p>
        <h3 id={`bid-review-title-${tokenId}`}>{t.bidReview}</h3>
        <p id={`bid-review-description-${tokenId}`}>{t.bidWarning}</p>
        <dl className={styles.reviewAmounts}>
          <div>
            <dt>{t.bidTotal}</dt>
            <dd>{review !== null ? formatEther(review.total) : ''} ETH</dd>
          </div>
          <div>
            <dt>{t.funding}</dt>
            <dd>{review !== null ? formatEther(review.funding) : '—'} ETH</dd>
          </div>
        </dl>
        {!reviewValid ? <p className="notice">{t.reviewChanged}</p> : null}
        <div className={`${styles.dialogActions} dialog-actions`}>
          <button className="outline-button" ref={cancelReview} onClick={() => setReview(null)}>
            {t.cancel}
          </button>
          <button
            className="primary-button"
            disabled={!ready || !reviewValid}
            onClick={() => {
              if (review !== null && reviewValid)
                void execute({ kind: 'bid', total: review.total, expectedFunding: review.funding });
            }}
          >
            {t.confirmBid}
          </button>
        </div>
      </dialog>
    </section>
  );
}
