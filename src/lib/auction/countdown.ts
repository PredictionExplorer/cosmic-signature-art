/**
 * The contract's clock is the only hh:mm:ss on the site. It is rendered by
 * src/components/live-auction.tsx alone (an ESLint rule keeps it there); every other
 * time the venue shows is a calendar date and time, never a ticking clock.
 *
 * Days fold into hours (a seven-day preview reads "168:00:00") so the figure
 * matches the contract's seconds without a second unit to misread.
 */
export function formatCountdown(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00:00';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    rest,
  ).padStart(2, '0')}`;
}
