export type RecencyScope = {
  asOfDate: string;
  preferredStartDate: string;
  fallbackStartDate: string;
  annualStartDate: string;
  structuralStartDate: string;
  preferredLabel: string;
  fallbackLabel: string;
  annualLabel: string;
  structuralLabel: string;
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
    fallbackStartDate: isoDate(monthsAgo(now, 12)),
    annualStartDate: isoDate(monthsAgo(now, 12)),
    structuralStartDate: isoDate(monthsAgo(now, 36)),
    preferredLabel: 'preferred 3-month window',
    fallbackLabel: '1-year monitoring window',
    annualLabel: '1-year monitoring window',
    structuralLabel: '3-year structural context window',
  };
}

export function recencySearchSuffix(scope: RecencyScope) {
  return `published or updated since ${scope.preferredStartDate}; also check one-year context since ${scope.annualStartDate} and three-year structural context since ${scope.structuralStartDate}`;
}

export function recencyPrompt(scope: RecencyScope) {
  return [
    `As of date: ${scope.asOfDate}.`,
    `Quarterly update window: ${scope.preferredStartDate} to ${scope.asOfDate} (last 3 months).`,
    `Annual monitoring window: ${scope.annualStartDate} to ${scope.asOfDate} (last 1 year).`,
    `Structural context window: ${scope.structuralStartDate} to ${scope.asOfDate} (last 3 years).`,
    'Default to the quarterly window for updates, news, board actions, rating actions, EMMA/MSRB filings, budgets, RFPs, advisor/counsel hiring, and other monitoring items.',
    'Use the annual window for issuer/sector backfill when the quarterly window does not surface a credible issuer-specific result.',
    'Use the three-year window for still-relevant structural documents, issuer history, debt programs, sector trends, capital plans, rate cases, and recurring market context.',
    'For each claimed development, include the event/publication date when available and label whether it is quarterly evidence, annual evidence, three-year structural context, older context, or undated.',
  ].join('\n');
}

export function noRecentInfoGuide() {
  return [
    'When no fresh development is found, classify the reason explicitly:',
    '- No recent change found: current official/rating/disclosure sources were checked and no new issuer-specific item was found within the quarterly or annual window.',
    '- Stale source only: relevant evidence exists, but it is older than the annual window or only useful as background.',
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
  if (sourceDate >= scope.annualStartDate) return 'Annual 1-year evidence';
  if (sourceDate >= scope.structuralStartDate) return 'Structural 3-year context';
  return 'Older context only';
}
