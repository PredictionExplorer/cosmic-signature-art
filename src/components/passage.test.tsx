import type { ComponentProps, ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { en } from '@/lib/i18n/en';
import type { ArtworkMedia } from './artwork-media';
import { Passage } from './passage';

type MediaProps = ComponentProps<typeof ArtworkMedia>;
const media = vi.hoisted(() => ({ current: null as MediaProps | null }));
const motion = vi.hoisted(() => ({ paused: false, theatre: 'playing' as const, toggle: vi.fn() }));
vi.mock('./motion-provider', () => ({ useMotion: () => motion }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('./artwork-media', () => ({
  ArtworkMedia: (props: MediaProps) => {
    media.current = props;
    return (
      <span
        role="img"
        aria-label={props.alt}
        data-still={String(!!props.still)}
        data-preview={props.previewSrc ?? ''}
        data-restart={props.restart}
      />
    );
  },
}));

const work = getCuratedArtwork(23)!;
function record() {
  return document.querySelector('.film-record')!;
}
function section() {
  return document.querySelector('.passage')!;
}

beforeEach(() => {
  vi.useFakeTimers();
  motion.paused = false;
  motion.toggle.mockClear();
  media.current = null;
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the Passage', () => {
  it('starts the Ink film from its first frame with an inline preview and a truthful label', () => {
    render(<Passage artwork={work} locale="en" t={en} previewSrc="data:image/webp;base64,AAAA" />);
    expect(media.current?.previewSrc).toBe('data:image/webp;base64,AAAA');
    expect(media.current?.hold).toBe(true);
    expect(media.current?.startAt).toBeUndefined();
    expect(media.current?.still).toBe(false);
    expect(record()).toHaveTextContent(`${en.ink} / ${en.arriving}`);
    expect(record().querySelector('.live-dot')).not.toHaveClass('is-live');
    expect(document.querySelector('.progress-track i')).toHaveStyle({ width: '0%' });
    act(() => media.current!.onSettled!());
    expect(record()).toHaveTextContent(`${en.ink} / ${en.still}`);
    act(() => media.current!.onPlaybackChange!(true));
    act(() => media.current!.onProgress!(12, 30));
    expect(record()).toHaveTextContent(`${en.ink} / ${en.film}`);
    expect(record()).toHaveTextContent('00:12');
    expect(record().querySelector('.live-dot')).toHaveClass('is-live');
    expect(document.querySelector('.progress-track i')).toHaveStyle({ width: '40%' });
  });

  it('rests on the still when the film resolves, then offers Again, and remembers for the session', () => {
    render(<Passage artwork={work} locale="en" t={en} />);
    act(() => media.current!.onSettled!());
    act(() => media.current!.onPlaybackChange!(true));
    expect(screen.getByRole('button', { name: en.sit })).toBeVisible();
    act(() => media.current!.onProgress!(30, 30));
    act(() => media.current!.onEnded!());
    expect(record()).toHaveTextContent(`${en.ink} / ${en.still}`);
    expect(record().querySelector('.live-dot')).not.toHaveClass('is-live');
    expect(document.querySelector('.progress-track i')).toHaveStyle({ width: '100%' });
    expect(sessionStorage.getItem('cosmic-art-home-film-v1')).toBe('resolved');
    expect(screen.queryByRole('button', { name: en.again })).toBeNull();
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByRole('button', { name: en.again })).toBeVisible();
    expect(screen.queryByRole('button', { name: en.sit })).toBeNull();
    const restart = media.current!.restart;
    fireEvent.click(screen.getByRole('button', { name: en.again }));
    expect(media.current!.restart).toBe((restart ?? 0) + 1);
    expect(media.current!.still).toBe(false);
    expect(motion.toggle).not.toHaveBeenCalled();
  });

  it('opens on the still with Again once the film has resolved in this session', () => {
    sessionStorage.setItem('cosmic-art-home-film-v1', 'resolved');
    motion.paused = true;
    render(<Passage artwork={work} locale="en" t={en} />);
    expect(media.current?.still).toBe(true);
    expect(screen.getByRole('button', { name: en.again })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: en.again }));
    expect(media.current?.still).toBe(false);
    expect(motion.toggle).toHaveBeenCalledOnce();
  });

  it('Sit fades the chrome until the visitor moves', () => {
    render(<Passage artwork={work} locale="en" t={en} />);
    fireEvent.click(screen.getByRole('button', { name: en.sit }));
    expect(section()).toHaveAttribute('data-sit');
    fireEvent.pointerMove(section());
    expect(section()).toHaveAttribute('data-sit');
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerMove(section());
    expect(section()).not.toHaveAttribute('data-sit');
  });

  it('crossing into Light shows the still and never a film; the record says so', () => {
    render(<Passage artwork={work} locale="en" t={en} />);
    fireEvent.click(screen.getByRole('button', { name: /Cross into Light/ }));
    act(() => vi.advanceTimersByTime(600));
    expect(media.current?.media?.id).toBe('light');
    expect(media.current?.previewSrc).toBeUndefined();
    expect(record()).toHaveTextContent(`${en.light} / ${en.arriving}`);
    act(() => media.current!.onSettled!());
    expect(record()).toHaveTextContent(`${en.light} / ${en.still}`);
    expect(screen.queryByRole('button', { name: en.sit })).toBeNull();
    expect(document.querySelector('.progress-track i')).toHaveStyle({ width: '100%' });
  });
});
