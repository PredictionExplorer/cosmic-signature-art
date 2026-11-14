import { describe, expect, it } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { notFoundHeading } from './not-found-title';

describe('what the 404 says of an address', () => {
  const en = messages('en');
  const uk = messages('uk');

  it('says a number the collection does not hold has not been imprinted', () => {
    expect(notFoundHeading('en', '/art/999')).toBe(fill(en.notImprinted, { work: '№\u00a0999' }));
    expect(notFoundHeading('en', '/verify/orbit/999')).toBe(
      fill(en.notImprinted, { work: '№\u00a0999' }),
    );
  });

  it('says a work it cannot name is not here', () => {
    expect(notFoundHeading('en', '/art/abc')).toBe(en.notFound);
    expect(notFoundHeading('en', '/art/-1')).toBe(en.notFound);
    // A page's own notFound() has no address to read: the work pages are the ones that call it.
    expect(notFoundHeading('en', undefined)).toBe(en.notFound);
  });

  it('says any other page is not here', () => {
    expect(notFoundHeading('en', '/zzz')).toBe(en.pageNotFound);
    expect(notFoundHeading('en', '/exhibitions/nothing')).toBe(en.pageNotFound);
  });

  it('says it in the language of the address', () => {
    expect(notFoundHeading('uk', '/uk/zzz')).toBe(uk.pageNotFound);
    expect(notFoundHeading('uk', '/uk/art/999')).toBe(
      fill(uk.notImprinted, { work: '№\u00a0999' }),
    );
    expect(uk.pageNotFound).not.toBe(en.pageNotFound);
  });
});
