import type { IssuerProfile, ResearchRecord } from './types/public-finance';

type SourceLike = {
  title?: string;
  document?: string;
  document_title?: string;
  documentType?: string;
  type?: string;
  document_type?: string;
  url?: string;
  source_url?: string;
  source?: string;
  sourceTier?: string;
  source_tier?: string;
  date?: string;
  publication_date?: string;
  filing_date?: string;
  filingDate?: string;
  notes?: string;
  snippet?: string;
  status?: string;
};

export function profileKey(value: string) {
  return value.trim().toLowerCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizedText(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function sourceText(source: SourceLike) {
  return [
    source.title,
    source.document,
    source.document_title,
    source.documentType,
    source.type,
    source.document_type,
    source.url,
    source.source_url,
    source.notes,
    source.snippet,
  ].filter(Boolean).join(' ');
}

function recordSources(record: Partial<ResearchRecord> | null | undefined): SourceLike[] {
  if (!record) return [];

  return [
    ...(record.documentInventory ?? []),
    ...(record.searchResults ?? []),
    ...((record.evidencePackage?.document_inventory as SourceLike[] | undefined) ?? []),
  ] as SourceLike[];
}

function sourceUrl(record: Partial<ResearchRecord> | null | undefined, pattern: RegExp) {
  const match = recordSources(record).find((source) => pattern.test(sourceText(source).toLowerCase()));
  return normalizedText(match?.url ?? match?.source_url);
}

function sourceDate(source: SourceLike) {
  return normalizedText(source.date ?? source.publication_date ?? source.filing_date ?? source.filingDate);
}

function sourceTitle(source: SourceLike) {
  return normalizedText(source.title ?? source.document ?? source.document_title ?? source.url ?? source.source_url ?? 'Untitled source');
}

function sourceTrail(record: Partial<ResearchRecord> | null | undefined) {
  const seen = new Set<string>();

  return recordSources(record)
    .map((source) => {
      const title = sourceTitle(source);
      const url = normalizedText(source.url ?? source.source_url);
      const key = `${title}|${url}`.toLowerCase();
      if (!title || seen.has(key)) return null;
      seen.add(key);

      return {
        title,
        url,
        documentType: normalizedText(source.documentType ?? source.document_type ?? source.type),
        sourceTier: normalizedText(source.sourceTier ?? source.source_tier),
        date: sourceDate(source),
        status: normalizedText(source.status) || 'Candidate',
        notes: normalizedText(source.notes ?? source.snippet),
        capturedAt: today(),
      };
    })
    .filter(Boolean)
    .slice(0, 30) as Array<Record<string, unknown>>;
}

function firstRating(record: Partial<ResearchRecord> | null | undefined) {
  const text = [
    record?.snippet,
    record?.summary,
    ...(record?.facts ?? []),
  ].join(' ');
  const matches = text.match(/\b(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?)\b/g);
  return matches ? [...new Set(matches)].slice(0, 4).join(' / ') : '';
}

function outstandingDebt(record: Partial<ResearchRecord> | null | undefined) {
  const text = [
    record?.snippet,
    record?.summary,
    ...(record?.facts ?? []),
  ].join(' ');
  const match = text.match(/(?:outstanding debt|debt outstanding|bonds outstanding|principal amount outstanding)[^.\n]{0,180}/i);
  return normalizedText(match?.[0]);
}

function sectorFromRecord(record: Partial<ResearchRecord> | null | undefined) {
  const text = `${record?.title ?? ''} ${record?.researchModeLabel ?? ''} ${record?.topic ?? ''} ${record?.snippet ?? ''}`.toLowerCase();
  if (/community college|ccd|school district|education/.test(text)) return 'Education';
  if (/water|power|electric|utility|revenue bond/.test(text)) return 'Utility';
  if (/city|county|general fund|lease revenue/.test(text)) return 'City / County';
  if (/health|hospital|medical/.test(text)) return 'Healthcare';
  if (/transit|transportation|airport|port/.test(text)) return 'Transportation';
  return normalizedText(record?.researchModeLabel ?? record?.topic);
}

function stateFromRecord(record: Partial<ResearchRecord> | null | undefined) {
  const text = `${record?.title ?? ''} ${record?.snippet ?? ''} ${(record?.facts ?? []).join(' ')}`;
  if (/\bcalifornia\b|\bCA\b/.test(text)) return 'CA';
  return '';
}

function coverageScore(profile: Partial<IssuerProfile>) {
  const required: Array<keyof IssuerProfile> = [
    'legalName',
    'sector',
    'state',
    'ratings',
    'outstandingDebt',
    'latestACFR',
    'latestOS',
    'latestEmmaFiling',
    'boardPage',
    'advisorsCounsel',
    'lastCheckedDate',
  ];
  const found = required.filter((key) => normalizedText(profile[key]).length > 0).length;
  return Math.round((found / required.length) * 100);
}

function updateHistoryEntry(record: Partial<ResearchRecord> | null | undefined, reason: string) {
  return {
    checkedAt: new Date().toISOString(),
    reason,
    sourceRecordId: record?.id ?? null,
    sourceRecordTitle: record?.title ?? null,
    researchMode: record?.researchModeLabel ?? record?.topic ?? null,
    status: record?.workflowStatus ?? null,
  };
}

function prefer(existing: unknown, candidate: unknown) {
  return normalizedText(existing) || normalizedText(candidate) || undefined;
}

export function buildIssuerProfileFromRecord(
  record: Partial<ResearchRecord> | null | undefined,
  existing?: IssuerProfile,
  reason = 'Updated from research record'
): IssuerProfile {
  const issuer = existing?.issuer || record?.title || 'New issuer';
  const nextTrail = sourceTrail(record);
  const currentTrail = existing?.sourceTrail ?? [];
  const trailByKey = new Map<string, Record<string, unknown>>();
  [...nextTrail, ...currentTrail].forEach((item) => {
    const key = `${item.title ?? ''}|${item.url ?? ''}`.toLowerCase();
    if (key.trim() && !trailByKey.has(key)) trailByKey.set(key, item);
  });

  const profile: IssuerProfile = {
    issuer,
    legalName: prefer(existing?.legalName, issuer),
    sector: prefer(existing?.sector, sectorFromRecord(record)),
    state: prefer(existing?.state, stateFromRecord(record)),
    ratings: prefer(existing?.ratings ?? existing?.rating, firstRating(record)),
    rating: prefer(existing?.rating, existing?.ratings ?? firstRating(record)),
    outstandingDebt: prefer(existing?.outstandingDebt, outstandingDebt(record)),
    latestACFR: prefer(existing?.latestACFR, sourceUrl(record, /annual comprehensive financial report|\bacfr\b|audited financial|financial statements/)),
    latestOS: prefer(existing?.latestOS, sourceUrl(record, /official statement|preliminary official statement|\bpos\b/)),
    latestEmmaFiling: prefer(existing?.latestEmmaFiling, sourceUrl(record, /emma|msrb|continuing disclosure|annual disclosure|annual report/)),
    latestRatingReport: prefer(existing?.latestRatingReport, sourceUrl(record, /rating report|rating action|moody|s&p|standard & poor|fitch|kroll|kb ra/)),
    latestBudget: prefer(existing?.latestBudget, sourceUrl(record, /budget|financial plan/)),
    boardPage: prefer(existing?.boardPage, sourceUrl(record, /board|agenda|minutes|packet|resolution/)),
    emmaLink: prefer(existing?.emmaLink, sourceUrl(record, /emma|msrb/)),
    advisorsCounsel: prefer(existing?.advisorsCounsel ?? existing?.knownAdvisors, sourceUrl(record, /municipal advisor|bond counsel|disclosure counsel|underwriter|rfp/)),
    knownAdvisors: prefer(existing?.knownAdvisors, existing?.advisorsCounsel),
    lastCheckedDate: today(),
    profileStatus: existing?.profileStatus || 'Draft',
    sourceTrail: [...trailByKey.values()].slice(0, 50),
    updateHistory: [
      updateHistoryEntry(record, reason),
      ...(existing?.updateHistory ?? []),
    ].slice(0, 20),
    notes: prefer(existing?.notes, record?.summary),
  };

  profile.evidenceCoverageScore = coverageScore(profile);
  return profile;
}

export function profilePromptContext(profile: IssuerProfile | null | undefined) {
  if (!profile) return '';

  return [
    `Issuer profile database context for ${profile.issuer}:`,
    `Legal name: ${profile.legalName || 'Not found'}`,
    `Sector: ${profile.sector || 'Not found'}`,
    `State: ${profile.state || 'Not found'}`,
    `Ratings: ${profile.ratings || profile.rating || 'Not found'}`,
    `Outstanding debt: ${profile.outstandingDebt || 'Not found'}`,
    `Latest ACFR: ${profile.latestACFR || 'Not found'}`,
    `Latest OS/POS: ${profile.latestOS || 'Not found'}`,
    `Latest EMMA filing: ${profile.latestEmmaFiling || profile.emmaLink || 'Not found'}`,
    `Latest rating report: ${profile.latestRatingReport || 'Not found'}`,
    `Board page: ${profile.boardPage || 'Not found'}`,
    `Known advisors / counsel: ${profile.advisorsCounsel || profile.knownAdvisors || 'Not found'}`,
    `Last checked date: ${profile.lastCheckedDate || 'Not found'}`,
    `Coverage score: ${profile.evidenceCoverageScore ?? 'Not found'}`,
    profile.notes ? `Analyst notes: ${profile.notes}` : null,
    'Use this only as starting context. Verify whether newer sources exist before relying on the profile.',
  ].filter(Boolean).join('\n');
}

export function missingProfileFields(profile: IssuerProfile | null | undefined) {
  if (!profile) return ['No issuer profile saved yet.'];

  return [
    ['Legal name', profile.legalName],
    ['Sector', profile.sector],
    ['State', profile.state],
    ['Ratings', profile.ratings ?? profile.rating],
    ['Outstanding debt', profile.outstandingDebt],
    ['Latest ACFR', profile.latestACFR],
    ['Latest OS/POS', profile.latestOS],
    ['Latest EMMA filing', profile.latestEmmaFiling ?? profile.emmaLink],
    ['Board page', profile.boardPage],
    ['Known advisors / counsel', profile.advisorsCounsel ?? profile.knownAdvisors],
  ]
    .filter(([, value]) => !normalizedText(value))
    .map(([label]) => label as string);
}

export function profileHealthLabel(profile: IssuerProfile | null | undefined) {
  const score = profile?.evidenceCoverageScore ?? 0;
  if (score >= 80) return 'Ready for Review';
  if (score >= 50) return 'Needs Sources';
  return 'Draft';
}
