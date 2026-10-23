import type { Messages } from '@/lib/i18n/en';
import styles from './auction-rules.module.css';
export function AuctionRules({ t }: { t: Messages }) {
  return (
    <div className={`auction-rules ${styles.rules}`}>
      {[
        [t.rulePreview, t.rulePreviewCopy],
        [t.ruleFirst, t.ruleFirstCopy],
        [t.ruleRaise, t.ruleRaiseCopy],
        [t.ruleTime, t.ruleTimeCopy],
        [t.ruleFunds, t.ruleFundsCopy],
        [t.ruleTrust, t.ruleTrustCopy],
      ].map(([title, body], i) => (
        <article key={title}>
          <span className="eyebrow">0{i + 1}</span>
          <h3>{title}</h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}
