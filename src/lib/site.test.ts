import { describe, expect, it } from 'vitest';
import { DEPLOYMENT_URL, SITE_URL, deploymentUrl, metadata } from './site';
import { roomForPath, roomScript } from './room';

describe('deployment origin', () => {
  it('prefers the production domain on a Vercel production deployment', () => {
    expect(
      deploymentUrl({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'cosmic-signature-art.vercel.app',
        VERCEL_URL: 'cosmic-signature-art-abc123.vercel.app',
        NEXT_PUBLIC_SITE_URL: 'https://cosmic.art',
      }),
    ).toBe('https://cosmic-signature-art.vercel.app');
  });
  it('never trusts a custom production domain to resolve; the branch host stands in', () => {
    expect(
      deploymentUrl({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'cosmic.art',
        VERCEL_BRANCH_URL: 'cosmic-signature-art-git-main-randomwalknft.vercel.app',
        VERCEL_URL: 'cosmic-signature-art-abc123.vercel.app',
        NEXT_PUBLIC_SITE_URL: 'https://cosmic.art',
      }),
    ).toBe('https://cosmic-signature-art-git-main-randomwalknft.vercel.app');
    expect(
      deploymentUrl({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'cosmic.art',
        VERCEL_URL: 'cosmic-signature-art-abc123.vercel.app',
      }),
    ).toBe('https://cosmic-signature-art-abc123.vercel.app');
  });
  it('lets an explicit deployment origin win everywhere', () => {
    expect(
      deploymentUrl({
        NEXT_PUBLIC_DEPLOYMENT_URL: 'https://cosmic.art',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'cosmic.art',
        VERCEL_URL: 'cosmic-signature-art-abc123.vercel.app',
      }),
    ).toBe('https://cosmic.art');
    expect(deploymentUrl({ NEXT_PUBLIC_DEPLOYMENT_URL: 'cosmic-signature-art.vercel.app' })).toBe(
      'https://cosmic-signature-art.vercel.app',
    );
  });
  it('uses the unique deployment URL on previews', () => {
    expect(
      deploymentUrl({
        VERCEL_ENV: 'preview',
        VERCEL_PROJECT_PRODUCTION_URL: 'cosmic-signature-art.vercel.app',
        VERCEL_URL: 'cosmic-signature-art-abc123.vercel.app',
      }),
    ).toBe('https://cosmic-signature-art-abc123.vercel.app');
  });
  it('falls back to the configured or canonical origin off Vercel', () => {
    expect(deploymentUrl({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:4318' })).toBe(
      'http://127.0.0.1:4318',
    );
    expect(deploymentUrl({})).toBe('https://cosmic.art');
    expect(deploymentUrl({ VERCEL_URL: 'https://already.vercel.app' })).toBe(
      'https://already.vercel.app',
    );
  });
});

describe('page metadata', () => {
  it('keeps canonical links on the canonical origin and images on the serving origin', () => {
    const result = metadata('ja', '/collection', 'Title', 'Description');
    expect(result.alternates?.canonical).toBe(`${SITE_URL}/ja/collection`);
    const images = result.openGraph?.images as { url: string; alt: string }[];
    expect(images[0].url).toBe(`${DEPLOYMENT_URL}/art/23-ink.webp`);
    expect(new URL(images[0].url).origin).toBe(new URL(DEPLOYMENT_URL).origin);
  });
  it('leaves an absolute artwork image untouched and allows no image', () => {
    const absolute = metadata('en', '/art/31', 'T', 'D', {
      url: 'https://a1.cosmicsignature.com/x/full.webp',
      alt: 'Signature 31',
    });
    const images = absolute.openGraph?.images as { url: string }[];
    expect(images[0].url).toBe('https://a1.cosmicsignature.com/x/full.webp');
    const none = metadata('en', '/privacy', 'T', 'D', null);
    expect(none.openGraph?.images).toEqual([]);
    expect((none.twitter as { card: string }).card).toBe('summary');
  });
});

describe('room ground', () => {
  it('opens the process essay on the night ground in every locale', () => {
    expect(roomForPath('/process')).toBe('night');
    expect(roomForPath('/ja/process')).toBe('night');
    expect(roomForPath('/zh-TW/process/')).toBe('night');
    expect(roomForPath('/processes')).toBe('paper');
    expect(roomForPath('/collection')).toBe('paper');
    expect(roomForPath('/')).toBe('paper');
  });
  it('ships the same rule as an inline script for the first paint', () => {
    const run = (path: string) => {
      const html = { attributes: new Map<string, string>() };
      const meta = { attributes: new Map<string, string>() };
      const fn = new Function(
        'location',
        'document',
        roomScript.replace(/^\(function\(\)\{/, '').replace(/\}\)\(\)$/, ''),
      );
      fn(
        { pathname: path },
        {
          documentElement: { setAttribute: (k: string, v: string) => html.attributes.set(k, v) },
          querySelector: () => ({
            setAttribute: (k: string, v: string) => meta.attributes.set(k, v),
          }),
        },
      );
      return { room: html.attributes.get('data-room'), color: meta.attributes.get('content') };
    };
    expect(run('/ko/process')).toEqual({ room: 'night', color: '#000000' });
    expect(run('/uk/collection')).toEqual({ room: 'paper', color: '#f1ebdf' });
    expect(run('/')).toEqual({ room: 'paper', color: '#f1ebdf' });
  });
});
