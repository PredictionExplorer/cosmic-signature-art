import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { orbitIds } from '@/lib/art/orbit-records';
import { readAddress } from '@/lib/addresses';
import VerifyOrbitIndex, { generateMetadata as indexMetadata } from './page';
import VerifyOrbitPage, { generateMetadata as workMetadata } from './[id]/page';

const connection = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('next/server', () => ({ connection }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const params = <T extends Record<string, string>>(values: T) => ({
  params: Promise.resolve(values),
});

afterEach(() => vi.unstubAllGlobals());

describe('Verify an orbit, the door', () => {
  it('offers the number field and every number with a record, each a link to its page', async () => {
    render(await VerifyOrbitIndex(params({ locale: 'en' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.verifyOrbit);
    expect(screen.getByLabelText(en.verifyOrbitNumber)).toBeInTheDocument();
    const list = screen.getByRole('region', { name: en.verifyOrbitWorks });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(orbitIds().length);
    expect(links).toHaveLength(72);
    const thirtyOne = within(list).getByRole('link', { name: '№\u00a0031' });
    expect(thirtyOne).toHaveTextContent(/^031$/);
    expect(thirtyOne).toHaveAttribute('href', '/verify/orbit/31');
  });

  it('is described in the reader’s language, and is nothing in an unknown one', async () => {
    const metadata = await indexMetadata(params({ locale: 'vi' }));
    expect(metadata.alternates?.canonical).toBe('https://cosmic.art/vi/verify/orbit');
    expect(metadata.title).toBe('Xác minh một quỹ đạo');
    expect(await indexMetadata(params({ locale: 'xx' }))).toEqual({});
    await expect(VerifyOrbitIndex(params({ locale: 'xx' }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('Verify an orbit, one work', () => {
  it('is rendered when asked for: nothing is built ahead, or kept for a number', async () => {
    vi.stubGlobal('Worker', undefined);
    connection.mockClear();
    render(await VerifyOrbitPage(params({ locale: 'en', id: '31' })));
    expect(connection).toHaveBeenCalledOnce();
  });

  it('sets the work’s number and seed in the margin, the derivation beside them', async () => {
    vi.stubGlobal('Worker', undefined);
    render(await VerifyOrbitPage(params({ locale: 'en', id: '31' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('№ 031');
    expect(screen.getByRole('link', { name: en.verifyOrbit })).toHaveAttribute(
      'href',
      '/verify/orbit',
    );
    expect(
      screen.getByText('0x4a0d5b57e13cf40c56cddb4ee2c10f50ab7aff755e24c61a687855663713f5b5'),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: en.verifyOrbitLineByLine })).toBeInTheDocument();
    expect(
      screen.getByText(/read as far as candidate 77,741; 2,000,000 steps of a fourth-order/),
    ).toBeVisible();
  });

  it('is named for its work, and is not found by any other spelling or number', async () => {
    const metadata = await workMetadata(params({ locale: 'ja', id: '31' }));
    expect(metadata.title).toBe('№\u00a0031 の軌道を検証');
    expect(metadata.alternates?.canonical).toBe('https://cosmic.art/ja/verify/orbit/31');
    for (const id of ['031', '999', 'abc', '-1', '3.1'])
      await expect(VerifyOrbitPage(params({ locale: 'en', id }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(await workMetadata(params({ locale: 'en', id: '999' }))).toEqual({});
  });

  it('is rendered for exactly the numbers the proxy lets through', async () => {
    // The proxy answers the rest with a true 404 before the page can stream (src/lib/addresses.ts).
    const numbers = Array.from({ length: 100 }, (_, id) => String(id));
    for (const id of [...numbers, '031', '00', '071', '999', 'abc', '-1', '3.1', '1e1', '+31']) {
      const rendered = await VerifyOrbitPage(params({ locale: 'en', id })).then(
        () => true,
        () => false,
      );
      expect(readAddress(`/verify/orbit/${id}`).kind === 'here', id).toBe(rendered);
    }
  });
});
