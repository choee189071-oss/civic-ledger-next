export type RecencyScope = {
  asOfDate: string;
  preferredStartDate: string;
  fallbackStartDate: string;
  preferredLabel: string;
  fallbackLabel: string;
};

type DatedSource = {
  date?: string;
  last_updated?: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthsAgo(from: Date, months: number) {
  const next = new Date(from);
  next.setMonth(next.getMonth() - months);
  return next;
}

export function buildRecencyScope(now = new Date()): RecencyScope {
  return {
    asOfDate: isoDate(now),
    preferredStartDate: isoDate(monthsAgo(now, 3)),
    fallbackStartDate: isoDate(monthsAgo(now, 6)),
    preferredLabel: 'preferred 3-month window',
    fallbackLabel: '6-month fallback window',
  };
}

export function recencySearchSuffix(scope: RecencyScope) {
  return `published or updated since ${scope.preferredStartDate}; if no result, use fallback since ${scope.fallbackStartDate}`;
}

export function recencyPrompt(scope: RecencyScope) {
  return [
    `As of date: ${scope.asOfDate}.`,
    `Preferred recency window: ${scope.preferredStartDate} to ${scope.asOfDate} (last 3 months).`,
    `Fallback recency window: ${scope.fallbackStartDate} to ${scope.asOfDate} (last 6 months).`,
    'Default to the preferred 3-month window for updates, news, board actions, rating actions, EMMA/MSRB filings, budgets, RFPs, advisor/counsel hiring, and other monitoring items.',
    'Expand to the 6-month fallback window only if the preferred 3-month window does not surface a credible issuer-specific result.',
    'Use older material only for structural background or major still-relevant events, and label it as older context rather than a recent update.',
    'For each claimed development, include the event/publication date when available and label whether it is within the 3-month window, 6-month fallback, older context, or undated.',
  ].join('\n');
}

export function noRecentInfoGuide() {
  return [
    'When no fresh development is found, classify the reason explicitly:',
    '- No recent change found: current official/rating/disclosure sources were checked and no new issuer-specific item was found within the 3-month or 6-month window.',
    '- Stale source only: relevant evidence exists, but it is older than the 6-month fallback window or only useful as background.',
    '- Insufficient public evidence: the search did not surface the needed board minutes, packets, EMMA/MSRB items, rating pages, or official issuer documents.',
    '- Needs manual verification: a candidate was found, but the date, issuer specificity, source quality, or materiality is unclear.',
  ].join('\n');
}

export function sourceRecencyLabel(source: DatedSource, scope: RecencyScope) {
  const rawDate = source.date || source.last_updated;
  if (!rawDate) return 'Undated source';

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return 'Undated source';

  const sourceDate = isoDate(parsed);
  if (sourceDate >= scope.preferredStartDate) return 'Preferred 3-month evidence';
  if (sourceDate >= scope.fallbackStartDate) return '6-month fallback evidence';
  return 'Older context only';
}
