import type { Messages } from '@/lib/i18n/en';
import styles from './auction-rules.module.css';

/** The conditions of sale as numbered paragraphs at reading size; the content is unchanged. */
export function AuctionRules({ t }: { t: Messages }) {
  return (
    <ol className={`auction-rules ${styles.rules}`} role="list">
      {[
        [t.rulePreview, t.rulePreviewCopy],
        [t.ruleFirst, t.ruleFirstCopy],
        [t.ruleRaise, t.ruleRaiseCopy],
        [t.ruleTime, t.ruleTimeCopy],
        [t.ruleFunds, t.ruleFundsCopy],
        [t.ruleTrust, t.ruleTrustCopy],
      ].map(([title, body], i) => (
        <li key={title} className={styles.rule}>
          <span className={styles.sign}>§ {String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
