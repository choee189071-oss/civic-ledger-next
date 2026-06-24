export type DiagnosticStatus = 'Success' | 'Failure';

export type DocumentDiagnosticItem = {
  key: string;
  label: string;
  required: boolean;
  status: 'found' | 'missing';
  sourceTitle?: string;
  sourceUrl?: string;
  date?: string;
  sourceTier?: string;
  reason: string;
  retryQuery: string;
};

export type DocumentDiagnostics = {
  coveragePercent: number;
  documentCount: number;
  missingDocuments: string[];
  documents: DocumentDiagnosticItem[];
};

export type RetrievalDiagnosticItem = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  reason: string;
  retryQuery: string;
};

export type RetrievalDiagnostics = {
  items: RetrievalDiagnosticItem[];
  successCount: number;
  failureCount: number;
};

export type FailureClassification = {
  title: string;
  reason: string;
  recommendation: string;
  severity: 'info' | 'warning' | 'error';
};

type SourceLike = Record<string, any>;

const REQUIRED_DOCUMENTS = [
  {
    key: 'acfr',
    label: 'ACFR',
    patterns: [/annual comprehensive financial report/i, /\bacfr\b/i, /audited financial/i, /financial statements/i],
    retry: (issuer: string) => `${issuer} ACFR audited financial statements PDF`,
    missingReason: 'Issuer-specific audited financial statements were not surfaced in this run.',
  },
  {
    key: 'official_statement',
    label: 'Official Statement',
    patterns: [/official statement/i, /preliminary official statement/i, /\bpos\b/i, /revenue bond/i],
    retry: (issuer: string) => `${issuer} official statement revenue bonds EMMA MSRB`,
    missingReason: 'No issuer-specific OS/POS or bond offering document was surfaced.',
  },
  {
    key: 'continuing_disclosure',
    label: 'Continuing Disclosure',
    patterns: [/continuing disclosure/i, /annual disclosure/i, /emma/i, /msrb/i, /event notice/i],
    retry: (issuer: string) => `${issuer} EMMA MSRB continuing disclosure annual report`,
    missingReason: 'No current EMMA/MSRB continuing disclosure item was surfaced.',
  },
  {
    key: 'investor_presentation',
    label: 'Investor Presentation',
    patterns: [/investor presentation/i, /investor relations/i, /bondholder presentation/i, /bondholder/i],
    retry: (issuer: string) => `${issuer} investor presentation investor relations bonds`,
    missingReason: 'No investor presentation or investor-relations deck was surfaced.',
  },
  {
    key: 'rating_report',
    label: 'Rating Report',
    patterns: [/rating report/i, /rating action/i, /moody/i, /s&p/i, /standard & poor/i, /fitch/i, /kbra/i, /kroll/i],
    retry: (issuer: string) => `${issuer} rating report Moody's S&P Fitch KBRA`,
    missingReason: 'No current rating report or rating action page was surfaced.',
  },
  {
    key: 'budget',
    label: 'Budget',
    patterns: [/budget/i, /adopted budget/i, /proposed budget/i, /financial plan/i],
    retry: (issuer: string) => `${issuer} budget adopted budget financial plan PDF`,
    missingReason: 'No current budget or financial plan was surfaced.',
  },
  {
    key: 'capital_improvement_plan',
    label: 'Capital Improvement Plan',
    patterns: [/capital improvement/i, /\bcip\b/i, /capital plan/i, /capital program/i],
    retry: (issuer: string) => `${issuer} capital improvement plan CIP PDF`,
    missingReason: 'No capital improvement plan or capital program document was surfaced.',
  },
];

function clean(value: any) {
  return String(value ?? '').trim();
}

function sourceTitle(source: SourceLike) {
  return clean(source.title || source.document || source.document_title || source.name || source.url || source.source_url);
}

function sourceUrl(source: SourceLike) {
  return clean(source.url || source.source_url);
}

function sourceDate(source: SourceLike) {
  return clean(
    source.publicationDate ||
    source.publication_date ||
    source.date ||
    source.last_updated ||
    source.emmaFilingDate ||
    source.emma_filing_date
  );
}

function sourceTier(source: SourceLike) {
  return clean(source.sourceTier || source.source_tier || source.tier);
}

function sourceType(source: SourceLike) {
  return clean(source.documentType || source.document_type || source.type);
}

function sourceText(source: SourceLike) {
  return [
    sourceTitle(source),
    sourceType(source),
    sourceUrl(source),
    source.snippet,
    source.notes,
    source.source,
  ].map(clean).join(' ');
}

function uniqueSources(sources: SourceLike[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = (sourceUrl(source) || sourceTitle(source)).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sourceCandidatesFromRecord(record: SourceLike | null | undefined) {
  const evidencePackage = record?.evidencePackage ?? {};
  const inventory = Array.isArray(evidencePackage.document_inventory)
    ? evidencePackage.document_inventory
    : [];

  return uniqueSources([
    ...inventory,
    ...(Array.isArray(record?.documentInventory) ? record.documentInventory : []),
    ...(Array.isArray(record?.searchResults) ? record.searchResults : []),
  ]);
}

export function buildDocumentDiagnostics(issuer: string, sources: SourceLike[]): DocumentDiagnostics {
  const unique = uniqueSources(sources);
  const documents = REQUIRED_DOCUMENTS.map((definition) => {
    const match = unique.find((source) =>
      definition.patterns.some((pattern) => pattern.test(sourceText(source)))
    );

    return {
      key: definition.key,
      label: definition.label,
      required: true,
      status: match ? 'found' as const : 'missing' as const,
      sourceTitle: match ? sourceTitle(match) : undefined,
      sourceUrl: match ? sourceUrl(match) : undefined,
      date: match ? sourceDate(match) : undefined,
      sourceTier: match ? sourceTier(match) : undefined,
      reason: match
        ? `Matched ${definition.label} evidence from ${sourceTitle(match) || 'a source candidate'}.`
        : definition.missingReason,
      retryQuery: definition.retry(issuer || 'issuer'),
    };
  });
  const foundCount = documents.filter((item) => item.status === 'found').length;

  return {
    coveragePercent: Math.round((foundCount / documents.length) * 100),
    documentCount: unique.length,
    missingDocuments: documents.filter((item) => item.status === 'missing').map((item) => item.label),
    documents,
  };
}

function hasMatch(sources: SourceLike[], patterns: RegExp[]) {
  return sources.some((source) => patterns.some((pattern) => pattern.test(sourceText(source))));
}

export function buildRetrievalDiagnostics({
  issuer,
  sources,
  searchQueries,
  cachedDocumentCount = 0,
  liveDocumentCount,
}: {
  issuer: string;
  sources: SourceLike[];
  searchQueries: string[];
  cachedDocumentCount?: number;
  liveDocumentCount?: number;
}): RetrievalDiagnostics {
  const unique = uniqueSources(sources);
  const liveCount = liveDocumentCount ?? unique.length;
  const targets = [
    {
      key: 'searching',
      label: 'Searching',
      ok: searchQueries.length > 0,
      success: `${searchQueries.length} search queries prepared and executed.`,
      failure: 'No search queries were prepared for this run.',
      retry: `${issuer} official statement ACFR rating report`,
    },
    {
      key: 'issuer_website',
      label: 'Issuer Website',
      ok: hasMatch(unique, [/official website/i, /\.gov/i, /investor relation/i, /issuer/i]),
      success: 'Issuer or official government source candidate surfaced.',
      failure: 'No issuer website or official government page surfaced.',
      retry: `${issuer} official website investor relations`,
    },
    {
      key: 'emma',
      label: 'EMMA',
      ok: hasMatch(unique, [/emma\.msrb\.org/i, /\bemma\b/i]),
      success: 'EMMA source candidate surfaced.',
      failure: 'No EMMA source candidate surfaced.',
      retry: `${issuer} site:emma.msrb.org official statement continuing disclosure`,
    },
    {
      key: 'msrb',
      label: 'MSRB',
      ok: hasMatch(unique, [/msrb\.org/i, /\bmsrb\b/i]),
      success: 'MSRB source candidate surfaced.',
      failure: 'No MSRB source candidate surfaced.',
      retry: `${issuer} MSRB continuing disclosure official statement`,
    },
    {
      key: 'investor_relations',
      label: 'Investor Relations',
      ok: hasMatch(unique, [/investor relation/i, /bondholder/i, /investor presentation/i]),
      success: 'Investor-relations or bondholder source candidate surfaced.',
      failure: 'No investor-relations or bondholder source surfaced.',
      retry: `${issuer} investor relations bonds debt`,
    },
    {
      key: 'rating_reports',
      label: 'Rating Reports',
      ok: hasMatch(unique, [/rating report/i, /rating action/i, /moody/i, /s&p/i, /fitch/i, /kbra/i, /kroll/i]),
      success: 'Rating report or rating action candidate surfaced.',
      failure: 'No rating report or rating action candidate surfaced.',
      retry: `${issuer} rating report Moody's S&P Fitch KBRA`,
    },
    {
      key: 'cached_documents',
      label: 'Cached Documents',
      ok: cachedDocumentCount > 0,
      success: `${cachedDocumentCount} cached/profile document candidates were available.`,
      failure: 'No cached issuer profile or parsed document was supplied for this run.',
      retry: `${issuer} saved issuer profile document cache`,
    },
    {
      key: 'live_documents',
      label: 'Live Documents',
      ok: liveCount > 0,
      success: `${liveCount} live document/source candidates surfaced.`,
      failure: 'No live source candidates surfaced.',
      retry: `${issuer} ACFR official statement continuing disclosure rating report`,
    },
  ];
  const items = targets.map((target) => ({
    key: target.key,
    label: target.label,
    status: target.ok ? 'Success' as const : 'Failure' as const,
    reason: target.ok ? target.success : target.failure,
    retryQuery: target.retry,
  }));

  return {
    items,
    successCount: items.filter((item) => item.status === 'Success').length,
    failureCount: items.filter((item) => item.status === 'Failure').length,
  };
}

export function classifyResearchFailure({
  documentDiagnostics,
  retrievalDiagnostics,
  apiError,
}: {
  documentDiagnostics?: DocumentDiagnostics | null;
  retrievalDiagnostics?: RetrievalDiagnostics | null;
  apiError?: string;
}): FailureClassification | null {
  if (apiError) {
    return {
      title: 'Research request could not complete.',
      reason: apiError,
      recommendation: 'Check the API configuration and retry. If the service is available, retry using a narrower issuer name or source filter.',
      severity: 'error',
    };
  }

  const missing = documentDiagnostics?.missingDocuments ?? [];

  if (missing.includes('ACFR')) {
    return {
      title: 'No issuer-specific audited financial statements found.',
      reason: 'Required document unavailable.',
      recommendation: 'Retry using broader search terms such as ACFR, audited financial statements, annual comprehensive financial report, and the issuer legal name.',
      severity: 'warning',
    };
  }

  if (missing.includes('Official Statement')) {
    return {
      title: 'No issuer-specific official statement found.',
      reason: 'Debt offering document unavailable in this run.',
      recommendation: 'Retry against EMMA/MSRB using the issuer legal name, CUSIP, bond type, and revenue pledge.',
      severity: 'warning',
    };
  }

  if ((retrievalDiagnostics?.failureCount ?? 0) >= 5) {
    return {
      title: 'Insufficient issuer-specific source coverage.',
      reason: 'Most retrieval targets did not surface usable public evidence.',
      recommendation: 'Retry using broader aliases, issuer legal name, EMMA/MSRB, investor relations, and rating-agency source filters.',
      severity: 'warning',
    };
  }

  if (missing.length > 0) {
    return {
      title: 'Research completed with missing core documents.',
      reason: `${missing.slice(0, 3).join(', ')} ${missing.length > 3 ? 'and other documents were' : 'was'} not found.`,
      recommendation: 'Use the retry queries in Document Inventory before treating the result as ready for review.',
      severity: 'info',
    };
  }

  return null;
}
