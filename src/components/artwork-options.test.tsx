import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { ArtworkOptions } from './artwork-options';

describe('secondary artwork controls', () => {
  it('keeps optional actions and timing quiet until the visitor opens the disclosure', () => {
    render(<ArtworkOptions t={en} onStudy={vi.fn()} onSit={vi.fn()} readout="00:12 / 00:30" />);
    const trigger = screen.getByRole('button', { name: en.ways });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: en.enlarge })).toBeNull();
    expect(screen.queryByRole('button', { name: en.sit })).toBeNull();
    expect(screen.queryByText('00:12 / 00:30')).toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: en.enlarge })).toBeVisible();
    expect(screen.getByRole('button', { name: en.sit })).toBeVisible();
    expect(screen.getByText('00:12 / 00:30')).toBeVisible();
  });

  it('Escape closes the disclosure and returns keyboard focus to its trigger', () => {
    render(<ArtworkOptions t={en} onStudy={vi.fn()} onSit={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: en.ways });
    fireEvent.click(trigger);
    screen.getByRole('button', { name: en.enlarge }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('button', { name: en.enlarge })).toBeNull();
  });

  it('dismisses on an outside press, while a press inside keeps the choices available', () => {
    render(<ArtworkOptions t={en} onStudy={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: en.ways });
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: en.enlarge }));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when keyboard focus leaves the control group', () => {
    render(
      <>
        <ArtworkOptions t={en} onStudy={vi.fn()} />
        <button>Next work</button>
      </>,
    );
    const trigger = screen.getByRole('button', { name: en.ways });
    fireEvent.click(trigger);
    const study = screen.getByRole('button', { name: en.enlarge });
    fireEvent.blur(study, { relatedTarget: screen.getByRole('button', { name: 'Next work' }) });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes before opening Study and supplies the stable trigger for return focus', () => {
    const study = vi.fn();
    render(<ArtworkOptions t={en} onStudy={study} />);
    const trigger = screen.getByRole('button', { name: en.ways });
    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: en.sit })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.enlarge }));
    expect(study).toHaveBeenCalledWith(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('Sit closes its choices and keeps a stable focus target for waking the interface', () => {
    const sit = vi.fn();
    render(<ArtworkOptions t={en} onSit={sit} />);
    const trigger = screen.getByRole('button', { name: en.ways });
    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: en.enlarge })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.sit }));
    expect(sit).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
