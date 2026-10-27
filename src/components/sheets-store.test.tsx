import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeSheet, openSheet, toggleSheet, useOpenSheet } from './sheets-store';

beforeEach(() => act(() => closeSheet()));

describe('sheets store', () => {
  it('holds one open sheet at a time and tells subscribers', () => {
    const { result } = renderHook(() => useOpenSheet());
    expect(result.current).toBeNull();
    act(() => openSheet('index'));
    expect(result.current).toBe('index');
    act(() => openSheet('keys'));
    expect(result.current).toBe('keys');
    act(() => closeSheet('index'));
    expect(result.current).toBe('keys');
    act(() => closeSheet('keys'));
    expect(result.current).toBeNull();
    act(() => toggleSheet('keys'));
    expect(result.current).toBe('keys');
    act(() => toggleSheet('keys'));
    expect(result.current).toBeNull();
    act(() => openSheet('index'));
    act(() => closeSheet());
    expect(result.current).toBeNull();
  });
});
