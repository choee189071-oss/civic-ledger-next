import { NextResponse } from 'next/server';
import {
  buildRecencyScope,
  noRecentInfoGuide,
  recencyPrompt,
  recencySearchSuffix,
  sourceRecencyLabel,
  type RecencyScope,
} from '../../../lib/research-recency';
import {
  getPerplexityApiKey,
  getPerplexityModel,
  perplexityApiKeyErrorMessage,
} from '../../../lib/server-env';
import {
  parseUniversalSearchQuery,
  universalSearchContextLines,
} from '../../../lib/universal-search';
import {
  buildDocumentDiagnostics,
  buildRetrievalDiagnostics,
  classifyResearchFailure,
  type DocumentDiagnostics,
  type FailureClassification,
  type RetrievalDiagnostics,
} from '../../../lib/research-diagnostics';
import { buildEvidenceEngine } from '../../../lib/evidence-engine';
import { buildResearchWorkspace } from '../../../lib/research-workspace';
import { buildIssuerDashboard } from '../../../lib/issuer-dashboard';
import { buildStructuredAnswer } from '../../../lib/ai-experience';
import { searchUsaSpending, type UsaSpendingAward } from '../../../lib/usaspending-api';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
  accessStatus?: string;
  recommendedAction?: string;
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
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const TIER1_DOMAINS = [
  'emma.msrb.org',
  'msrb.org',
  'ladwp.com',
  'smud.org',
  'moodys.com',
  'fitchratings.com',
  'krollbondratings.com',
  'kbra.com',
  'spglobal.com',
  'standardandpoors.com',
];

const CRITICAL_SOURCE_ACCESS_NOTES = [
  {
    domains: ['emma.msrb.org', 'msrb.org'],
    label: 'EMMA / MSRB',
    action: 'Open EMMA manually, download the OS/POS, annual report, continuing disclosure, or event notice, then upload it through Important Files for LlamaParse extraction.',
  },
  {
    domains: ['moodys.com', 'fitchratings.com', 'krollbondratings.com', 'kbra.com', 'spglobal.com', 'standardandpoors.com'],
    label: 'Rating agency',
    action: 'Verify the public rating action/report directly on the rating-agency page, then upload the PDF or paste the public link if available.',
  },
];

const TIER2_DOMAINS = [
  '.gov',
  'treasurer.ca.gov',
  'debtwatch.treasurer.ca.gov',
  'ebudget.ca.gov',
  'open.fiscal.ca.gov',
  'data.ca.gov',
  'bythenumbers.sco.ca.gov',
  'usaspending.gov',
  'dof.ca.gov',
  'cde.ca.gov',
];

const TIER4_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'linkedin.com',
  'wikipedia.org',
  'reddit.com',
  'facebook.com',
  'x.com',
  'twitter.com',
];

const TIER3_DOMAINS = [
  'bloomberg.com',
  'reuters.com',
  'bondbuyer.com',
];

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
  'time-series-analysis': {
    label: 'Time Series',
    description: 'Cross-year issuer metric trend analysis for DSC, reserves, liquidity, debt, revenue, expenses, and federal awards.',
  },
  'covenant-tracking': {
    label: 'Covenant Tracking',
    description: 'OS/POS covenant extraction and latest financial document compliance check.',
  },
  'watchlist-monitoring': {
    label: 'Watchlist / Monitoring',
    description: 'Recent EMMA filings, rating changes, board actions, RFPs, grants, and risk signals for saved issuers.',
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
  'time-series-analysis',
  'covenant-tracking',
  'watchlist-monitoring',
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

function sourceHost(url?: string) {
  if (!url) return '';

  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function hostMatches(host: string, domains: string[]) {
  return domains.some((domain) => {
    if (domain.startsWith('.')) return host.endsWith(domain);
    return host === domain || host.endsWith(`.${domain}`);
  });
}

function criticalSourceAccess(url?: string) {
  const host = sourceHost(url);
  if (!host) return null;

  const match = CRITICAL_SOURCE_ACCESS_NOTES.find((item) => hostMatches(host, item.domains));
  if (!match) return null;

  return {
    label: match.label,
    status: 'Manual Verification Required',
    action: match.action,
  };
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

  return merged.slice(0, 40);
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

function uniqueQueries(queries: string[], limit = 28) {
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

  return next.slice(0, limit);
}

function withRecency(query: string, scope: RecencyScope) {
  return `${query} ${recencySearchSuffix(scope)}`;
}

function officialSourceQueries(issuer: string, preferredSource: string, recencyScope: RecencyScope) {
  const allSourceQueries = [
    `${issuer} site:emma.msrb.org official statement continuing disclosure`,
    `${issuer} site:emma.msrb.org EMMA MSRB`,
    `${issuer} site:emma.msrb.org annual report event notice CUSIP`,
    `${issuer} site:debtwatch.treasurer.ca.gov debt issuance bonds`,
    `${issuer} site:bythenumbers.sco.ca.gov financial data`,
    `${issuer} site:treasurer.ca.gov/cdiac debt issuance`,
    `${issuer} site:usaspending.gov federal grant award`,
    `${issuer} investor relations bondholder debt audited financial statements`,
    `${issuer} board agenda packet minutes bond resolution RFP municipal advisor bond counsel`,
  ];
  const sourceSpecific: Record<string, string[]> = {
    'EMMA / MSRB': [
      `${issuer} site:emma.msrb.org official statement`,
      `${issuer} site:emma.msrb.org continuing disclosure`,
      `${issuer} site:emma.msrb.org CUSIP`,
    ],
    USAspending: [
      `${issuer} site:usaspending.gov federal awards grants`,
      `${issuer} site:usaspending.gov recipient profile`,
    ],
    DebtWatch: [
      `${issuer} site:debtwatch.treasurer.ca.gov debt issuance`,
      `${issuer} site:debtwatch.treasurer.ca.gov bonds`,
    ],
    'SCO ByTheNumbers': [
      `${issuer} site:bythenumbers.sco.ca.gov financial data`,
      `${issuer} site:bythenumbers.sco.ca.gov revenues expenditures`,
    ],
    CDIAC: [
      `${issuer} site:treasurer.ca.gov/cdiac debt issuance`,
      `${issuer} site:treasurer.ca.gov/cdiac annual debt transparency report`,
    ],
    'CKAN / Data.gov': [
      `${issuer} site:data.ca.gov CKAN datastore`,
      `${issuer} site:data.ca.gov fiscal spending revenue`,
    ],
    'Open FI$Cal': [
      `${issuer} site:open.fiscal.ca.gov spending expenditures`,
      `${issuer} site:data.ca.gov fiscal spending datastore`,
    ],
    'California Budget': [
      `${issuer} site:ebudget.ca.gov budget fiscal year`,
      `${issuer} site:dof.ca.gov budget financial plan`,
    ],
    'Debt Line': [
      `${issuer} site:treasurer.ca.gov/cdiac/debtline proposed sold debt issues`,
      `${issuer} site:treasurer.ca.gov/cdiac/debtline bond issuance`,
    ],
  };

  const selected = preferredSource === 'all'
    ? allSourceQueries
    : sourceSpecific[preferredSource] ?? [];

  return selected.map((query) => withRecency(query, recencyScope));
}

function facetValue(universalSearch: any, type: string) {
  return universalSearch?.facets?.find((facet: any) => facet.type === type)?.value || '';
}

function buildSectorMarketQueries(issuer: string, promptMode: PromptMode, customAngle: string, recencyScope: RecencyScope, universalSearch: any) {
  const sector = universalSearch?.primaryIssuer?.sector || facetValue(universalSearch, 'sector') || 'municipal public finance';
  const state = universalSearch?.primaryIssuer?.state || facetValue(universalSearch, 'state') || 'United States';
  const bondType = facetValue(universalSearch, 'bond_type') || universalSearch?.primaryIssuer?.bondTypes?.[0] || 'municipal bonds';
  const issuerKeywords = Array.isArray(universalSearch?.primaryIssuer?.keywords)
    ? universalSearch.primaryIssuer.keywords.slice(0, 4)
    : [];
  const issueContext = [sector, state, bondType, ...issuerKeywords].filter(Boolean).join(' ');
  const monitoringContext = customAngle || PROMPT_MODE_OPTIONS[promptMode].description;

  return uniqueQueries([
    `${state} ${sector} municipal credit outlook rating action`,
    `${state} ${sector} municipal bond issuance official statement`,
    `${state} ${sector} board agenda budget capital improvement plan rate action`,
    `${state} ${sector} public finance litigation labor pension OPEB cyber climate wildfire`,
    `${state} ${sector} adopted budget state funding grants capital program`,
    `${state} ${sector} CDIAC DebtWatch bond issuance`,
    `${state} ${sector} site:treasurer.ca.gov/cdiac debt issuance official statement`,
    `${state} ${sector} site:debtwatch.treasurer.ca.gov bonds debt issuance`,
    `${state} ${sector} site:bythenumbers.sco.ca.gov revenue expenditure financial data`,
    `${issueContext} Moody's S&P Fitch KBRA sector outlook rating methodology`,
    `${issueContext} comparable municipal bonds spread yield MMD recent trades`,
    `${issueContext} official statement continuing disclosure EMMA MSRB annual report`,
    `${issueContext} rate covenant debt service coverage additional bonds test`,
    `${issueContext} recent developments ${monitoringContext}`,
  ].map((query) => withRecency(query, recencyScope)), 18);
}

function buildCriticalSourceManualQueries(issuer: string, recencyScope: RecencyScope) {
  return uniqueQueries([
    `${issuer} EMMA MSRB official statement continuing disclosure annual report CUSIP`,
    `${issuer} EMMA event notice rating change tender default unscheduled draw`,
    `${issuer} Moody's rating action outlook`,
    `${issuer} S&P Global Ratings rating action outlook`,
    `${issuer} Fitch Ratings rating action outlook`,
    `${issuer} KBRA Kroll rating action outlook`,
  ].map((query) => withRecency(query, recencyScope)), 10);
}

function knownOfficialSeedResults(issuer: string): SonarSearchResult[] {
  const normalized = issuer.toLowerCase();

  if (!/\bladwp\b|los angeles department of water and power|los angeles department of water/.test(normalized)) {
    return [];
  }

  return [
    {
      title: 'LADWP Investor Relations',
      url: 'https://www.ladwp.com/doing-business-ladwp/investor-relations',
      source: 'Los Angeles Department of Water and Power',
      query: 'Known official issuer source registry',
      snippet: 'Official LADWP investor relations landing page for bondholder and issuer disclosure materials.',
      status: 'Candidate',
      notes: 'Known official issuer source added to improve recall. Use as a starting point; verify underlying documents before final credit conclusions.',
    },
    {
      title: 'LADWP Audited Financial Statements',
      url: 'https://www.ladwp.com/doing-business-ladwp/investor-relations/audited-financial-statements',
      source: 'Los Angeles Department of Water and Power',
      query: 'Known official issuer source registry',
      snippet: 'Official LADWP audited financial statements page. Use to locate current audited financial statements / ACFR source material.',
      status: 'Candidate',
      notes: 'Known official issuer source added to improve audited financial statement recall. Verify the latest statement date before final use.',
    },
    {
      title: 'LADWP Board Meetings and Agendas',
      url: 'https://www.ladwp.com/who-we-are/board-commissioners/board-meetings-and-agendas',
      source: 'Los Angeles Department of Water and Power',
      query: 'Known official issuer source registry',
      snippet: 'Official LADWP board meetings and agendas page. Use for board agenda, minutes, resolutions, RFP, and authorization monitoring.',
      status: 'Candidate',
      notes: 'Known official issuer source added to improve board-material recall. Review packets and agendas for issuer-specific actions.',
    },
  ];
}

function buildSearchQueries(issuer: string, promptMode: PromptMode, customAngle: string, recencyScope: RecencyScope, preferredSource = 'all') {
  if (/CCD_GENERAL_UPDATE|ALL_CCD_ISSUERS/i.test(customAngle)) {
    return uniqueQueries([
      ...officialSourceQueries(issuer, preferredSource, recencyScope),
      'California community college district rating action outlook recent developments',
      'California community college district bond issuance official statement',
      'California community college district continuing disclosure EMMA MSRB',
      'California community college district board agenda budget enrollment recent developments',
      'California CCD capital projects facilities bond measure',
      'California community college district accreditation governance litigation labor',
    ].map((query) => query.includes('published or updated since') ? query : withRecency(query, recencyScope)));
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
      `${issuer} single audit schedule of expenditures of federal awards SEFA PDF`,
      `${issuer} board agenda board packet bond resolution PDF`,
    ],
    'debt-bond-research': [
      `${issuer} official statement revenue bonds`,
      `${issuer} power system revenue bonds official statement`,
      `${issuer} water system revenue bonds official statement`,
      `${issuer} debt service schedule official statement`,
      `${issuer} debt service coverage`,
      `${issuer} rate covenant additional bonds test`,
      `${issuer} bond authorization resolution board agenda`,
      `${issuer} EMMA MSRB`,
    ],
    'financial-performance': [
      `${issuer} ACFR financial statements`,
      `${issuer} annual financial report revenue expenses liquidity`,
      `${issuer} operating revenues debt service coverage`,
      `${issuer} capital improvement plan`,
      `${issuer} budget financial plan`,
      `${issuer} rate study rate ordinance`,
      `${issuer} single audit federal awards SEFA`,
      `${issuer} audited financial statements PDF`,
    ],
    'risk-news-monitoring': [
      `${issuer} rating action`,
      `${issuer} litigation`,
      `${issuer} rate increase`,
      `${issuer} board agenda bond authorization RFP`,
      `${issuer} municipal advisor bond counsel RFP results`,
      `${issuer} regulatory risk`,
      `${issuer} recent developments`,
    ],
    'peer-comparison': [
      `${issuer} peer comparison municipal issuer same sector`,
      `${issuer} rating report peer comparison`,
      `${issuer} debt service coverage reserves liquidity peer comparison`,
      `${issuer} rating medians municipal peer ratios`,
      `${issuer} official statement comparable bonds spread MMD`,
      `${issuer} benchmark yield spread comparable municipal bonds`,
    ],
    'time-series-analysis': [
      `${issuer} ACFR 2025 2024 2023 financial statements`,
      `${issuer} annual comprehensive financial report multiple years`,
      `${issuer} debt service coverage liquidity reserves historical`,
      `${issuer} revenues expenses net position time series`,
      `${issuer} outstanding debt debt service schedule historical`,
      `${issuer} budget actual financial performance trend`,
    ],
    'covenant-tracking': [
      `${issuer} official statement rate covenant additional bonds test`,
      `${issuer} debt service coverage covenant compliance annual disclosure`,
      `${issuer} continuing disclosure rate covenant debt service coverage`,
      `${issuer} ACFR debt service coverage revenue bonds`,
      `${issuer} rate study rate ordinance covenant`,
      `${issuer} board agenda bond resolution covenant`,
    ],
    'watchlist-monitoring': [
      `${issuer} EMMA continuing disclosure recent filing`,
      `${issuer} rating action outlook recent`,
      `${issuer} board agenda bond authorization RFP`,
      `${issuer} municipal advisor bond counsel underwriter RFP`,
      `${issuer} budget audit ACFR recent`,
      `${issuer} USAspending federal award grant recent`,
    ],
    'custom-prompt': [
      custom,
      `${issuer} official statement rating ACFR`,
      `${issuer} investor relations debt`,
      `${issuer} continuing disclosure EMMA MSRB`,
      `${issuer} audited financial statements PDF`,
      `${issuer} rating report Moody's S&P Fitch`,
      `${issuer} board agenda minutes bond authorization RFP`,
      `${issuer} rate study rate ordinance single audit`,
    ],
  };

  return uniqueQueries([
    ...officialSourceQueries(issuer, preferredSource, recencyScope),
    ...strategies[promptMode].map((query) => withRecency(query, recencyScope)),
  ]);
}

function buildBaselineSourceQueries(issuer: string, preferredSource = 'all', recencyScope?: RecencyScope) {
  const currentYear = Number(recencyScope?.asOfDate.slice(0, 4)) || new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3].join(' ');
  const issuerTerms = `${issuer} ${years}`;

  const generalQueries = [
    `${issuerTerms} investor relations audited financial statements annual comprehensive financial report PDF`,
    `${issuerTerms} official statement revenue bonds EMMA MSRB continuing disclosure`,
    `${issuerTerms} rating report rating action Moody's S&P Fitch KBRA`,
    `${issuerTerms} adopted budget capital improvement plan CIP financial plan PDF`,
    `${issuerTerms} board agenda board packet bond resolution municipal advisor bond counsel RFP`,
    `${issuerTerms} rate study rate ordinance rate covenant additional bonds test debt service coverage`,
    `${issuerTerms} single audit SEFA federal awards grants`,
    `${issuerTerms} DebtWatch CDIAC debt issuance bonds`,
  ];

  const sourceSpecific: Record<string, string[]> = {
    'EMMA / MSRB': [
      `${issuerTerms} site:emma.msrb.org official statement continuing disclosure annual report`,
      `${issuerTerms} EMMA MSRB CUSIP revenue bonds`,
    ],
    USAspending: [
      `${issuerTerms} site:usaspending.gov federal awards grants recipient`,
      `${issuerTerms} single audit SEFA federal awards`,
    ],
    DebtWatch: [
      `${issuerTerms} site:debtwatch.treasurer.ca.gov debt issuance bonds`,
      `${issuerTerms} CDIAC DebtWatch bonds`,
    ],
    'SCO ByTheNumbers': [
      `${issuerTerms} site:bythenumbers.sco.ca.gov financial data revenues expenditures`,
      `${issuerTerms} SCO ByTheNumbers local government financial data`,
    ],
    CDIAC: [
      `${issuerTerms} site:treasurer.ca.gov/cdiac debt issuance official statement`,
      `${issuerTerms} CDIAC debt issuance bonds`,
    ],
  };

  return uniqueQueries(preferredSource === 'all' ? generalQueries : sourceSpecific[preferredSource] ?? generalQueries, 14);
}

function documentTypeFor(result: SonarSearchResult) {
  const text = `${result.title ?? ''} ${result.snippet ?? ''} ${result.url ?? ''}`.toLowerCase();

  if (/annual comprehensive financial report|\bacfr\b|audited financial|financial statements/.test(text)) {
    return 'ACFR / Audited Financial Statements';
  }

  if (/single audit|uniform guidance|schedule of expenditures of federal awards|\bsefa\b/.test(text)) {
    return 'Single Audit / Federal Awards';
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

  if (/usaspending|federal award|federal grant|recipient profile/.test(text)) {
    return 'Federal Award / Grant';
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

  if (/debt service schedule/.test(text)) {
    return 'Debt Service Schedule';
  }

  if (/rate covenant|additional bonds test|additional bonds covenant|covenant compliance/.test(text)) {
    return 'Covenant / Legal Security';
  }

  if (/rate study|rate action|rate increase|rate ordinance/.test(text)) {
    return 'Rate Study / Rate Ordinance';
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

  if (/board|agenda|minutes|packet|city clerk|clerk filing|ordinance|resolution/.test(text)) {
    return 'Board Agenda / Minutes';
  }

  return 'Other';
}

function classifySourceTier(result: SonarSearchResult) {
  const text = `${result.title ?? ''} ${result.snippet ?? ''} ${result.url ?? ''}`.toLowerCase();
  const docType = documentTypeFor(result);
  const host = sourceHost(result.url);

  if (host && hostMatches(host, TIER4_DOMAINS)) {
    return {
      rank: 4,
      tier: 'Tier 4',
      name: 'Media / low-priority source',
      documentType: docType,
      notes: `Domain ${host} is a secondary or social/media source. Do not use for core finance conclusions without Tier 1/2 confirmation.`,
    };
  }

  if (host && hostMatches(host, TIER3_DOMAINS)) {
    return {
      rank: 3,
      tier: 'Tier 3',
      name: 'Professional news / market context',
      documentType: docType,
      notes: `Domain ${host} is useful market or news context, but should not replace issuer, EMMA/MSRB, rating, or official government evidence.`,
    };
  }

  if (host && hostMatches(host, TIER1_DOMAINS)) {
    return {
      rank: 1,
      tier: 'Tier 1',
      name: 'Core public finance evidence',
      documentType: docType,
      notes: `Domain ${host} is a preferred Tier 1 public-finance, issuer, EMMA/MSRB, or rating source.`,
    };
  }

  if (host && hostMatches(host, TIER2_DOMAINS)) {
    return {
      rank: 2,
      tier: 'Tier 2',
      name: 'Official issuer / government source',
      documentType: docType,
      notes: `Domain ${host} is an official government, open-data, or structured public source.`,
    };
  }

  if (
    /annual comprehensive financial report|\bacfr\b|audited financial|single audit|schedule of expenditures of federal awards|\bsefa\b|official statement|preliminary official statement|\bpos\b|emma|msrb|continuing disclosure|rating report|rating action|moody|s&p|standard & poor|fitch|kroll|kb ra|bondholder|investor relation|revenue bond/.test(text)
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
    /\.gov\b|ladwp\.com|official|issuer|board report|board agenda|board minutes|board packet|budget|capital improvement|\bcip\b|rate study|rate ordinance|regulatory filing|financial plan|treasurer\.ca\.gov|ebudget\.ca\.gov|debtwatch\.treasurer\.ca\.gov|bythenumbers\.sco\.ca\.gov|usaspending\.gov|data\.ca\.gov/.test(text)
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
    const access = criticalSourceAccess(result.url);

    return {
      ...result,
      sourceTier: tier.tier,
      sourceTierRank: tier.rank,
      sourceTierName: tier.name,
      documentType: tier.documentType,
      status: result.status || access?.status || 'Candidate',
      recencyWindow,
      accessStatus: result.accessStatus || access?.status || 'Public metadata candidate',
      recommendedAction: result.recommendedAction || access?.action || 'Review the source and attach the underlying PDF or public document when it is needed for a final work product.',
      notes: `${result.notes ? `${result.notes} ` : ''}${tier.notes} Recency: ${recencyWindow}.${access ? ` ${access.label} often requires manual verification or PDF upload before extraction.` : ''}`,
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
    ['Budget / CIP', /budget|capital improvement|\bcip\b|financial plan/],
    ['Rate study / covenant', /rate study|rate ordinance|rate covenant|additional bonds test|debt service coverage/],
    ['Board materials', /board|agenda|minutes|packet|resolution|ordinance|rfp/],
    ['Single audit / federal awards', /single audit|schedule of expenditures of federal awards|\bsefa\b|usaspending|federal award|federal grant/],
    ['Recent risk events', /litigation|wildfire|regulatory|rate increase|recent developments|risk/],
  ].map(([area, pattern]) => ({
    area,
    ...coverageStatus(results, pattern as RegExp),
  }));
}

function coverageFoundCount(results: SonarSearchResult[]) {
  return buildCoverageDashboard(results).filter((row) => row.status === 'Found').length;
}

function shouldRunBaselineSourceSearch(results: SonarSearchResult[], financeFocused: boolean) {
  if (!financeFocused) return false;
  if (results.length < 12) return true;
  if (!hasCoreFinanceDocuments(results)) return true;
  return coverageFoundCount(results) < 5;
}

function sourceText(result: SonarSearchResult) {
  return `${result.title ?? ''} ${result.snippet ?? ''} ${result.notes ?? ''} ${result.url ?? ''}`;
}

function extractCusip(result: SonarSearchResult) {
  const match = sourceText(result).match(/\b[A-Z0-9]{6}[A-Z0-9]{2}[0-9]\b/i);
  return match?.[0].toUpperCase() ?? 'Not found';
}

function extractEmmaSubmissionId(result: SonarSearchResult) {
  const text = sourceText(result);
  if (!/emma|msrb/i.test(text)) return 'Not found';

  const match = text.match(/(?:submission|accession|document|filing)\s*(?:id|number|no\.?)?\s*[:#]?\s*([A-Z0-9-]{6,})/i);
  return match?.[1] ?? 'Not found';
}

function extractLabeledDate(result: SonarSearchResult, labels: string[]) {
  const text = sourceText(result);
  const datePattern = '([A-Z][a-z]+\\s+\\d{1,2},\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2})';

  for (const label of labels) {
    const pattern = new RegExp(`${label}[^A-Za-z0-9]{0,24}${datePattern}`, 'i');
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return 'Not found';
}

function publicationDate(result: SonarSearchResult) {
  return result.date || result.last_updated || extractLabeledDate(result, ['publication date', 'published', 'filing date', 'posted']);
}

function filingEntity(result: SonarSearchResult) {
  if (result.source) return result.source;
  if (!result.url) return 'Not found';

  try {
    return new URL(result.url).hostname.replace(/^www\./, '');
  } catch {
    return 'Not found';
  }
}

function buildDocumentInventory(results: SonarSearchResult[]) {
  return results
    .filter((result) => (result.sourceTierRank ?? 4) <= 2)
    .slice(0, 10)
    .map((result) => ({
      document: result.title || (result.url ? sourceLabel(result.url) : 'Untitled source'),
      type: result.documentType || 'General source',
      sourceTier: `${result.sourceTier}: ${result.sourceTierName}`,
      date: publicationDate(result),
      publicationDate: publicationDate(result),
      datedDate: extractLabeledDate(result, ['dated date', 'dated']),
      closingDate: extractLabeledDate(result, ['closing date', 'closed']),
      emmaFilingDate: /emma|msrb/i.test(sourceText(result)) ? publicationDate(result) : 'Not found',
      emmaSubmissionId: extractEmmaSubmissionId(result),
      cusip: extractCusip(result),
      filingEntity: filingEntity(result),
      source: result.url ? sourceLabel(result.url) : result.source || 'Web',
      status: result.status || 'Candidate',
      recencyWindow: result.recencyWindow || 'Undated source',
      confidenceTier: sourceConfidence(result),
      accessStatus: result.accessStatus || 'Public metadata candidate',
      recommendedAction: result.recommendedAction || 'Review manually before final use.',
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
    budget_cip: normalizeCoverage(
      coverageStatus(results, /budget|capital improvement|\bcip\b|financial plan/)
    ),
    rate_covenant: normalizeCoverage(
      coverageStatus(results, /rate study|rate ordinance|rate covenant|additional bonds test|debt service coverage/)
    ),
    board_materials: normalizeCoverage(
      coverageStatus(results, /board|agenda|minutes|packet|resolution|ordinance|rfp/)
    ),
    single_audit_federal_awards: normalizeCoverage(
      coverageStatus(results, /single audit|schedule of expenditures of federal awards|\bsefa\b|usaspending|federal award|federal grant/)
    ),
  };
}

const SOURCE_COVERAGE_REQUIREMENTS = [
  {
    key: 'acfr',
    area: 'ACFR / audited financials',
    patterns: [/annual comprehensive financial report/i, /\bacfr\b/i, /audited financial/i, /financial statements/i],
    uploadType: 'ACFR / audited financial statements',
    requiredFor: ['credit-memo', 'investment-committee-memo', 'rating-committee-memo', 'time-series-analysis'],
    why: 'Core financial trend, liquidity, pension/OPEB, debt note, and audit evidence.',
  },
  {
    key: 'official_statement',
    area: 'Official Statement / POS',
    patterns: [/official statement/i, /preliminary official statement/i, /\bpos\b/i, /revenue bond/i],
    uploadType: 'Official Statement / POS',
    requiredFor: ['credit-memo', 'investment-committee-memo', 'rating-committee-memo', 'covenant-tracking'],
    why: 'Security pledge, flow of funds, debt service schedule, rate covenant, additional bonds test, and risk factors.',
  },
  {
    key: 'emma_disclosure',
    area: 'EMMA continuing disclosure',
    patterns: [/emma/i, /msrb/i, /continuing disclosure/i, /annual disclosure/i, /event notice/i],
    uploadType: 'EMMA annual report / continuing disclosure',
    requiredFor: ['credit-memo', 'risk-monitor', 'watchlist-monitor', 'covenant-tracking'],
    why: 'Current annual filing, event notices, covenant compliance, and CUSIP-specific monitoring.',
    criticalAccess: true,
  },
  {
    key: 'ratings',
    area: 'Rating report / rating action',
    patterns: [/rating report/i, /rating action/i, /moody/i, /s&p/i, /standard & poor/i, /fitch/i, /kbra/i, /kroll/i],
    uploadType: 'Rating report / rating action',
    requiredFor: ['credit-memo', 'investment-committee-memo', 'rating-committee-memo', 'risk-monitor'],
    why: 'Rating/outlook, agency rationale, surveillance signals, and comparable credit framing.',
    criticalAccess: true,
  },
  {
    key: 'budget_cip',
    area: 'Budget / CIP',
    patterns: [/budget/i, /capital improvement/i, /\bcip\b/i, /financial plan/i, /capital plan/i],
    uploadType: 'Budget / CIP',
    requiredFor: ['credit-memo', 'investment-committee-memo', 'time-series-analysis', 'risk-monitor'],
    why: 'Forward-looking revenue, expense, capital program, and funding-source assumptions.',
  },
  {
    key: 'board_materials',
    area: 'Board packet / agenda / minutes',
    patterns: [/board/i, /agenda/i, /minutes/i, /packet/i, /resolution/i, /ordinance/i, /rfp/i, /municipal advisor/i, /bond counsel/i],
    uploadType: 'Board agenda / packet / minutes',
    requiredFor: ['risk-monitor', 'watchlist-monitor', 'due-diligence-report'],
    why: 'Early signal for bond authorizations, RFPs, financing team changes, budgets, and rate actions.',
  },
  {
    key: 'rate_covenant',
    area: 'Rate study / covenant support',
    patterns: [/rate study/i, /rate ordinance/i, /rate covenant/i, /additional bonds test/i, /debt service coverage/i, /\bdsc\b/i],
    uploadType: 'Rate study / rate ordinance',
    requiredFor: ['credit-memo', 'covenant-tracking', 'rating-committee-memo'],
    why: 'Revenue sufficiency, affordability, covenant support, and legal security verification.',
  },
  {
    key: 'single_audit',
    area: 'Single Audit / federal awards',
    patterns: [/single audit/i, /schedule of expenditures of federal awards/i, /\bsefa\b/i, /usaspending/i, /federal award/i, /federal grant/i],
    uploadType: 'Single Audit / SEFA',
    requiredFor: ['due-diligence-report', 'risk-monitor'],
    why: 'Federal award exposure, grant compliance, findings, and questioned costs.',
  },
  {
    key: 'sector_market',
    area: 'Sector / market context',
    patterns: [/sector outlook/i, /municipal market/i, /mmd/i, /spread/i, /comparable/i, /recent trade/i, /bondbuyer/i, /bloomberg/i, /reuters/i],
    uploadType: 'Other public finance source',
    requiredFor: ['investment-committee-memo', 'peer-comparison-table'],
    why: 'Comparable issuers, spread/yield context, sector pressure, and relative-value framing.',
  },
];

function bestCoverageMatch(results: SonarSearchResult[], patterns: RegExp[]) {
  return results
    .filter((result) => patterns.some((pattern) => pattern.test(sourceText(result))))
    .sort((a, b) => {
      const tierDelta = (a.sourceTierRank ?? 4) - (b.sourceTierRank ?? 4);
      if (tierDelta !== 0) return tierDelta;
      return String(b.date || b.last_updated || '').localeCompare(String(a.date || a.last_updated || ''));
    })[0];
}

function coverageMatrixStatus(match: SonarSearchResult | undefined, criticalAccess = false) {
  if (!match) return criticalAccess ? 'Needs Upload' : 'Needs Upload';
  if (/Older context/i.test(match.recencyWindow || '')) return 'Stale';
  if (/Manual Verification|Blocked/i.test(`${match.status ?? ''} ${match.accessStatus ?? ''}`)) return 'Manual Verification Required';
  return 'Found';
}

function buildSourceCoverageMatrix(issuer: string, results: SonarSearchResult[], outputType: string) {
  return SOURCE_COVERAGE_REQUIREMENTS.map((requirement) => {
    const match = bestCoverageMatch(results, requirement.patterns);
    const status = coverageMatrixStatus(match, requirement.criticalAccess);
    const ready = status === 'Found' && (match?.sourceTierRank ?? 4) <= 2;

    return {
      key: requirement.key,
      area: requirement.area,
      status,
      output_status: ready ? 'Good Enough for Output' : 'Needs Source',
      required_for_selected_output: requirement.requiredFor.includes(outputType),
      required_for: requirement.requiredFor,
      upload_type: requirement.uploadType,
      why: requirement.why,
      matched_source: match ? {
        title: match.title || (match.url ? sourceLabel(match.url) : 'Source candidate'),
        url: match.url,
        source_tier: match.sourceTier,
        document_type: match.documentType,
        date: publicationDate(match),
        recency_window: match.recencyWindow,
        status: match.status,
        access_status: match.accessStatus,
        recommended_action: match.recommendedAction,
      } : null,
      recommended_action: match?.recommendedAction ||
        `Upload or link ${requirement.uploadType} in Important Files so LlamaParse can extract the evidence before final delivery.`,
      retry_query: `${issuer} ${requirement.area} ${requirement.uploadType} PDF`,
    };
  });
}

const OUTPUT_ELIGIBILITY_RULES: Record<string, { label: string; required: string[]; helpful?: string[] }> = {
  'research-brief': { label: 'Research Brief', required: [] },
  'credit-memo': { label: 'Professional Credit Memo', required: ['acfr', 'official_statement'], helpful: ['ratings', 'emma_disclosure', 'rate_covenant', 'budget_cip'] },
  'investment-committee-memo': { label: 'Investment Committee Memo', required: ['acfr', 'official_statement', 'sector_market'], helpful: ['ratings', 'budget_cip'] },
  'rating-committee-memo': { label: 'Rating Committee Memo', required: ['acfr', 'official_statement', 'ratings'], helpful: ['rate_covenant', 'budget_cip'] },
  'document-inventory-report': { label: 'Document Inventory Report', required: [] },
  'due-diligence-report': { label: 'Due Diligence Report', required: ['acfr', 'official_statement'], helpful: ['board_materials', 'single_audit'] },
  'risk-monitor': { label: 'Risk Monitor', required: ['board_materials'], helpful: ['ratings', 'emma_disclosure', 'budget_cip'] },
  'watchlist-monitor': { label: 'Watchlist Monitor', required: ['board_materials'], helpful: ['ratings', 'emma_disclosure'] },
  'peer-comparison-table': { label: 'Peer Comparison Table', required: ['sector_market'], helpful: ['ratings', 'acfr'] },
  'time-series-analysis': { label: 'Time Series Analysis', required: ['acfr'], helpful: ['budget_cip'] },
  'covenant-tracking': { label: 'Covenant Tracking', required: ['official_statement', 'emma_disclosure', 'rate_covenant'], helpful: ['acfr'] },
  'source-appendix': { label: 'Source Appendix', required: [] },
  'custom-report': { label: 'Custom Report', required: [] },
};

function buildOutputEligibility(sourceCoverageMatrix: Array<Record<string, any>>, selectedOutputType: string) {
  const byKey = new Map(sourceCoverageMatrix.map((row) => [row.key, row]));
  const evaluate = (outputType: string, rule: { label: string; required: string[]; helpful?: string[] }) => {
    const missing = rule.required.filter((key) => byKey.get(key)?.output_status !== 'Good Enough for Output');
    const manual = rule.required.filter((key) => /Manual|Stale|Needs Upload/i.test(byKey.get(key)?.status ?? ''));
    const helpfulMissing = (rule.helpful ?? []).filter((key) => byKey.get(key)?.output_status !== 'Good Enough for Output');
    const status = missing.length === 0
      ? (helpfulMissing.length === 0 ? 'Ready' : 'Preliminary')
      : 'Needs Sources';

    return {
      output_type: outputType,
      label: rule.label,
      status,
      required_sources: rule.required,
      missing_required_sources: missing,
      helpful_missing_sources: helpfulMissing,
      manual_verification_sources: manual,
      recommendation: status === 'Ready'
        ? 'Good enough to generate as a source-supported output.'
        : status === 'Preliminary'
          ? 'Can generate, but label caveats and attach helpful missing documents before final delivery.'
          : 'Do not treat as final. Upload or verify required documents first.',
    };
  };
  const outputs = Object.entries(OUTPUT_ELIGIBILITY_RULES).map(([outputType, rule]) => evaluate(outputType, rule));
  const selected = outputs.find((item) => item.output_type === selectedOutputType) || evaluate(selectedOutputType, { label: selectedOutputType, required: [] });

  return {
    selected,
    outputs,
  };
}

function buildUploadQueue(sourceCoverageMatrix: Array<Record<string, any>>) {
  return sourceCoverageMatrix
    .filter((row) => row.output_status !== 'Good Enough for Output')
    .map((row) => ({
      area: row.area,
      upload_type: row.upload_type,
      status: row.status,
      why: row.why,
      recommended_action: row.recommended_action,
      retry_query: row.retry_query,
      parser: 'LlamaParse',
      preferred_tier: /Official Statement|ACFR|EMMA|Rating/i.test(row.upload_type) ? 'agentic_plus' : 'agentic',
    }))
    .slice(0, 10);
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
      access_status: result.accessStatus || 'Public metadata candidate',
      recommended_action: result.recommendedAction || 'Review manually before final use.',
    }));
}

function buildMissingItems(coverage: Record<string, { status: string; confidence: string }>) {
  const labels: Record<string, string> = {
    audited_financials: 'Audited financial statements / ACFR',
    official_statement: 'Latest official statement or POS',
    ratings: "Current rating reports or rating action pages from Moody's, S&P, Fitch, or KBRA",
    continuing_disclosure: 'Latest EMMA / MSRB annual continuing disclosure filing',
    recent_risk_events: 'Recent risk event scan and monitoring update',
    budget_cip: 'Budget / CIP',
    rate_covenant: 'Rate study, rate ordinance, or covenant evidence',
    board_materials: 'Board agenda, minutes, packet, resolution, or RFP evidence',
    single_audit_federal_awards: 'Single Audit / SEFA or USAspending federal award evidence',
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
  issuerProfile,
  universalSearch,
  documentDiagnostics,
  retrievalDiagnostics,
  failureClassification,
}: {
  issuer: string;
  modeLabel: string;
  outputType: string;
  timestamp: string;
  recencyScope: RecencyScope;
  searchQueries: string[];
  searchResults: SonarSearchResult[];
  issuerProfile?: Record<string, unknown> | null;
  universalSearch?: unknown;
  documentDiagnostics?: DocumentDiagnostics | null;
  retrievalDiagnostics?: RetrievalDiagnostics | null;
  failureClassification?: FailureClassification | null;
}) {
  const coverage = buildCoverageDashboardObject(searchResults);
  const sourceCoverageMatrix = buildSourceCoverageMatrix(issuer, searchResults, outputType);
  const outputEligibility = buildOutputEligibility(sourceCoverageMatrix, outputType);
  const uploadQueue = buildUploadQueue(sourceCoverageMatrix);

  return {
    issuer,
    research_mode: modeLabel,
    output_type: outputType,
    search_timestamp: timestamp,
    recency_policy: {
      as_of_date: recencyScope.asOfDate,
      quarterly_window: `${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}`,
      annual_window: `${recencyScope.annualStartDate} to ${recencyScope.asOfDate}`,
      structural_window: `${recencyScope.structuralStartDate} to ${recencyScope.asOfDate}`,
      rule: 'Prefer last 3 months for fresh developments, use the 1-year window for monitoring backfill, and use the 3-year window for structural context. Label every item by window.',
    },
    source_strategy: {
      structured_connectors: searchResults.some((result) => result.source === 'USAspending')
        ? ['USAspending API']
        : [],
      preferred_official_domains: [
        'emma.msrb.org',
        'debtwatch.treasurer.ca.gov',
        'bythenumbers.sco.ca.gov',
        'treasurer.ca.gov/cdiac',
        'usaspending.gov',
        'data.ca.gov',
      ],
      critical_manual_sources: CRITICAL_SOURCE_ACCESS_NOTES.map((item) => ({
        source: item.label,
        action: item.action,
      })),
      note: 'EMMA/MSRB, rating pages, DebtWatch, SCO ByTheNumbers, CDIAC, and CKAN sources are prioritized through domain-targeted search. When crawler access is limited, the workflow marks the source for manual verification or PDF upload instead of pretending extraction is complete.',
    },
    issuer_profile_context: issuerProfile ?? null,
    universal_search: universalSearch ?? null,
    document_diagnostics: documentDiagnostics ?? null,
    retrieval_diagnostics: retrievalDiagnostics ?? null,
    failure_classification: failureClassification ?? null,
    search_queries_used: searchQueries,
    document_inventory: buildDocumentInventory(searchResults).map((item) => ({
      title: item.document,
      document_type: item.type,
      source_tier: item.sourceTier,
      source_url: item.url,
      date: item.date,
      publication_date: item.publicationDate,
      dated_date: item.datedDate,
      closing_date: item.closingDate,
      emma_filing_date: item.emmaFilingDate,
      emma_submission_id: item.emmaSubmissionId,
      cusip: item.cusip,
      filing_entity: item.filingEntity,
      status: item.status.toLowerCase(),
      confidence: item.confidenceTier,
      access_status: item.accessStatus,
      recommended_action: item.recommendedAction,
      recency_window: item.recencyWindow,
      notes: item.notes,
    })),
    coverage_dashboard: coverage,
    source_coverage_matrix: sourceCoverageMatrix,
    output_eligibility: outputEligibility,
    upload_queue: uploadQueue,
    raw_evidence_notes: buildRawEvidenceNotes(searchResults),
    missing_items: uniqueQueries([
      ...buildMissingItems(coverage),
      ...sourceCoverageMatrix
        .filter((row) => row.output_status !== 'Good Enough for Output')
        .map((row) => `${row.area}: ${row.status}. ${row.recommended_action}`),
    ], 24),
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

function usaSpendingToSearchResult(award: UsaSpendingAward): SonarSearchResult {
  return {
    title: award.title,
    url: award.url,
    date: award.startDate,
    last_updated: award.endDate,
    snippet: award.summary,
    source: 'USAspending',
    query: 'USAspending API recipient award search',
    sourceTier: 'Tier 2',
    sourceTierRank: 2,
    sourceTierName: 'Official federal spending source',
    documentType: 'Federal Award / Grant',
    status: 'Candidate',
    notes: 'Structured official connector result from USAspending.gov. Use for federal grant or award exposure, not as municipal disclosure replacement.',
  };
}

async function structuredConnectorResults(issuer: string, source: string, recencyScope: RecencyScope) {
  const shouldSearchUsaSpending = source === 'all' || source === 'USAspending';
  const results: SonarSearchResult[] = [];

  if (shouldSearchUsaSpending) {
    try {
      const awards = await searchUsaSpending({
        query: issuer,
        startDate: recencyScope.structuralStartDate,
        endDate: recencyScope.asOfDate,
        limit: 6,
      });
      results.push(...awards.map(usaSpendingToSearchResult));
    } catch {
      results.push({
        title: 'USAspending connector check',
        url: 'https://www.usaspending.gov/search',
        source: 'USAspending',
        query: 'USAspending API recipient award search',
        sourceTier: 'Tier 2',
        sourceTierRank: 2,
        sourceTierName: 'Official federal spending source',
        documentType: 'Federal Award / Grant',
        status: 'Needs manual verification',
        recencyWindow: 'Undated source',
        notes: 'USAspending API did not return structured results for this run. Verify manually if federal grants or awards matter to the credit.',
      });
    }
  }

  return results;
}

function modeAnswerInstructions(promptMode: PromptMode, financeFocused: boolean, recencyScope: RecencyScope) {
  const aiExperienceRules = [
    'AI EXPERIENCE FORMAT:',
    'Never return long paragraphs.',
    'Always use these sections in this order: Summary, Analysis, Evidence, Recommendations, Confidence, Suggested Follow-up Questions.',
    'Use short bullets under every section.',
    'Confidence must be exactly High, Medium, or Low, followed by a one-sentence explanation.',
    'Suggested Follow-up Questions must include relevant next questions the user can ask.',
    '',
  ].join('\n');

  if (!financeFocused) {
    return [
      aiExperienceRules,
      'Format the answer as a short research memo with: Current answer, Evidence, Gaps, Next step.',
      `Use the quarterly window (${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}) for fresh developments, the annual window (${recencyScope.annualStartDate} to ${recencyScope.asOfDate}) for monitoring backfill, and the three-year window (${recencyScope.structuralStartDate} to ${recencyScope.asOfDate}) for structural context.`,
      noRecentInfoGuide(),
    ].join('\n');
  }

  const modeLabel = PROMPT_MODE_OPTIONS[promptMode].label;

  return [
    aiExperienceRules,
    'Use this exact finance-focused structure:',
    '1. Recency Discipline',
    `- Quarterly window: ${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}.`,
    `- Annual window: ${recencyScope.annualStartDate} to ${recencyScope.asOfDate}.`,
    `- Three-year structural window: ${recencyScope.structuralStartDate} to ${recencyScope.asOfDate}.`,
    '- Label each development as Preferred 3-month evidence, Annual 1-year evidence, Structural 3-year context, Older context only, or Undated source.',
    '- If no current item is found, classify the reason using: No recent change found, Stale source only, Insufficient public evidence, or Needs manual verification.',
    '',
    '2. Research Mode',
    `- Selected mode: ${modeLabel}`,
    '- Search provider: Perplexity Sonar + Perplexity Search API + official connector/domain search + sector/market expansion where available',
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
    '6. Document Extraction Targets',
    '| Document Type | Extract / Verify | Why It Matters |',
    '|---|---|---|',
    '| ACFR / audited financial statements | MD&A, Statement of Net Position, cash/investments, unrestricted reserves, operating revenue/expense, debt service coverage if available | Core financial trend and liquidity evidence |',
    '| Official Statement / POS | Security, pledge, flow of funds, debt service schedule, rate covenant, additional bonds test, risks, continuing disclosure undertaking | Legal security and bondholder protections |',
    '| Continuing Disclosure / EMMA annual report | Updated financial metrics, covenant compliance, event notices, filing date, CUSIP | Current disclosure and monitoring status |',
    '| Budget / CIP | adopted budget, major revenue/expenditure assumptions, capital plan, funding sources | Forward-looking management and capital needs |',
    '| Rate Study / Rate Ordinance | approved rate path, affordability, coverage targets, rate covenant support | Revenue sufficiency and political/implementation risk |',
    '| Board Agenda / Minutes / Packet | bond authorization, bond resolution, municipal advisor/bond counsel hires, RFP approval/results | Early signal before market documents appear |',
    '| Single Audit / SEFA | federal awards, findings, questioned costs, major programs | Federal grant recipient risk and compliance |',
    '',
    '7. Coverage Dashboard',
    '| Evidence Area | Status | Confidence |',
    '|---|---|---|',
    '| Audited financials | Found / Missing | High / Medium / Low |',
    '| Debt documents | Found / Missing | High / Medium / Low |',
    '| Ratings | Found / Missing | High / Medium / Low |',
    '| Continuing disclosure | Found / Missing | High / Medium / Low |',
    '| Budget / CIP | Found / Missing | High / Medium / Low |',
    '| Rate study / covenant | Found / Missing | High / Medium / Low |',
    '| Board materials | Found / Missing | High / Medium / Low |',
    '| Single audit / federal awards | Found / Missing | High / Medium / Low |',
    '| Recent risk events | Found / Missing | High / Medium / Low |',
    '',
    '8. Working Conclusion',
    'Only provide conclusions supported by Tier 1 or Tier 2 sources.',
    'If a critical source is marked Manual Verification Required, treat it as metadata only until the PDF or public document is uploaded or verified.',
    '',
    '9. Key Credit Considerations',
    '- Strengths:',
    '- Risks:',
    '- Recent developments:',
    '- Financial metrics:',
    '- Debt / covenant considerations:',
    '',
    '10. Missing Data / Limits',
    'Explicitly state what cannot be concluded due to missing documents.',
    noRecentInfoGuide(),
    '',
    '11. Next Search Queries',
    'List exact follow-up queries to improve evidence coverage.',
    '',
    '12. Upload / LlamaParse Queue',
    'List documents that should be uploaded through Important Files so LlamaParse can extract covenant language, financial tables, CUSIP, dates, and source sections.',
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
      max_results: 12,
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

function cachedDocumentCount(issuerProfile: Record<string, unknown> | null) {
  if (!issuerProfile) return 0;
  const sourceTrail = Array.isArray(issuerProfile.sourceTrail) ? issuerProfile.sourceTrail.length : 0;
  const knownDocs = [
    issuerProfile.latestOS,
    issuerProfile.latestACFR,
    issuerProfile.latestEmmaFiling,
    issuerProfile.latestRatingReport,
    issuerProfile.latestBudget,
    issuerProfile.boardPage,
    issuerProfile.emmaLink,
  ].filter(Boolean).length;

  return sourceTrail + knownDocs;
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

function openAiResponseText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = (payload?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .map((content: any) => content?.text)
    .filter(Boolean);

  return parts.join('\n\n').trim();
}

async function buildOpenAiSourceIntelligence({
  query,
  outputType,
  evidencePackage,
  searchResults,
}: {
  query: string;
  outputType: string;
  evidencePackage: Record<string, any>;
  searchResults: SonarSearchResult[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: 'not_configured',
      note: 'OPENAI_API_KEY is not configured, so Civic Ledger used Perplexity-only source intelligence for this run.',
    };
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5.5';
  const sourceBrief = {
    query,
    outputType,
    recency_policy: evidencePackage.recency_policy,
    source_coverage_matrix: evidencePackage.source_coverage_matrix,
    output_eligibility: evidencePackage.output_eligibility?.selected,
    upload_queue: evidencePackage.upload_queue,
    top_sources: searchResults.slice(0, 24).map((source) => ({
      title: source.title,
      url: source.url,
      source_tier: source.sourceTier,
      document_type: source.documentType,
      recency_window: source.recencyWindow,
      status: source.status,
      access_status: source.accessStatus,
      recommended_action: source.recommendedAction,
      snippet: source.snippet,
    })),
  };

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            'You are Civic Ledger Source Intelligence QA.',
            'Review the supplied public finance source package after Perplexity search.',
            'Do not invent source facts. Focus on coverage gaps, output eligibility, upload priorities, and sector/market context still needed.',
            'Return concise bullets with these headings: Output Decision, Source Gaps, Upload Queue, Sector / Market Backfill, Final QA.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(sourceBrief, null, 2),
        },
      ],
      max_output_tokens: 1100,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      status: 'error',
      note: apiErrorMessage(payload, res.status),
    };
  }

  return {
    status: 'completed',
    model: payload.model || model,
    content: openAiResponseText(payload),
    generated_at: new Date().toISOString(),
    usage: payload.usage ?? null,
  };
}

export async function POST(request: Request) {
  const apiKey = getPerplexityApiKey();

  if (!apiKey) {
    const message = perplexityApiKeyErrorMessage();
    const failureClassification = classifyResearchFailure({ apiError: message });

    return NextResponse.json(
      {
        error: failureClassification?.title || message,
        failureClassification,
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
  const issuerProfile = body.issuerProfile && typeof body.issuerProfile === 'object'
    ? body.issuerProfile as Record<string, unknown>
    : null;
  const issuerProfileContext = String(body.issuerProfileContext ?? '').trim();
  const mode = PROMPT_MODE_OPTIONS[promptMode];
  const financeFocused = FINANCE_FOCUSED_MODES.has(promptMode);
  const timestamp = new Date().toISOString();
  const recencyScope = buildRecencyScope(new Date(timestamp));

  if (!query) {
    return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
  }

  const universalSearch = parseUniversalSearchQuery(query);
  const researchSubject = universalSearch.canonicalQuery || query;
  const sourceForSearch = source === 'all'
    ? universalSearch.recommendedSource
    : source;
  const model = getPerplexityModel();
  const searchQueries = uniqueQueries([
    ...universalSearch.expandedQueries.map((searchQuery) => withRecency(searchQuery, recencyScope)),
    ...buildSearchQueries(researchSubject, promptMode, customAngle, recencyScope, sourceForSearch),
    ...buildCriticalSourceManualQueries(researchSubject, recencyScope),
    ...buildSectorMarketQueries(researchSubject, promptMode, customAngle, recencyScope, universalSearch),
  ], 42);
  const structuredResults = workflowOptions.includeLiveSearch
    ? await structuredConnectorResults(researchSubject, sourceForSearch, recencyScope)
    : [];
  const officialSeedResults = knownOfficialSeedResults(researchSubject);
  const searchSettled = workflowOptions.includeLiveSearch && workflowOptions.includePerplexity
    ? await Promise.allSettled(
      searchQueries.map((searchQuery) => searchPerplexity(apiKey, searchQuery))
    )
    : [];
  const searchApiResults = searchSettled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );
  let classifiedSearchApiResults = classifyResults(
    mergeSearchResults(officialSeedResults, structuredResults, searchApiResults),
    financeFocused,
    recencyScope
  );
  const baselineQueries = workflowOptions.includeLiveSearch && workflowOptions.includePerplexity && shouldRunBaselineSourceSearch(classifiedSearchApiResults, financeFocused)
    ? buildBaselineSourceQueries(researchSubject, sourceForSearch, recencyScope)
    : [];
  const baselineSettled = baselineQueries.length > 0
    ? await Promise.allSettled(
      baselineQueries.map((searchQuery) => searchPerplexity(apiKey, searchQuery))
    )
    : [];
  const baselineSearchApiResults = baselineSettled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value.map((item) => ({
      ...item,
      notes: `${item.notes ? `${item.notes} ` : ''}Baseline source fallback result. Use as structural context unless the source date is current.`,
    })) : []
  );

  if (baselineSearchApiResults.length > 0) {
    classifiedSearchApiResults = classifyResults(
      mergeSearchResults(officialSeedResults, structuredResults, searchApiResults, baselineSearchApiResults),
      financeFocused,
      recencyScope
    );
  }

  const allSearchQueries = uniqueQueries([...searchQueries, ...baselineQueries], 64);
  const coreFinanceDocumentsFound = hasCoreFinanceDocuments(classifiedSearchApiResults);
  const preliminaryDocumentDiagnostics = buildDocumentDiagnostics(researchSubject, classifiedSearchApiResults);
  const preliminaryRetrievalDiagnostics = buildRetrievalDiagnostics({
    issuer: researchSubject,
    sources: classifiedSearchApiResults,
    searchQueries: allSearchQueries,
    cachedDocumentCount: cachedDocumentCount(issuerProfile),
    liveDocumentCount: classifiedSearchApiResults.length,
  });

  const prompt = [
    'You are Civic Ledger, a public-finance research assistant.',
    'Use current public web sources to answer questions about municipal finance, public issuers, budgets, audited financial statements, official statements, debt issuance, ratings, and disclosure.',
    recencyPrompt(recencyScope),
    noRecentInfoGuide(),
    'Prioritize municipal finance evidence over general encyclopedia, media, or policy summaries.',
    'Source quality tiers:',
    'Tier 1 = ACFR/audited financial statements, official statements/POS, EMMA/MSRB filings, continuing disclosures, rating agency reports/actions, bond documents, investor relations debt pages.',
    'Tier 2 = official issuer/government sources, board reports, budget documents, CIP, rate studies, regulatory filings, government reports, USAspending federal award data, SCO ByTheNumbers, CDIAC, DebtWatch, and CKAN public datasets.',
    'Tier 3 = analytical or technical sources such as NREL, state agencies, court opinions, industry reports, technical studies.',
    'Tier 4 = media, YouTube, blogs, secondary summaries. Avoid Tier 4 for finance-focused conclusions unless no better source exists.',
    financeFocused
      ? 'For finance-focused modes, do not make strong credit conclusions unless at least one Tier 1 core finance document is found. If missing, say: "Core finance documents were not found in this search run. The following is a preliminary issuer overview, not a credit conclusion."'
      : 'For general overview mode, still identify official sources and avoid unsupported claims.',
    'Answer in the same language as the user.',
    'Be concise, source-grounded, and explicit about dates.',
    'If current evidence is insufficient, say what is missing instead of guessing.',
    issuerProfileContext
      ? 'An issuer profile database context may be supplied. Treat it as prior internal context only; verify whether newer evidence exists before relying on it.'
      : null,
    modeAnswerInstructions(promptMode, financeFocused, recencyScope),
  ].join('\n');

  const userContent = [
    `Question: ${query}`,
    `Research prompt mode: ${mode.label}`,
    `Mode description: ${mode.description}`,
    `Requested output type: ${outputType}`,
    customAngle ? `Custom research angle: ${customAngle}` : null,
    ...universalSearchContextLines(universalSearch),
    `Preferred topic filter: ${topic}`,
    `Preferred source filter: ${source}`,
    `Universal source route: ${sourceForSearch}`,
    `Timestamp: ${timestamp}`,
    `Quarterly recency window: ${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}`,
    `Annual monitoring window: ${recencyScope.annualStartDate} to ${recencyScope.asOfDate}`,
    `Three-year structural context window: ${recencyScope.structuralStartDate} to ${recencyScope.asOfDate}`,
    `Search scope: ${allSearchQueries.join(' | ')}`,
    baselineQueries.length > 0 ? `Baseline source fallback triggered: ${baselineQueries.join(' | ')}` : null,
    `Structured connector scope: ${structuredResults.length > 0 ? 'USAspending API plus preferred official domain search' : 'Preferred official domain search'}`,
    'Critical source handling: If EMMA/MSRB or rating-agency pages are surfaced but full document extraction is not available, label them Manual Verification Required and recommend PDF upload through Important Files / LlamaParse.',
    officialSeedResults.length > 0 ? `Known official source registry: ${officialSeedResults.map((result) => result.title).join(' | ')}` : null,
    `Core finance document found by Search API: ${coreFinanceDocumentsFound ? 'yes' : 'no'}`,
    issuerProfileContext ? '' : null,
    issuerProfileContext ? issuerProfileContext : null,
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
    const error = apiErrorMessage(payload, res.status);
    const failureClassification = classifyResearchFailure({
      documentDiagnostics: preliminaryDocumentDiagnostics,
      retrievalDiagnostics: preliminaryRetrievalDiagnostics,
      apiError: error,
    });

    return NextResponse.json(
      {
        error: failureClassification?.title || error,
        failureClassification,
        documentDiagnostics: preliminaryDocumentDiagnostics,
        retrievalDiagnostics: preliminaryRetrievalDiagnostics,
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
  const documentDiagnostics = buildDocumentDiagnostics(researchSubject, searchResults);
  const retrievalDiagnostics = buildRetrievalDiagnostics({
    issuer: researchSubject,
    sources: searchResults,
    searchQueries: allSearchQueries,
    cachedDocumentCount: cachedDocumentCount(issuerProfile),
    liveDocumentCount: searchResults.length,
  });
  const failureClassification = classifyResearchFailure({
    documentDiagnostics,
    retrievalDiagnostics,
  });
  const citations = mergeSearchResults(
    (sonar.citations ?? []).map((url) => ({ url })),
    searchResults
  ).map((result) => result.url).filter(Boolean) as string[];
  const facts = [
    `${mode.label} mode`,
    `Output type requested: ${outputType}`,
    universalSearch.summary,
    `Universal search facets: ${universalSearch.facets.map((facet) => `${facet.label}: ${facet.value}`).join('; ') || 'none'}`,
    `Recency windows: quarterly ${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}; annual ${recencyScope.annualStartDate} to ${recencyScope.asOfDate}; structural ${recencyScope.structuralStartDate} to ${recencyScope.asOfDate}.`,
    baselineQueries.length > 0
      ? `Baseline source fallback ran because initial source coverage was limited; older documents are structural context, not recent developments.`
      : 'Baseline source fallback did not run.',
    financeFocused
      ? finalCoreFinanceDocumentsFound
        ? 'Core finance documents were found in this search run.'
        : (failureClassification?.title || 'Core finance documents were not found in this search run; treat the memo as preliminary.')
      : 'General research mode.',
    ...sourceFacts(searchResults),
  ];
  const documentInventory = buildDocumentInventory(searchResults);
  const coverageDashboard = buildCoverageDashboard(searchResults);
  const evidencePackage = buildEvidencePackage({
    issuer: researchSubject,
    modeLabel: mode.label,
    outputType,
    timestamp,
    recencyScope,
    searchQueries: allSearchQueries,
    searchResults,
    issuerProfile,
    universalSearch,
    documentDiagnostics,
    retrievalDiagnostics,
    failureClassification,
  });
  const openAiSourceIntelligence = workflowOptions.includeOpenaiSynthesis
    ? await buildOpenAiSourceIntelligence({
      query,
      outputType,
      evidencePackage,
      searchResults,
    })
    : {
      status: 'skipped',
      note: 'OpenAI synthesis was disabled for this workflow run.',
    };
  const evidenceEngine = buildEvidenceEngine({
    title: researchSubject,
    facts,
    citations,
    searchResults,
    documentInventory,
    coverageDashboard,
    evidencePackage,
  }, content);
  const researchWorkspace = buildResearchWorkspace({
    title: researchSubject,
    facts,
    citations,
    searchResults,
    documentInventory,
    coverageDashboard,
    evidencePackage,
  }, content, evidenceEngine);
  const issuerDashboard = buildIssuerDashboard({
    title: researchSubject,
    facts,
    citations,
    searchResults,
    documentInventory,
    coverageDashboard,
    evidencePackage,
  }, content, evidenceEngine);
  const structuredAnswer = buildStructuredAnswer({
    record: {
      title: researchSubject,
      summary: researchSummary(researchSubject, mode.label, financeFocused, finalCoreFinanceDocumentsFound, searchResults),
      facts,
      citations,
      searchResults,
      documentInventory,
      coverageDashboard,
      evidencePackage,
      documentDiagnostics,
      failureClassification,
      financeFocused,
      coreFinanceDocumentsFound: finalCoreFinanceDocumentsFound,
      relatedQuestions: sonar.related_questions ?? [],
    },
    content,
    evidenceEngine,
    researchWorkspace,
    issuerDashboard,
  });
  const enrichedEvidencePackage = {
    ...evidencePackage,
    openai_source_intelligence: openAiSourceIntelligence,
    evidence_engine: evidenceEngine,
    research_workspace: researchWorkspace,
    issuer_dashboard: issuerDashboard,
    structured_answer: structuredAnswer,
  };

  return NextResponse.json({
    record: {
      id: `research-${Date.now()}`,
      kind: 'research',
      title: researchSubject,
      topic: mode.label,
      source: 'Perplexity Sonar',
      score: 100,
      summary: researchSummary(researchSubject, mode.label, financeFocused, finalCoreFinanceDocumentsFound, searchResults),
      snippet: content,
      facts: facts.length > 0 ? facts : ['Perplexity returned an answer, but no source snippets were included.'],
      citations,
      searchResults,
      workflowInput: {
        issuer: researchSubject,
        original_query: query,
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
          quarterly_window: `${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}`,
          annual_window: `${recencyScope.annualStartDate} to ${recencyScope.asOfDate}`,
          structural_window: `${recencyScope.structuralStartDate} to ${recencyScope.asOfDate}`,
          baseline_source_fallback: baselineQueries.length > 0
            ? 'Triggered because initial live search coverage was limited. Older sources are structural context, not recent developments.'
            : 'Not triggered.',
        },
        search_strategy: {
          initial_queries: searchQueries,
          baseline_queries: baselineQueries,
          all_queries: allSearchQueries,
        },
        issuer_profile_used: issuerProfile ? {
          issuer: issuerProfile.issuer ?? researchSubject,
          last_checked_date: issuerProfile.lastCheckedDate ?? null,
          coverage_score: issuerProfile.evidenceCoverageScore ?? null,
        } : null,
        universal_search: {
          intent: universalSearch.intentLabel,
          facets: universalSearch.facets,
          expanded_queries: universalSearch.expandedQueries,
        },
      },
      workflowOptions,
      outputType,
      evidencePackage: enrichedEvidencePackage,
      evidenceEngine,
      evidenceCoverageScore: evidenceEngine.coveragePercent,
      researchWorkspace,
      issuerDashboard,
      structuredAnswer,
      documentDiagnostics,
      retrievalDiagnostics,
      failureClassification,
      promptMode,
      researchModeLabel: mode.label,
      customAngle,
      financeFocused,
      coreFinanceDocumentsFound: finalCoreFinanceDocumentsFound,
      documentInventory,
      coverageDashboard,
      searchQueries: allSearchQueries,
      relatedQuestions: sonar.related_questions ?? [],
      generatedAt: timestamp,
      recencyScope,
      model: sonar.model || model,
      usage: sonar.usage ?? null,
    },
  });
}
