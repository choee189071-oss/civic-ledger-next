import { NextResponse } from 'next/server';
import {
  buildRecencyScope,
  noRecentInfoGuide,
  recencyPrompt,
  recencySearchSuffix,
  sourceRecencyLabel,
  type RecencyScope,
} from '../../../lib/research-recency';

export const runtime = 'nodejs';

type SonarSearchResult = {
  title?: string;
  url?: string;
  date?: string;
  last_updated?: string;
  snippet?: string;
  source?: string;
  query?: string;
  sourceTier?: string;
  sourceTierRank?: number;
  sourceTierName?: string;
  documentType?: string;
  status?: string;
  notes?: string;
  recencyWindow?: string;
};

type SonarResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[] | null;
  search_results?: SonarSearchResult[] | null;
  related_questions?: string[] | null;
  usage?: Record<string, unknown>;
};

const SONAR_URL = 'https://api.perplexity.ai/v1/sonar';
const SEARCH_URL = 'https://api.perplexity.ai/search';

const PROMPT_MODE_OPTIONS = {
  'general-overview': {
    label: 'General Overview',
    description: 'Basic entity summary and official context.',
  },
  'issuer-credit-profile': {
    label: 'Issuer / Credit Profile',
    description: 'Municipal issuer and utility credit framing.',
  },
  'document-discovery': {
    label: 'Document Discovery',
    description: 'ACFR, official statements, ratings, disclosures, budgets, and investor materials.',
  },
  'debt-bond-research': {
    label: 'Debt / Bond Research',
    description: 'Debt structure, revenue bonds, covenants, maturities, ratings, and official statements.',
  },
  'financial-performance': {
    label: 'Financial Performance',
    description: 'Revenues, expenses, liquidity, reserves, capital plan, coverage, and audited financials.',
  },
  'risk-news-monitoring': {
    label: 'Risk / News Monitoring',
    description: 'Recent developments, litigation, rate actions, regulation, and infrastructure risks.',
  },
  'peer-comparison': {
    label: 'Peer Comparison',
    description: 'Peer issuers, relative credit metrics, and comparable municipal utility context.',
  },
  'custom-prompt': {
    label: 'Custom Prompt',
    description: 'User-defined public finance research angle.',
  },
} as const;

type PromptMode = keyof typeof PROMPT_MODE_OPTIONS;

const FINANCE_FOCUSED_MODES = new Set<PromptMode>([
  'issuer-credit-profile',
  'document-discovery',
  'debt-bond-research',
  'financial-performance',
  'risk-news-monitoring',
  'peer-comparison',
  'custom-prompt',
]);

const DEFAULT_WORKFLOW_OPTIONS = {
  includeLiveSearch: true,
  includePerplexity: true,
  includeOpenaiSynthesis: true,
  includeDocumentInventory: true,
  includeSourceTiers: true,
  includeCoverageDashboard: true,
  includeMissingData: true,
  includeExport: true,
};

function sourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function sourceFacts(searchResults: SonarSearchResult[]) {
  return searchResults
    .filter((result) => result.title || result.snippet || result.url)
    .slice(0, 5)
    .map((result) => {
      const label = result.title || (result.url ? sourceLabel(result.url) : 'Source');
      const date = result.date || result.last_updated;
      const snippet = result.snippet ? ` — ${result.snippet}` : '';
      const tier = result.sourceTier ? `${result.sourceTier}: ` : '';
      const recency = result.recencyWindow ? ` [${result.recencyWindow}]` : '';
      return `${tier}${label}${date ? ` (${date})` : ''}${recency}${snippet}`;
    });
}

function mergeSearchResults(...resultGroups: SonarSearchResult[][]) {
  const seen = new Set<string>();
  const merged: SonarSearchResult[] = [];

  for (const result of resultGroups.flat()) {
    const key = (result.url || result.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(result);
  }

  return merged.slice(0, 20);
}

function normalizePromptMode(value: unknown): PromptMode {
  const promptMode = String(value ?? '').trim();

  if (promptMode in PROMPT_MODE_OPTIONS) {
    return promptMode as PromptMode;
  }

  return 'issuer-credit-profile';
}

function normalizeWorkflowOptions(value: any) {
  return {
    ...DEFAULT_WORKFLOW_OPTIONS,
    ...(value && typeof value === 'object' ? value : {}),
  };
}

function uniqueQueries(queries: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const query of queries) {
    const cleaned = query.replace(/\s+/g, ' ').trim();
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(cleaned);
  }

  return next.slice(0, 6);
}

function withRecency(query: string, scope: RecencyScope) {
  return `${query} ${recencySearchSuffix(scope)}`;
}

function buildSearchQueries(issuer: string, promptMode: PromptMode, customAngle: string, recencyScope: RecencyScope) {
  if (/CCD_GENERAL_UPDATE|ALL_CCD_ISSUERS/i.test(customAngle)) {
    return uniqueQueries([
      'California community college district rating action outlook recent developments',
      'California community college district bond issuance official statement',
      'California community college district continuing disclosure EMMA MSRB',
      'California community college district board agenda budget enrollment recent developments',
      'California CCD capital projects facilities bond measure',
      'California community college district accreditation governance litigation labor',
    ].map((query) => withRecency(query, recencyScope)));
  }

  const custom = customAngle ? `${issuer} ${customAngle}` : issuer;

  const strategies: Record<PromptMode, string[]> = {
    'general-overview': [
      `${issuer} official website`,
      `${issuer} overview`,
      `${issuer} services`,
    ],
    'issuer-credit-profile': [
      `${issuer} official statement revenue bonds PDF`,
      `${issuer} annual comprehensive financial report ACFR PDF`,
      `${issuer} audited financial statements PDF`,
      `${issuer} rating report Moody's S&P Fitch`,
      `${issuer} continuing disclosure EMMA MSRB`,
      `${issuer} investor relations debt`,
    ],
    'document-discovery': [
      `${issuer} annual comprehensive financial report ACFR PDF`,
      `${issuer} official statement revenue bonds PDF`,
      `${issuer} preliminary official statement PDF`,
      `${issuer} rating report Moody's S&P Fitch Kroll`,
      `${issuer} continuing disclosure EMMA MSRB`,
      `${issuer} investor relations budget capital improvement plan PDF`,
    ],
    'debt-bond-research': [
      `${issuer} official statement revenue bonds`,
      `${issuer} power system revenue bonds official statement`,
      `${issuer} water system revenue bonds official statement`,
      `${issuer} debt service coverage`,
      `${issuer} rate covenant additional bonds test`,
      `${issuer} EMMA MSRB`,
    ],
    'financial-performance': [
      `${issuer} ACFR financial statements`,
      `${issuer} annual financial report revenue expenses liquidity`,
      `${issuer} operating revenues debt service coverage`,
      `${issuer} capital improvement plan`,
      `${issuer} budget financial plan`,
      `${issuer} audited financial statements PDF`,
    ],
    'risk-news-monitoring': [
      `${issuer} rating action`,
      `${issuer} litigation`,
      `${issuer} rate increase`,
      `${issuer} wildfire risk`,
      `${issuer} regulatory risk`,
      `${issuer} recent developments`,
    ],
    'peer-comparison': [
      `${issuer} peer comparison municipal utility`,
      `${issuer} compared with SMUD NYPA LADWP TWDB`,
      `${issuer} rating report peer comparison`,
      `${issuer} public power credit metrics`,
      `${issuer} municipal utility debt service coverage peers`,
      `${issuer} revenue bond rating medians`,
    ],
    'custom-prompt': [
      custom,
      `${issuer} official statement rating ACFR`,
      `${issuer} investor relations debt`,
      `${issuer} continuing disclosure EMMA MSRB`,
      `${issuer} audited financial statements PDF`,
      `${issuer} rating report Moody's S&P Fitch`,
    ],
  };

  return uniqueQueries(strategies[promptMode].map((query) => withRecency(query, recencyScope)));
}

function documentTypeFor(result: SonarSearchResult) {
  const text = `${result.title ?? ''} ${result.snippet ?? ''} ${result.url ?? ''}`.toLowerCase();

  if (/annual comprehensive financial report|\bacfr\b|audited financial|financial statements/.test(text)) {
    return 'ACFR / Audited Financial Statements';
  }

  if (/preliminary official statement|\bpos\b/.test(text)) {
    return 'Preliminary Official Statement';
  }

  if (/official statement/.test(text)) {
    return 'Official Statement';
  }

  if (/emma|msrb|continuing disclosure|annual disclosure/.test(text)) {
    return 'Continuing Disclosure';
  }

  if (/rating report|rating action|moody|s&p|standard & poor|fitch|kroll|kb ra|bond rating/.test(text)) {
    return 'Rating Report';
  }

  if (/investor relation|bondholder|bond document/.test(text)) {
    return 'Investor Relations';
  }

  if (/budget|capital improvement|\bcip\b|financial plan/.test(text)) {
    return /capital improvement|\bcip\b/.test(text) ? 'Capital Improvement Plan' : 'Budget';
  }

  if (/rate study|rate action|rate increase|rate ordinance/.test(text)) {
    return 'Rate Study';
  }

  if (/litigation|wildfire|regulatory|risk|lawsuit|court/.test(text)) {
    return 'Legal / Litigation';
  }

  if (/news|press|article|youtube|blog/.test(text)) {
    return 'News / Media';
  }

  if (/technical|study|nrel|white paper|industry report/.test(text)) {
    return 'Technical Study';
  }

  if (/board|city clerk|clerk filing|ordinance|resolution/.test(text)) {
    return 'Board / City Clerk Filing';
  }

  return 'Other';
}

function classifySourceTier(result: SonarSearchResult) {
  const text = `${result.title ?? ''} ${result.snippet ?? ''} ${result.url ?? ''}`.toLowerCase();
  const docType = documentTypeFor(result);

  if (
    /annual comprehensive financial report|\bacfr\b|audited financial|official statement|preliminary official statement|\bpos\b|emma|msrb|continuing disclosure|rating report|rating action|moody|s&p|standard & poor|fitch|kroll|kb ra|bondholder|investor relation|revenue bond/.test(text)
  ) {
    return {
      rank: 1,
      tier: 'Tier 1',
      name: 'Core public finance evidence',
      documentType: docType,
      notes: 'Prioritized for finance conclusions.',
    };
  }

  if (
    /\.gov\b|ladwp\.com|official|issuer|board report|budget|capital improvement|\bcip\b|rate study|regulatory filing|financial plan|treasurer\.ca\.gov|ebudget\.ca\.gov/.test(text)
  ) {
    return {
      rank: 2,
      tier: 'Tier 2',
      name: 'Official issuer / government source',
      documentType: docType,
      notes: 'Useful official context; verify credit conclusions against core finance documents.',
    };
  }

  if (/nrel|technical|study|agency|court|commission|regulatory|industry report|white paper|california energy/.test(text)) {
    return {
      rank: 3,
      tier: 'Tier 3',
      name: 'Analytical / technical source',
      documentType: docType,
      notes: 'Use for technical context or risk monitoring.',
    };
  }

  if (/youtube|blog|news|press|article|daily|times|reuters|bondbuyer|linkedin|wikipedia/.test(text)) {
    return {
      rank: 4,
      tier: 'Tier 4',
      name: 'Media / low-priority source',
      documentType: docType,
      notes: 'Use only when higher-quality evidence is unavailable.',
    };
  }

  return {
    rank: 3,
    tier: 'Tier 3',
    name: 'Analytical / technical source',
    documentType: docType,
    notes: 'Review manually before using for a credit conclusion.',
  };
}

function classifyResults(results: SonarSearchResult[], financeFocused: boolean, recencyScope: RecencyScope) {
  const classified = results.map((result) => {
    const tier = classifySourceTier(result);
    const recencyWindow = sourceRecencyLabel(result, recencyScope);

    return {
      ...result,
      sourceTier: tier.tier,
      sourceTierRank: tier.rank,
      sourceTierName: tier.name,
      documentType: tier.documentType,
      status: 'Candidate',
      recencyWindow,
      notes: `${tier.notes} Recency: ${recencyWindow}.`,
    };
  });

  if (!financeFocused) {
    return classified;
  }

  return classified.sort((a, b) => {
    const tierDelta = (a.sourceTierRank ?? 4) - (b.sourceTierRank ?? 4);
    if (tierDelta !== 0) return tierDelta;
    return String(b.date || b.last_updated || '').localeCompare(String(a.date || a.last_updated || ''));
  });
}

function hasCoreFinanceDocuments(results: SonarSearchResult[]) {
  return results.some((result) => result.sourceTierRank === 1);
}

function coverageStatus(results: SonarSearchResult[], pattern: RegExp) {
  const matches = results.filter((result) =>
    pattern.test(`${result.title ?? ''} ${result.snippet ?? ''} ${result.url ?? ''}`.toLowerCase())
  );

  if (matches.some((result) => (result.sourceTierRank ?? 4) <= 1)) {
    return { status: 'Found', confidence: 'High' };
  }

  if (matches.some((result) => (result.sourceTierRank ?? 4) <= 2)) {
    return { status: 'Found', confidence: 'Medium' };
  }

  return { status: 'Missing', confidence: 'Low' };
}

function buildCoverageDashboard(results: SonarSearchResult[]) {
  return [
    ['Audited financials', /annual comprehensive financial report|\bacfr\b|audited financial|financial statements/],
    ['Debt documents', /official statement|preliminary official statement|\bpos\b|revenue bond|debt|bondholder/],
    ['Ratings', /rating report|rating action|moody|s&p|standard & poor|fitch|kroll|kb ra/],
    ['Continuing disclosure', /emma|msrb|continuing disclosure|annual disclosure/],
    ['Recent risk events', /litigation|wildfire|regulatory|rate increase|recent developments|risk/],
  ].map(([area, pattern]) => ({
    area,
    ...coverageStatus(results, pattern as RegExp),
  }));
}

function buildDocumentInventory(results: SonarSearchResult[]) {
  return results
    .filter((result) => (result.sourceTierRank ?? 4) <= 2)
    .slice(0, 10)
    .map((result) => ({
      document: result.title || (result.url ? sourceLabel(result.url) : 'Untitled source'),
      type: result.documentType || 'General source',
      sourceTier: `${result.sourceTier}: ${result.sourceTierName}`,
      date: result.date || result.last_updated || 'Unknown',
      source: result.url ? sourceLabel(result.url) : result.source || 'Web',
      status: result.status || 'Candidate',
      recencyWindow: result.recencyWindow || 'Undated source',
      notes: result.notes || '',
      url: result.url,
    }));
}

function sourceConfidence(result: SonarSearchResult) {
  if ((result.sourceTierRank ?? 4) <= 1) return 'high';
  if ((result.sourceTierRank ?? 4) <= 2) return 'medium';
  return 'low';
}

function normalizeCoverage(value: { status: string; confidence: string }) {
  return {
    status: value.status.toLowerCase(),
    confidence: value.confidence.toLowerCase(),
  };
}

function buildCoverageDashboardObject(results: SonarSearchResult[]) {
  return {
    audited_financials: normalizeCoverage(
      coverageStatus(results, /annual comprehensive financial report|\bacfr\b|audited financial|financial statements/)
    ),
    official_statement: normalizeCoverage(
      coverageStatus(results, /official statement|preliminary official statement|\bpos\b/)
    ),
    ratings: normalizeCoverage(
      coverageStatus(results, /rating report|rating action|moody|s&p|standard & poor|fitch|kroll|kb ra/)
    ),
    continuing_disclosure: normalizeCoverage(
      coverageStatus(results, /emma|msrb|continuing disclosure|annual disclosure/)
    ),
    recent_risk_events: normalizeCoverage(
      coverageStatus(results, /litigation|wildfire|regulatory|rate increase|recent developments|risk/)
    ),
  };
}

function buildRawEvidenceNotes(results: SonarSearchResult[]) {
  return results
    .filter((result) => result.snippet || result.title)
    .slice(0, 12)
    .map((result) => ({
      claim: result.snippet || result.title || 'Source candidate found.',
      source_title: result.title || (result.url ? sourceLabel(result.url) : 'Untitled source'),
      source_url: result.url,
      source_tier: result.sourceTier || 'Unclassified',
      document_type: result.documentType || 'Other',
      confidence: sourceConfidence(result),
    }));
}

function buildMissingItems(coverage: Record<string, { status: string; confidence: string }>) {
  const labels: Record<string, string> = {
    audited_financials: 'Audited financial statements / ACFR',
    official_statement: 'Latest official statement or POS',
    ratings: "Current rating reports or rating action pages from Moody's, S&P, Fitch, or KBRA",
    continuing_disclosure: 'Latest EMMA / MSRB annual continuing disclosure filing',
    recent_risk_events: 'Recent risk event scan and monitoring update',
  };

  return Object.entries(coverage)
    .filter(([, value]) => value.status !== 'found')
    .map(([key]) => labels[key] || key);
}

function buildEvidencePackage({
  issuer,
  modeLabel,
  outputType,
  timestamp,
  recencyScope,
  searchQueries,
  searchResults,
}: {
  issuer: string;
  modeLabel: string;
  outputType: string;
  timestamp: string;
  recencyScope: RecencyScope;
  searchQueries: string[];
  searchResults: SonarSearchResult[];
}) {
  const coverage = buildCoverageDashboardObject(searchResults);

  return {
    issuer,
    research_mode: modeLabel,
    output_type: outputType,
    search_timestamp: timestamp,
    recency_policy: {
      as_of_date: recencyScope.asOfDate,
      preferred_window: `${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}`,
      fallback_window: `${recencyScope.fallbackStartDate} to ${recencyScope.asOfDate}`,
      rule: 'Prefer last 3 months; expand to last 6 months only when no credible 3-month evidence is found; label older material as background.',
    },
    search_queries_used: searchQueries,
    document_inventory: buildDocumentInventory(searchResults).map((item) => ({
      title: item.document,
      document_type: item.type,
      source_tier: item.sourceTier,
      source_url: item.url,
      date: item.date,
      status: item.status.toLowerCase(),
      confidence: item.sourceTier.startsWith('Tier 1') ? 'high' : 'medium',
      recency_window: item.recencyWindow,
      notes: item.notes,
    })),
    coverage_dashboard: coverage,
    raw_evidence_notes: buildRawEvidenceNotes(searchResults),
    missing_items: buildMissingItems(coverage),
  };
}

function candidateSourceList(results: SonarSearchResult[]) {
  return results.slice(0, 14).map((result, index) => {
    const label = result.title || (result.url ? sourceLabel(result.url) : 'Untitled source');
    const date = result.date || result.last_updated || 'No date';
    const snippet = result.snippet ? ` Snippet: ${result.snippet}` : '';
    const recency = result.recencyWindow || 'Undated source';
    return `${index + 1}. [${result.sourceTier} | ${result.documentType} | ${recency} | ${date}] ${label}. URL: ${result.url ?? 'No URL'}.${snippet}`;
  }).join('\n');
}

function modeAnswerInstructions(promptMode: PromptMode, financeFocused: boolean, recencyScope: RecencyScope) {
  if (!financeFocused) {
    return [
      'Format the answer as a short research memo with: Current answer, Evidence, Gaps, Next step.',
      `Use the preferred 3-month window (${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}) first, then the 6-month fallback (${recencyScope.fallbackStartDate} to ${recencyScope.asOfDate}) only if needed.`,
      noRecentInfoGuide(),
    ].join('\n');
  }

  const modeLabel = PROMPT_MODE_OPTIONS[promptMode].label;

  return [
    'Use this exact finance-focused structure:',
    '1. Recency Discipline',
    `- Preferred window: ${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}.`,
    `- Fallback window: ${recencyScope.fallbackStartDate} to ${recencyScope.asOfDate}.`,
    '- Label each development as Preferred 3-month evidence, 6-month fallback evidence, Older context only, or Undated source.',
    '- If no current item is found, classify the reason using: No recent change found, Stale source only, Insufficient public evidence, or Needs manual verification.',
    '',
    '2. Research Mode',
    `- Selected mode: ${modeLabel}`,
    '- Search provider: Perplexity Sonar + Perplexity Search API',
    '- Timestamp:',
    '- Search scope:',
    '',
    '3. Issuer Identification',
    '- Legal name:',
    '- Sector:',
    '- State:',
    '- Systems / enterprise:',
    '- Revenue pledge, if available:',
    '',
    '4. Document Discovery Summary',
    '- ACFR:',
    '- Official Statement:',
    '- Rating Report:',
    '- Continuing Disclosure:',
    '- Budget / CIP:',
    '- Investor Relations:',
    '',
    '5. Document Inventory',
    '| Document | Type | Source Tier | Date | Recency | Source | Status | Notes |',
    '|---|---|---|---|---|---|---|---|',
    '',
    '6. Coverage Dashboard',
    '| Evidence Area | Status | Confidence |',
    '|---|---|---|',
    '| Audited financials | Found / Missing | High / Medium / Low |',
    '| Debt documents | Found / Missing | High / Medium / Low |',
    '| Ratings | Found / Missing | High / Medium / Low |',
    '| Continuing disclosure | Found / Missing | High / Medium / Low |',
    '| Recent risk events | Found / Missing | High / Medium / Low |',
    '',
    '7. Working Conclusion',
    'Only provide conclusions supported by Tier 1 or Tier 2 sources.',
    '',
    '8. Key Credit Considerations',
    '- Strengths:',
    '- Risks:',
    '- Recent developments:',
    '- Financial metrics:',
    '- Debt / covenant considerations:',
    '',
    '9. Missing Data / Limits',
    'Explicitly state what cannot be concluded due to missing documents.',
    noRecentInfoGuide(),
    '',
    '10. Next Search Queries',
    'List exact follow-up queries to improve evidence coverage.',
  ].join('\n');
}

function researchSummary(
  issuer: string,
  modeLabel: string,
  financeFocused: boolean,
  coreFinanceDocumentsFound: boolean,
  searchResults: SonarSearchResult[]
) {
  if (!financeFocused) {
    return `${modeLabel} research for ${issuer} with ${searchResults.length} live evidence candidates.`;
  }

  const coreStatus = coreFinanceDocumentsFound ? 'Core finance documents found' : 'Core finance documents not found';
  const tierOneCount = searchResults.filter((result) => result.sourceTierRank === 1).length;

  return `${modeLabel} for ${issuer}: ${coreStatus}; ${tierOneCount} Tier 1 evidence candidates and ${searchResults.length} total live sources.`;
}

async function searchPerplexity(apiKey: string, query: string) {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      search_context_size: 'medium',
    }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return [];
  }

  return ((payload.results ?? []) as SonarSearchResult[]).map((result) => ({
    ...result,
    query,
  }));
}

function apiErrorMessage(payload: any, status: number) {
  if (payload?.error?.message) {
    return payload.error.message;
  }

  if (payload?.message) {
    return payload.message;
  }

  if (Array.isArray(payload?.detail)) {
    return payload.detail
      .map((item: any) => {
        const path = Array.isArray(item.loc) ? item.loc.join(' -> ') : 'request';
        return `${path}: ${item.msg ?? 'Invalid value'}`;
      })
      .join('; ');
  }

  if (typeof payload?.detail === 'string') {
    return payload.detail;
  }

  return `Perplexity API error: ${status}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.PUBFIN_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'PUBFIN_API_KEY is not configured. Add it in Vercel Project Settings > Environment Variables.',
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const query = String(body.query ?? '').trim();
  const topic = String(body.topic ?? 'all');
  const source = String(body.source ?? 'all');
  const promptMode = normalizePromptMode(body.promptMode);
  const customAngle = String(body.customAngle ?? '').trim();
  const outputType = String(body.outputType ?? 'credit-memo').trim();
  const workflowOptions = normalizeWorkflowOptions(body.workflowOptions);
  const mode = PROMPT_MODE_OPTIONS[promptMode];
  const financeFocused = FINANCE_FOCUSED_MODES.has(promptMode);
  const timestamp = new Date().toISOString();
  const recencyScope = buildRecencyScope(new Date(timestamp));

  if (!query) {
    return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
  }

  const model = process.env.PUBFIN_MODEL || 'sonar-pro';
  const searchQueries = buildSearchQueries(query, promptMode, customAngle, recencyScope);
  const searchSettled = workflowOptions.includeLiveSearch && workflowOptions.includePerplexity
    ? await Promise.allSettled(
      searchQueries.map((searchQuery) => searchPerplexity(apiKey, searchQuery))
    )
    : [];
  const searchApiResults = searchSettled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );
  const classifiedSearchApiResults = classifyResults(
    mergeSearchResults(searchApiResults),
    financeFocused,
    recencyScope
  );
  const coreFinanceDocumentsFound = hasCoreFinanceDocuments(classifiedSearchApiResults);

  const prompt = [
    'You are Civic Ledger, a public-finance research assistant.',
    'Use current public web sources to answer questions about municipal finance, public issuers, budgets, audited financial statements, official statements, debt issuance, ratings, and disclosure.',
    recencyPrompt(recencyScope),
    noRecentInfoGuide(),
    'Prioritize municipal finance evidence over general encyclopedia, media, or policy summaries.',
    'Source quality tiers:',
    'Tier 1 = ACFR/audited financial statements, official statements/POS, EMMA/MSRB filings, continuing disclosures, rating agency reports/actions, bond documents, investor relations debt pages.',
    'Tier 2 = official issuer/government sources, board reports, budget documents, CIP, rate studies, regulatory filings, government reports.',
    'Tier 3 = analytical or technical sources such as NREL, state agencies, court opinions, industry reports, technical studies.',
    'Tier 4 = media, YouTube, blogs, secondary summaries. Avoid Tier 4 for finance-focused conclusions unless no better source exists.',
    financeFocused
      ? 'For finance-focused modes, do not make strong credit conclusions unless at least one Tier 1 core finance document is found. If missing, say: "Core finance documents were not found in this search run. The following is a preliminary issuer overview, not a credit conclusion."'
      : 'For general overview mode, still identify official sources and avoid unsupported claims.',
    'Answer in the same language as the user.',
    'Be concise, source-grounded, and explicit about dates.',
    'If current evidence is insufficient, say what is missing instead of guessing.',
    modeAnswerInstructions(promptMode, financeFocused, recencyScope),
  ].join('\n');

  const userContent = [
    `Question: ${query}`,
    `Research prompt mode: ${mode.label}`,
    `Mode description: ${mode.description}`,
    `Requested output type: ${outputType}`,
    customAngle ? `Custom research angle: ${customAngle}` : null,
    `Preferred topic filter: ${topic}`,
    `Preferred source filter: ${source}`,
    `Timestamp: ${timestamp}`,
    `Preferred recency window: ${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}`,
    `Fallback recency window: ${recencyScope.fallbackStartDate} to ${recencyScope.asOfDate}`,
    `Search scope: ${searchQueries.join(' | ')}`,
    `Core finance document found by Search API: ${coreFinanceDocumentsFound ? 'yes' : 'no'}`,
    '',
    'Candidate sources from the Search API, already ranked by source quality:',
    candidateSourceList(classifiedSearchApiResults) || 'No candidate sources returned by the Search API.',
    '',
    'Find the freshest credible public sources and include source names, dates, and links. Use Tier 1 and Tier 2 sources for finance conclusions.',
    'Do not call older evidence "recent"; classify it as older context and explain whether it is still structurally relevant.',
  ].filter(Boolean).join('\n');

  const res = await fetch(SONAR_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: financeFocused ? 2600 : 1600,
      temperature: 0.2,
      web_search_options: {
        search_mode: 'web',
        return_related_questions: true,
        enable_search_classifier: false,
      },
    }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      {
        error: apiErrorMessage(payload, res.status),
      },
      { status: res.status }
    );
  }

  const sonar = payload as SonarResponse;
  const content = sonar.choices?.[0]?.message?.content?.trim() || 'No answer returned.';
  const searchResults = classifyResults(mergeSearchResults(
    sonar.search_results ?? [],
    classifiedSearchApiResults
  ), financeFocused, recencyScope);
  const finalCoreFinanceDocumentsFound = hasCoreFinanceDocuments(searchResults);
  const citations = mergeSearchResults(
    (sonar.citations ?? []).map((url) => ({ url })),
    searchResults
  ).map((result) => result.url).filter(Boolean) as string[];
  const facts = [
    `${mode.label} mode`,
    `Output type requested: ${outputType}`,
    `Preferred recency window: ${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}; fallback: ${recencyScope.fallbackStartDate} to ${recencyScope.asOfDate}.`,
    financeFocused
      ? finalCoreFinanceDocumentsFound
        ? 'Core finance documents were found in this search run.'
        : 'Core finance documents were not found in this search run; treat the memo as preliminary.'
      : 'General research mode.',
    ...sourceFacts(searchResults),
  ];
  const evidencePackage = buildEvidencePackage({
    issuer: query,
    modeLabel: mode.label,
    outputType,
    timestamp,
    recencyScope,
    searchQueries,
    searchResults,
  });

  return NextResponse.json({
    record: {
      id: `research-${Date.now()}`,
      kind: 'research',
      title: query,
      topic: mode.label,
      source: 'Perplexity Sonar',
      score: 100,
      summary: researchSummary(query, mode.label, financeFocused, finalCoreFinanceDocumentsFound, searchResults),
      snippet: content,
      facts: facts.length > 0 ? facts : ['Perplexity returned an answer, but no source snippets were included.'],
      citations,
      searchResults,
      workflowInput: {
        issuer: query,
        research_mode: mode.label,
        custom_prompt: customAngle || null,
        output_type: outputType,
        include_live_search: workflowOptions.includeLiveSearch,
        include_perplexity: workflowOptions.includePerplexity,
        include_openai_synthesis: workflowOptions.includeOpenaiSynthesis,
        include_document_inventory: workflowOptions.includeDocumentInventory,
        include_source_tiers: workflowOptions.includeSourceTiers,
        include_coverage_dashboard: workflowOptions.includeCoverageDashboard,
        include_missing_data: workflowOptions.includeMissingData,
        include_export: workflowOptions.includeExport,
        recency_policy: {
          preferred_window: `${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}`,
          fallback_window: `${recencyScope.fallbackStartDate} to ${recencyScope.asOfDate}`,
        },
      },
      workflowOptions,
      outputType,
      evidencePackage,
      promptMode,
      researchModeLabel: mode.label,
      customAngle,
      financeFocused,
      coreFinanceDocumentsFound: finalCoreFinanceDocumentsFound,
      documentInventory: buildDocumentInventory(searchResults),
      coverageDashboard: buildCoverageDashboard(searchResults),
      searchQueries,
      relatedQuestions: sonar.related_questions ?? [],
      generatedAt: timestamp,
      recencyScope,
      model: sonar.model || model,
      usage: sonar.usage ?? null,
    },
  });
}
