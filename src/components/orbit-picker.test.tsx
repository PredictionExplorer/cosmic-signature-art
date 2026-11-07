import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { orbitIds } from '@/lib/art/orbit-records';
import { OrbitPicker, typedDigits } from './orbit-picker';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const t = messages('en');
const ids = orbitIds();

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
});
afterEach(() => window.history.replaceState(null, '', '/'));

const field = () => screen.getByLabelText(t.verifyOrbitNumber);
function ask(value: string) {
  fireEvent.change(field(), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: t.verifyOrbitGo }));
}

describe('the number field', () => {
  it('reads a number however it is written', () => {
    expect(typedDigits('031')).toBe('031');
    expect(typedDigits('№ 031')).toBe('031');
    // A name copied from the page keeps its no-break space.
    expect(typedDigits('№\u00a0031')).toBe('031');
    expect(typedDigits('#54 ')).toBe('54');
    expect(typedDigits('abc')).toBe('');
  });

  it('goes on to the work’s derivation', () => {
    render(<OrbitPicker ids={ids} locale="en" t={t} />);
    ask('№ 031');
    expect(field()).toHaveValue('031');
    expect(router.push).toHaveBeenCalledWith('/verify/orbit/31');
    expect(field()).not.toHaveAttribute('aria-invalid');
  });

  it('says in place when a number has no record, until the number changes', () => {
    render(<OrbitPicker ids={ids} locale="en" t={t} />);
    ask('99');
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText('№ 099 has no published record.')).toBeVisible();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('№\u00a0099 has no published record.');
    fireEvent.change(field(), { target: { value: '9' } });
    expect(screen.queryByText('№ 099 has no published record.')).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute('aria-invalid');
  });

  it('does nothing with an empty field', () => {
    render(<OrbitPicker ids={ids} locale="en" t={t} />);
    ask('');
    expect(router.push).not.toHaveBeenCalled();
    expect(field()).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the reader’s language on the way', () => {
    render(<OrbitPicker ids={ids} locale="ko" t={messages('ko')} />);
    fireEvent.change(screen.getByLabelText(messages('ko').verifyOrbitNumber), {
      target: { value: '54' },
    });
    fireEvent.click(screen.getByRole('button', { name: messages('ko').verifyOrbitGo }));
    expect(router.push).toHaveBeenCalledWith('/ko/verify/orbit/54');
  });

  it('sends the number to this page without JavaScript, and goes on from there as it arrives', () => {
    const { container, unmount } = render(<OrbitPicker ids={ids} locale="ja" t={messages('ja')} />);
    const form = container.querySelector('form')!;
    expect(form).toHaveAttribute('action', '/ja/verify/orbit');
    expect(form).toHaveAttribute('method', 'get');
    expect(container.querySelector('input')).toHaveAttribute('name', 'work');
    expect(router.replace).not.toHaveBeenCalled();
    unmount();
    window.history.replaceState(null, '', '/ja/verify/orbit?work=031');
    render(<OrbitPicker ids={ids} locale="ja" t={messages('ja')} />);
    expect(router.replace).toHaveBeenCalledWith('/ja/verify/orbit/31');
  });

  it('stays on the door for a number it does not know, and says so as if typed now', async () => {
    window.history.replaceState(null, '', '/verify/orbit?work=999');
    render(<OrbitPicker ids={ids} locale="en" t={t} />);
    await act(async () => {});
    expect(router.replace).not.toHaveBeenCalled();
    expect(field()).toHaveValue('999');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('№ 999 has no published record.')).toBeInTheDocument();
  });
});
