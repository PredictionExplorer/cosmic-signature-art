/**
 * The accessibility standard every scan in the suite reads a page against: WCAG 2.2 at level AA,
 * with every level and version beneath it. axe tags a rule by the version and level that brought
 * its criterion in, so one standard is five tags, and leaving one out leaves its criteria unread:
 * without "wcag21a" nothing checked that a control's name holds the words it shows (2.5.3), and
 * without "wcag22aa" nothing checked that a target can be pressed without pressing its neighbour
 * (2.5.8). It is named here once, and a lint rule keeps a spec from writing a list of its own
 * (eslint.config.mjs).
 */
export const WCAG_22_AA: string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
