'use client';
import { useState, type ChangeEvent } from 'react';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import { CopyButton } from './copy-button';
import styles from './verify-download.module.css';

/** One published file the venue holds a hash for. */
export interface VerifiableFile {
  /** "Ink · Film" */
  label: string;
  /** The manifest path: "videos/web/ember.mp4" */
  path: string;
  sha256: string;
}
/** A whole-file digest wants the file in memory; past this the shell does it better. */
export const BROWSER_LIMIT_BYTES = 256 * 1024 * 1024;

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Status =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string }
  | { kind: 'done'; name: string; sha256: string; match?: VerifiableFile }
  | { kind: 'large'; name: string }
  | { kind: 'failed'; name: string };

/**
 * Verify a download: the visitor chooses a file they downloaded, its SHA-256 is computed in
 * the browser and compared with every published hash of this work, and the answer is one
 * plain sentence. Nothing is uploaded. Without JavaScript the disclosure still prints the
 * hashes, which is the verification by hand.
 */
export function VerifyDownload({ files, t }: { files: VerifiableFile[]; t: Messages }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  async function chosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > BROWSER_LIMIT_BYTES) {
      setStatus({ kind: 'large', name: file.name });
      return;
    }
    setStatus({ kind: 'reading', name: file.name });
    try {
      const sha256 = await sha256Hex(await file.arrayBuffer());
      setStatus({
        kind: 'done',
        name: file.name,
        sha256,
        match: files.find((candidate) => candidate.sha256 === sha256),
      });
    } catch {
      setStatus({ kind: 'failed', name: file.name });
    }
  }
  const message =
    status.kind === 'reading'
      ? fill(t.verifyReading, { name: status.name })
      : status.kind === 'done'
        ? status.match
          ? fill(t.verifyMatches, { file: `${status.match.label} · ${status.match.path}` })
          : t.verifyNoMatch
        : status.kind === 'large'
          ? t.verifyTooLarge
          : status.kind === 'failed'
            ? t.verifyFailed
            : undefined;
  return (
    <details className={styles.verify}>
      <summary className={styles.summary}>{t.verifyDownload}</summary>
      <p className={styles.note}>{t.verifyIntro}</p>
      <label className={styles.picker}>
        <span>{t.verifyChoose}</span>
        <input type="file" onChange={(event) => void chosen(event)} />
      </label>
      {message ? (
        <p className={styles.status} role="status" data-state={status.kind}>
          {message}
          {status.kind === 'done' ? (
            <code className={styles.digest}>sha256 {status.sha256}</code>
          ) : null}
        </p>
      ) : null}
      {status.kind === 'large' ? (
        <pre className={styles.command}>shasum -a 256 &quot;{status.name}&quot;</pre>
      ) : null}
      <h4 className={`eyebrow ${styles.hashesTitle}`}>{t.publishedHashes}</h4>
      <ul className={styles.hashes}>
        {files.map((file) => (
          <li key={`${file.path}:${file.sha256}`}>
            <span className={styles.file}>
              {file.label} · {file.path}
            </span>
            <code>{file.sha256}</code>
            <CopyButton
              className={styles.copy}
              value={file.sha256}
              label={t.copyAddress}
              copied={t.copied}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
