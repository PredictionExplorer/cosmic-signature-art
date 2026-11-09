'use client';
import { useSyncExternalStore } from 'react';
import { dayNumber, expressionOfDay, venueDate, workOfDay } from '@/lib/art/day';
import type { Expression } from '@/lib/art/types';

const noSubscription = () => () => {};

/**
 * The day's expression, read in the browser from the day's-work pool's size and the server's
 * pin, so a layout prerendered on another day never answers for today. The clock is the store.
 */
export function useDayExpression(poolSize: number, pinned?: string): Expression {
  const today = () => expressionOfDay(dayNumber(venueDate(pinned)), poolSize);
  return useSyncExternalStore(noSubscription, today, today);
}

/** The day's work, read in the browser from the day's-work pool and the server's pin, as above. */
export function useDayWork(pool: readonly number[], pinned?: string): number | undefined {
  const today = () => workOfDay(dayNumber(venueDate(pinned)), pool);
  return useSyncExternalStore(noSubscription, today, today);
}
