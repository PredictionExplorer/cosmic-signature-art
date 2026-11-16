import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AWAITS_STREAM, STREAMED, withoutScriptStyles } from './without-script';

const source = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8');

/** A page whose boundary React sends after its fallback, parsed as a browser without script would. */
async function streamedPage() {
  const stream = await renderToReadableStream(
    <div className="site">
      <Suspense fallback={<main {...AWAITS_STREAM}>Cosmic Signature</main>}>
        <main {...STREAMED}>
          {'A recorded three-body orbit, rendered as light and as ink. '.repeat(12)}
        </main>
      </Suspense>
    </div>,
    { progressiveChunkSize: 1 },
  );
  await stream.allReady;
  const page = document.createElement('div');
  // A set innerHTML runs no script: nothing moves the segment into its place.
  page.innerHTML = await new Response(stream).text();
  return page;
}

/** The selectors of the stylesheet's rules, in order. */
const selectors = withoutScriptStyles
  .split('}')
  .filter(Boolean)
  .map((rule) => rule.slice(0, rule.indexOf('{')));

describe('the page without script', () => {
  it('finds the streamed part where React sets it aside', async () => {
    const page = await streamedPage();
    const streamed = page.querySelector('[data-streamed]')!;
    // If React renames its segments, the stylesheet reveals nothing and this fails.
    const segment = selectors.find((selector) => selector.includes(':has('))!;
    expect(segment).toBe('div[hidden][id^="S:"]:has(>[data-streamed])');
    expect(streamed.parentElement!.matches(segment.slice(0, segment.indexOf(':has(')))).toBe(true);
    // The segment is a later sibling of the site's wrapper: what the stylesheet's order rests on.
    const wrapper = page.querySelector('.site')!;
    expect(streamed.parentElement!.parentElement).toBe(wrapper.parentElement);
    expect(
      wrapper.compareDocumentPosition(streamed) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('takes away what only waited for the stream', async () => {
    const page = await streamedPage();
    const waiting = page.querySelector('.site main')!;
    expect(waiting.textContent).toBe('Cosmic Signature');
    expect(selectors.some((selector) => waiting.matches(selector))).toBe(true);
    expect(withoutScriptStyles).toContain('[data-awaits-stream]{display:none}');
  });

  it('shows the still that script would have settled', () => {
    // The rule it answers: the still is sent clear over its preview until it is settled.
    const held = /\.art-media \.art-still \{[^}]*opacity: 0;/;
    expect(source('app/globals.css')).toMatch(held);
    // One element more than that rule, so it wins wherever the document places it.
    expect(withoutScriptStyles).toContain('.art-media img.art-still{opacity:1}');
  });

  it('names the wrapper and the colophon as the venue renders them', () => {
    expect(selectors).toEqual(expect.arrayContaining(['.site', '.site-footer']));
    expect(source('components/motion-provider.tsx')).toMatch(/className=\{[^}]*'site'/);
    expect(source('components/colophon.tsx')).toMatch(/className=\{?[`'"]site-footer\b/);
  });

  it('is carried by the document in a noscript, where no script can be needed to read it', () => {
    expect(source('app/venue-document.tsx')).toMatch(
      /<noscript>\s*<style dangerouslySetInnerHTML=\{\{ __html: withoutScriptStyles \}\} \/>\s*<\/noscript>/,
    );
  });

  it('keeps no route behind a loading plate', () => {
    // A loading file wraps every page beneath it in a Suspense boundary, and React sets a large
    // boundary's content aside in a hidden segment that only script puts in place: the home,
    // the collection and every work were sent that way. A page that must wait says so itself,
    // with a boundary around the wait alone (src/components/waiting-room.tsx).
    const routes = readdirSync(join(process.cwd(), 'src', 'app'), { recursive: true }) as string[];
    expect(routes.filter((path) => /(^|[\\/])loading\.[jt]sx?$/.test(path))).toEqual([]);
    // The walk saw the routes: this guard would otherwise pass on an empty folder.
    expect(routes.some((path) => /(^|[\\/])page\.tsx$/.test(path))).toBe(true);
  });
});
