import type { Locale } from '@/lib/i18n/routing';

/**
 * What the venue says when its own document has failed, in each of its eight languages: the
 * same line and the same word as the error page of a route (errorTitle and retry in each
 * catalog). They are written out here because nothing can hand them over. The document that
 * provides the route's error page with its words is the thing that failed, and importing the
 * catalogs would put all eight, whole, into every page's script (ARCHITECTURE.md §12).
 * global-error.test.tsx holds each pair to its catalog, so a catalog cannot change its line
 * and leave this one behind.
 */
export const GLOBAL_ERROR_WORDS: Record<Locale, { errorTitle: string; retry: string }> = {
  en: { errorTitle: 'The gallery needs a moment.', retry: 'Try again' },
  zh: { errorTitle: '画廊需要片刻。', retry: '重试' },
  'zh-TW': { errorTitle: '畫廊需要片刻。', retry: '重試' },
  'zh-HK': { errorTitle: '畫廊需要片刻。', retry: '重試' },
  uk: { errorTitle: 'Галереї потрібна мить.', retry: 'Спробувати знову' },
  ko: { errorTitle: '갤러리에 잠시 시간이 필요합니다.', retry: '다시 시도' },
  ja: { errorTitle: 'ギャラリーに少し時間が必要です。', retry: '再試行' },
  vi: { errorTitle: 'Phòng trưng bày cần một chút thời gian.', retry: 'Thử lại' },
};
