import { expect, test, type Page } from './fixtures';
import { catalogs } from '../../src/lib/i18n/messages';
import { localizedPath } from '../../src/lib/i18n/routing';
import { readFileSync } from 'node:fs';
import { facesLoaded, noHorizontalOverflow } from './helpers';

/** The record tests read the still; ambient motion is paused before the page loads. */
async function pauseMotion(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('cosmic-art-motion-v1', 'paused'));
}

const t = catalogs.en;
const archive = JSON.parse(
  readFileSync(new URL('../../src/lib/art/curated-records.json', import.meta.url), 'utf8'),
) as { records: { id: number; transactionHash: string; seed: string }[] };
const identity = archive.records.find((entry) => entry.id === 31)!;

test('Verify on chain keeps each Copy whole on its line, and a hash with its arrow', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/art/31?view=still#record');
  const verify = page.getByRole('main').locator('#record details', { hasText: t.verifyOnChain });
  await verify.locator('summary').click();
  await facesLoaded(page);
  // Each address here has the one word that copies it: the recipient's always, the custodian's
  // and the anchoring participant's when the record names them. Beside 42 characters of address
  // on a phone the word was squeezed to 28 px and broke in two, Cop over y.
  const copies = verify.getByRole('button', { name: new RegExp(`^${t.copyAddress} 0x`) });
  await expect(copies.first()).toBeVisible();
  const drawn = await copies.evaluateAll((buttons) =>
    buttons.map((button) => {
      const word = document.createRange();
      word.selectNodeContents(button.firstChild!);
      const lines = new Set(
        [...word.getClientRects()].filter((rect) => rect.width > 0.5).map((rect) => rect.top),
      );
      const box = button.getBoundingClientRect();
      return {
        lines: lines.size,
        wide: Math.round(box.width * 1000) / 1000 >= 44,
        tall: Math.round(box.height * 1000) / 1000 >= 44,
      };
    }),
  );
  expect(drawn.length).toBeGreaterThan(0);
  for (const copy of drawn) expect(copy).toEqual({ lines: 1, wide: true, tall: true });
  // The arrow that says a link leaves the venue stands in the line its hash ends on: the hash
  // took two lines on a phone, and the arrow a third, alone.
  const lines = await verify.getByRole('link', { name: /Transaction/ }).evaluate((link) => {
    const top = (node: Node, at: number) => {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return range.getBoundingClientRect().top;
    };
    let hashEnds: number | undefined;
    let arrow: number | undefined;
    const texts = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      const text = node.textContent ?? '';
      if (text.includes('↗')) arrow = top(node, text.indexOf('↗'));
      else if (/[\da-f]$/.test(text)) hashEnds = top(node, text.length - 1);
    }
    return { hashEnds, arrow };
  });
  expect(lines.hashEnds).toBeDefined();
  expect(lines.arrow).toBeDefined();
  expect(Math.abs(lines.arrow! - lines.hashEnds!)).toBeLessThan(3);
  await noHorizontalOverflow(page);
});

test('an artwork is typed as a catalogue entry from the publisher’s record, with its proofs and files', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/art/31?view=still#record');
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  const entry = main.locator('#record');
  // The one h1 is the entry's first line; the numeral grammar is "Signature 031". The published
  // fate is not the title: it stands among the publisher's names, labelled and quoted, with a
  // note of what the record found and how far it looked.
  await expect(entry.getByRole('heading', { level: 1 })).toHaveText('Signature 031');
  await expect(entry).toContainText('Published fate: “Eternal Dance”');
  await expect(
    entry.getByRole('complementary', { name: t.glossary }).getByRole('listitem'),
  ).toContainText([t.glossaryFate.replace('{steps}', '8,000,000')]);
  await expect(entry.getByText(/candidate orbits\. Number [\d,]+ was chosen\./)).toBeVisible();
  // A label keeps its figure, a figure its unit, a separator the phrase before it: no-break spaces.
  await expect(entry.getByText(/^Cycle\s1\s· /)).toBeVisible();
  await expect(entry).toContainText(t.spectralClass);
  await expect(entry).toContainText(t.syzygies);
  await expect(entry).toContainText(/\d+\snm/);
  // The glossary stands in the margin, Signature and expression defined first.
  const glossary = entry.getByRole('complementary', { name: t.glossary });
  await expect(glossary.getByRole('listitem').first()).toHaveText(new RegExp(t.glossarySignature));
  await expect(glossary.getByRole('listitem').nth(1)).toHaveText(new RegExp(t.glossaryExpression));
  // A footnote mark is a small figure with a 24 px target (WCAG 2.5.8), so a finger finds it.
  const mark = entry.getByRole('link', { name: 'Note 1', exact: true });
  const target = await mark.evaluate((link) => {
    const area = getComputedStyle(link, '::after');
    return { width: parseFloat(area.width), height: parseFloat(area.height) };
  });
  expect(target.width).toBeGreaterThanOrEqual(24);
  expect(target.height).toBeGreaterThanOrEqual(24);
  await mark.click();
  await expect(page).toHaveURL(/#note-1$/);
  // Verify on chain holds the full seed, the mint transaction and the two honesty notes.
  const verify = entry.locator('details', { hasText: t.verifyOnChain });
  await verify.locator('summary').click();
  await expect(verify.getByRole('link', { name: /Transaction/ })).toHaveAttribute(
    'href',
    `https://arbiscan.io/tx/${identity.transactionHash}`,
  );
  await expect(verify).toContainText(identity.seed);
  await expect(verify).toContainText(t.honestyRecord);
  // The custody timeline keeps its two honest streams.
  const custody = main.getByRole('region', { name: t.ownershipHistory });
  await expect(custody.getByRole('heading', { name: t.eventMint, exact: true })).toBeVisible();
  await expect(custody.getByRole('link', { name: /Transaction/ }).first()).toHaveAttribute(
    'href',
    /^https:\/\/arbiscan\.io\/tx\/0x[\da-f]{64}$/i,
  );
  await expect(main.getByText(t.historyNote)).toBeVisible();
  await expect(custody.getByText(/^(Sold|Sale price|ETH)$/i)).toHaveCount(0);
  // Files by medium link the published originals, the spectral sweep among them.
  const sources = main.getByRole('region', { name: t.sources });
  const inkFiles = sources.locator('article', {
    has: page.getByRole('heading', { name: t.ink, exact: true }),
  });
  await expect(inkFiles.getByRole('link', { name: /^Film · 30 s/ })).toHaveAttribute(
    'href',
    new RegExp(`/${identity.seed}/videos/web/ember\\.mp4$`),
  );
  await expect(sources.getByRole('link', { name: /^Spectral sweep · 10 s/ })).toHaveAttribute(
    'href',
    new RegExp(`/${identity.seed}/videos/web/spectral_sweep\\.mp4$`),
  );
  await expect(
    sources.getByRole('link', { name: /^Still · WebP · 3,456 × 2,234 px/ }).first(),
  ).toBeVisible();
  await expect(sources.getByRole('link', { name: /Token metadata/ })).toHaveAttribute(
    'href',
    'https://a1.cosmicsignature.com/metadata/31',
  );
  // Every link here leaves the venue and says so, but Verify an orbit, which stays.
  const verifyOrbit = sources.getByRole('link', { name: t.verifyOrbit, exact: true });
  await expect(verifyOrbit).toHaveAttribute('href', '/verify/orbit/31');
  await expect(verifyOrbit).not.toContainText('↗');
  await expect(sources.getByRole('link').filter({ hasNotText: '↗' })).toHaveCount(1);
  // Verify a download: the published hashes in full, and a chosen file hashed in the browser.
  const download = sources.locator('details', { hasText: t.verifyDownload });
  await download.locator('summary').click();
  await expect(download.getByText(`${t.ink} · ${t.film} · videos/web/ember.mp4`)).toBeVisible();
  await expect(download.locator('code').first()).toHaveText(/^[0-9a-f]{64}$/);
  await download
    .getByLabel(t.verifyChoose)
    .setInputFiles({ name: 'not-the-film.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') });
  await expect(download.getByRole('status')).toContainText(t.verifyNoMatch);
  await expect(download.getByRole('status')).toContainText(/sha256 [0-9a-f]{64}/);
  await noHorizontalOverflow(page);
});

test('the entry is set in every locale without running past its measure', async ({ page }) => {
  await pauseMotion(page);
  for (const locale of ['uk', 'vi'] as const) {
    await page.goto(`/${locale}/art/31?view=still#record`);
    const entry = page.getByRole('main').locator('#record');
    await expect(entry.getByRole('heading', { level: 1 })).toHaveText(
      new RegExp(`^${catalogs[locale].signature} 031`),
    );
    await expect(entry.getByText(catalogs[locale].glossarySignature)).toBeVisible();
    await noHorizontalOverflow(page);
  }
});

test('a work is described to a search engine and a shared link in the venue’s own words, in the page’s language', async ({
  page,
}) => {
  await pauseMotion(page);
  // № 031's line (src/lib/art/fate-line.ts): its record dates no ejection, and its energy held.
  // The unit tests hold the same of all 72 works in eight languages
  // (src/lib/art/work-description.test.ts); this reads it where a crawler does.
  for (const locale of ['en', 'uk', 'ja'] as const) {
    const words = catalogs[locale];
    const number = new Intl.NumberFormat(locale);
    const said = words.sentences
      .replace('{first}', words.fateTogether.replace('{steps}', number.format(1_000_000)))
      .replace('{second}', words.fateStill.replace('{steps}', number.format(8_000_000)));
    await page.goto(`${localizedPath(locale, '/art/31')}?view=still`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    for (const name of ['description', 'og:description', 'twitter:description'])
      await expect(
        page.locator(`meta[name="${name}"], meta[property="${name}"]`),
        `${locale} ${name}`,
      ).toHaveAttribute('content', said);
    // The structured data arrives with the record, and says the same.
    const structured = page.locator('#record script[type="application/ld+json"]');
    await expect(structured).toBeAttached();
    const data = JSON.parse((await structured.textContent())!) as Record<string, unknown>;
    expect(data.description, locale).toBe(said);
    expect(data.artMedium, locale).toBe(
      words.sentences.replace('{first}', words.inkMedium).replace('{second}', words.lightMedium),
    );
    // Never the token's English sentence ("… fate: eternal dance. Imprinted in Round 1 …"), and
    // no paper claimed of a simulated ground.
    expect(JSON.stringify(data), locale).not.toMatch(/eternal|\bRound\b|syzyg/i);
    expect(data, locale).not.toHaveProperty('artworkSurface');
  }
});

test('invalid history cursors show an honest recovery path without losing the still view', async ({
  page,
}) => {
  await pauseMotion(page);
  await page.goto('/art/31?view=still&transfers=bad%2Fcursor#history');
  const history = page.locator('#history:visible').first();
  await expect(history.getByText(t.historyUnavailable)).toBeVisible();
  const reset = history.getByRole('link', { name: /Latest events/ });
  await expect(reset).toHaveAttribute('href', '/art/31?view=still#history');
  await reset.click();
  await expect(page).toHaveURL(/\/art\/31\?view=still#history$/);
  await expect(page.getByRole('region', { name: t.ownershipHistory })).toBeVisible();
  await expect(page).toHaveURL(/view=still/);
});
