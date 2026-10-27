import { fireEvent, render, screen } from '@testing-library/react';
import { createHash, webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { BROWSER_LIMIT_BYTES, VerifyDownload, sha256Hex } from './verify-download';

const bytes = new TextEncoder().encode('one recorded orbit');
const digest = createHash('sha256').update(bytes).digest('hex');
const files = [
  { label: 'Ink · Film', path: 'videos/web/ember.mp4', sha256: digest },
  { label: 'Ink · Still', path: 'images/web/ember_full.webp', sha256: 'a'.repeat(64) },
];

beforeAll(() => {
  // jsdom has no SubtleCrypto; the component uses the platform's, which Node provides.
  if (!globalThis.crypto?.subtle)
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  // jsdom's Blob reads through FileReader; the browser's arrayBuffer() is the same bytes.
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
});

function choose(file: File) {
  const input = screen.getByLabelText(en.verifyChoose) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('verify a download', () => {
  it('prints every published hash with one word to copy it, before any file is chosen', () => {
    render(<VerifyDownload files={files} t={en} />);
    expect(screen.getByText(en.verifyDownload)).toBeInTheDocument();
    expect(screen.getByText(digest, { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText('Ink · Film · videos/web/ember.mp4')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: new RegExp(`^${en.copyAddress} `) })).toHaveLength(
      2,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hashes the chosen file in the browser and names the published file it matches', async () => {
    render(<VerifyDownload files={files} t={en} />);
    choose(new File([bytes], 'ember.mp4'));
    const status = await screen.findByRole('status');
    await screen.findByText(/Matches Ink · Film · videos\/web\/ember\.mp4/);
    expect(status).toHaveTextContent(`sha256 ${digest}`);
    expect(await sha256Hex(bytes.buffer as ArrayBuffer)).toBe(digest);
  });

  it('says plainly when a file matches nothing published for this work', async () => {
    render(<VerifyDownload files={files} t={en} />);
    choose(new File([new TextEncoder().encode('another file')], 'other.mp4'));
    expect(await screen.findByText(en.verifyNoMatch)).toBeInTheDocument();
  });

  it('hands a very large file to the shell with the command spelled out', () => {
    render(<VerifyDownload files={files} t={en} />);
    const large = new File([], 'ember_slow.mp4');
    Object.defineProperty(large, 'size', { value: BROWSER_LIMIT_BYTES + 1 });
    choose(large);
    expect(screen.getByRole('status')).toHaveTextContent(en.verifyTooLarge);
    expect(screen.getByText('shasum -a 256 "ember_slow.mp4"')).toBeInTheDocument();
  });
});
