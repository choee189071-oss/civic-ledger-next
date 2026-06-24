export type UniversalSearchFacetType =
  | 'issuer'
  | 'alias'
  | 'cusip'
  | 'ticker'
  | 'sector'
  | 'bond_type'
  | 'state'
  | 'rating'
  | 'keyword'
  | 'natural_language';

export type UniversalSearchFacet = {
  type: UniversalSearchFacetType;
  label: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
};

export type IssuerIndexItem = {
  canonicalName: string;
  aliases: string[];
  tickers?: string[];
  sector: string;
  state: string;
  bondTypes?: string[];
  keywords?: string[];
};

export type UniversalSearchInterpretation = {
  rawQuery: string;
  normalizedQuery: string;
  canonicalQuery: string;
  primaryIssuer?: IssuerIndexItem;
  facets: UniversalSearchFacet[];
  intent: string;
  intentLabel: string;
  recommendedPromptMode: string;
  recommendedSource: string;
  expandedQueries: string[];
  summary: string;
};

export const issuerIndex: IssuerIndexItem[] = [
  {
    canonicalName: 'Los Angeles Department of Water and Power',
    aliases: [
      'LADWP',
      'Los Angeles Department of Water',
      'Los Angeles Department of Water and Power',
      'Los Angeles Dept Water Power',
      'Los Angeles Water and Power',
      'LA DWP',
    ],
    sector: 'Utilities',
    state: 'California',
    bondTypes: ['Power Revenue Bond', 'Water Revenue Bond', 'Revenue Bond'],
    keywords: ['water', 'power', 'utility', 'wildfire', 'rate covenant', 'debt service coverage'],
  },
  {
    canonicalName: 'Los Angeles Community College District',
    aliases: ['LACCD', 'LA CCD', 'Los Angeles CCD', 'Los Angeles Community College District'],
    sector: 'Education / Community College District',
    state: 'California',
    bondTypes: ['General Obligation Bond', 'Lease Revenue Bond'],
    keywords: ['school district', 'community college', 'bond authorization', 'board minutes'],
  },
  {
    canonicalName: 'Sacramento Municipal Utility District',
    aliases: ['SMUD', 'Sacramento MUD', 'Sacramento Municipal Utility District'],
    sector: 'Utilities',
    state: 'California',
    bondTypes: ['Electric Revenue Bond', 'Power Revenue Bond', 'Revenue Bond'],
    keywords: ['utility', 'power', 'wildfire', 'resource plan'],
  },
  {
    canonicalName: 'Texas Water Development Board',
    aliases: ['TWDB', 'Texas Water Development Board'],
    sector: 'State Agency / Water',
    state: 'Texas',
    bondTypes: ['State Revolving Fund Bond', 'Water Revenue Bond', 'General Obligation Bond'],
    keywords: ['water', 'state revolving fund', 'bond program'],
  },
  {
    canonicalName: 'New York Power Authority',
    aliases: ['NYPA', 'New York Power Authority'],
    sector: 'Utilities',
    state: 'New York',
    bondTypes: ['Revenue Bond', 'Power Revenue Bond'],
    keywords: ['power', 'utility', 'hydroelectric'],
  },
  {
    canonicalName: 'City of West Sacramento',
    aliases: ['West Sacramento', 'City of West Sacramento'],
    sector: 'City / Local Government',
    state: 'California',
    bondTypes: ['EIFD Bond', 'Tax Allocation Bond', 'Lease Revenue Bond'],
    keywords: ['EIFD', 'tax increment', 'city finance'],
  },
];

const stateAliases: Record<string, string> = {
  al: 'Alabama',
  alabama: 'Alabama',
  ak: 'Alaska',
  alaska: 'Alaska',
  az: 'Arizona',
  arizona: 'Arizona',
  ar: 'Arkansas',
  arkansas: 'Arkansas',
  ca: 'California',
  calif: 'California',
  california: 'California',
  co: 'Colorado',
  colorado: 'Colorado',
  ct: 'Connecticut',
  connecticut: 'Connecticut',
  de: 'Delaware',
  delaware: 'Delaware',
  fl: 'Florida',
  florida: 'Florida',
  ga: 'Georgia',
  georgia: 'Georgia',
  hi: 'Hawaii',
  hawaii: 'Hawaii',
  id: 'Idaho',
  idaho: 'Idaho',
  il: 'Illinois',
  illinois: 'Illinois',
  in: 'Indiana',
  indiana: 'Indiana',
  ia: 'Iowa',
  iowa: 'Iowa',
  ks: 'Kansas',
  kansas: 'Kansas',
  ky: 'Kentucky',
  kentucky: 'Kentucky',
  la: 'Louisiana',
  louisiana: 'Louisiana',
  me: 'Maine',
  maine: 'Maine',
  md: 'Maryland',
  maryland: 'Maryland',
  ma: 'Massachusetts',
  massachusetts: 'Massachusetts',
  mi: 'Michigan',
  michigan: 'Michigan',
  mn: 'Minnesota',
  minnesota: 'Minnesota',
  ms: 'Mississippi',
  mississippi: 'Mississippi',
  mo: 'Missouri',
  missouri: 'Missouri',
  mt: 'Montana',
  montana: 'Montana',
  ne: 'Nebraska',
  nebraska: 'Nebraska',
  nv: 'Nevada',
  nevada: 'Nevada',
  nh: 'New Hampshire',
  'new hampshire': 'New Hampshire',
  nj: 'New Jersey',
  'new jersey': 'New Jersey',
  nm: 'New Mexico',
  'new mexico': 'New Mexico',
  ny: 'New York',
  'new york': 'New York',
  nc: 'North Carolina',
  'north carolina': 'North Carolina',
  nd: 'North Dakota',
  'north dakota': 'North Dakota',
  oh: 'Ohio',
  ohio: 'Ohio',
  ok: 'Oklahoma',
  oklahoma: 'Oklahoma',
  or: 'Oregon',
  oregon: 'Oregon',
  pa: 'Pennsylvania',
  pennsylvania: 'Pennsylvania',
  ri: 'Rhode Island',
  'rhode island': 'Rhode Island',
  sc: 'South Carolina',
  'south carolina': 'South Carolina',
  sd: 'South Dakota',
  'south dakota': 'South Dakota',
  tn: 'Tennessee',
  tennessee: 'Tennessee',
  tx: 'Texas',
  texas: 'Texas',
  ut: 'Utah',
  utah: 'Utah',
  vt: 'Vermont',
  vermont: 'Vermont',
  va: 'Virginia',
  virginia: 'Virginia',
  wa: 'Washington',
  washington: 'Washington',
  wv: 'West Virginia',
  'west virginia': 'West Virginia',
  wi: 'Wisconsin',
  wisconsin: 'Wisconsin',
  wy: 'Wyoming',
  wyoming: 'Wyoming',
};

const sectorPatterns = [
  { label: 'Utilities', patterns: [/\butility\b/i, /\butilities\b/i, /\bwater\b/i, /\bpower\b/i, /\belectric\b/i, /\bwastewater\b/i] },
  { label: 'Education / School District', patterns: [/\bschool district\b/i, /\bcommunity college\b/i, /\bccd\b/i, /\beducation\b/i, /\bunified school\b/i] },
  { label: 'City / County', patterns: [/\bcity\b/i, /\bcounty\b/i, /\blocal government\b/i, /\bmunicipal\b/i] },
  { label: 'Healthcare', patterns: [/\bhospital\b/i, /\bhealthcare\b/i, /\bhealth system\b/i, /\bmedical center\b/i] },
  { label: 'Transportation', patterns: [/\btransit\b/i, /\btransportation\b/i, /\bairport\b/i, /\btoll\b/i, /\bport\b/i] },
  { label: 'Housing', patterns: [/\bhousing\b/i, /\bmortgage\b/i, /\bmultifamily\b/i] },
];

const bondTypePatterns = [
  { label: 'Power Revenue Bond', patterns: [/\bpower revenue bond/i, /\belectric revenue bond/i] },
  { label: 'Water Revenue Bond', patterns: [/\bwater revenue bond/i, /\bwastewater revenue bond/i] },
  { label: 'Revenue Bond', patterns: [/\brevenue bond/i, /\brevenue bonds/i] },
  { label: 'General Obligation Bond', patterns: [/\bgeneral obligation/i, /\bgo bond/i, /\bg\.o\. bond/i] },
  { label: 'Lease Revenue Bond', patterns: [/\blease revenue/i, /\bcertificates? of participation/i, /\bcop\b/i] },
  { label: 'Pension Obligation Bond', patterns: [/\bpension obligation/i, /\bpob\b/i] },
  { label: 'Tax Allocation / EIFD Bond', patterns: [/\btax allocation/i, /\beifd\b/i, /\btax increment/i] },
  { label: 'Official Statement / POS', patterns: [/\bofficial statement/i, /\bpreliminary official statement/i, /\bpos\b/i, /\bos\b/i] },
  { label: 'Continuing Disclosure', patterns: [/\bcontinuing disclosure/i, /\bemma annual report/i, /\bevent notice/i] },
];

const keywordPatterns = [
  { label: 'Wildfire exposure', patterns: [/\bwildfire/i, /\bfire risk/i] },
  { label: 'Board minutes / agenda', patterns: [/\bboard minutes/i, /\bboard agenda/i, /\bboard packet/i] },
  { label: 'Bond authorization', patterns: [/\bbond authorization/i, /\bbond resolution/i, /\bnew bond deal/i] },
  { label: 'Municipal advisor / bond counsel', patterns: [/\bmunicipal advisor/i, /\bbond counsel/i, /\bunderwriter/i] },
  { label: 'RFP / procurement', patterns: [/\brfp\b/i, /\brequest for proposal/i, /\bprocurement/i] },
  { label: 'Rating action', patterns: [/\brating action/i, /\boutlook\b/i, /\bupgrade\b/i, /\bdowngrade\b/i] },
  { label: 'ACFR / audited financials', patterns: [/\bacfr\b/i, /\baudit/i, /\baudited financial/i] },
  { label: 'Debt service coverage', patterns: [/\bdsc\b/i, /\bdebt service coverage/i, /\brate covenant/i, /\badditional bonds test/i] },
];

const ratingPattern = /\b(Aaa|Aa[1-3]?|AA[+-]?|AAA|A[+-]?|Baa[1-3]?|BBB[+-]?|BB[+-]?|B[+-]?)\b/i;
const cusipPattern = /\b[A-Z0-9]{6}[- ]?[A-Z0-9]{2}[- ]?[A-Z0-9]\b/g;

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function addFacet(facets: UniversalSearchFacet[], facet: UniversalSearchFacet) {
  const key = `${facet.type}:${normalize(facet.value)}`;
  if (facets.some((item) => `${item.type}:${normalize(item.value)}` === key)) return;
  facets.push(facet);
}

function issuerScore(query: string, issuer: IssuerIndexItem) {
  const normalizedQuery = normalize(query);
  let best = 0;

  for (const alias of [issuer.canonicalName, ...issuer.aliases]) {
    const normalizedAlias = normalize(alias);
    if (!normalizedAlias) continue;
    if (normalizedQuery === normalizedAlias) best = Math.max(best, 100);
    if (normalizedQuery.includes(normalizedAlias)) best = Math.max(best, 92);
    if (normalizedAlias.includes(normalizedQuery) && normalizedQuery.length >= 4) best = Math.max(best, 85);
  }

  return best;
}

function detectIssuer(query: string) {
  return issuerIndex
    .map((issuer) => ({ issuer, score: issuerScore(query, issuer) }))
    .filter((item) => item.score >= 80)
    .sort((a, b) => b.score - a.score)[0];
}

function detectStates(query: string) {
  const normalizedQuery = ` ${normalize(query)} `;
  const matches = new Set<string>();

  Object.entries(stateAliases).forEach(([alias, state]) => {
    const normalizedAlias = ` ${normalize(alias)} `;
    if (normalizedAlias.trim().length <= 2) {
      const strict = new RegExp(`\\b${alias}\\b`, 'i');
      if (strict.test(query)) matches.add(state);
      return;
    }
    if (normalizedQuery.includes(normalizedAlias)) matches.add(state);
  });

  return [...matches];
}

function detectTicker(query: string, primaryIssuer?: IssuerIndexItem) {
  const tokens = query.match(/\b[A-Z]{2,6}\b/g) ?? [];
  const knownAliases = new Set(
    issuerIndex.flatMap((issuer) => issuer.aliases.map((alias) => alias.toUpperCase()))
  );
  const ratings = new Set(['AAA', 'AA', 'A', 'BBB', 'BB', 'B']);

  return tokens.find((token) =>
    !ratings.has(token) &&
    !knownAliases.has(token) &&
    !primaryIssuer?.aliases.some((alias) => alias.toUpperCase() === token)
  );
}

function inferIntent(facets: UniversalSearchFacet[]) {
  const types = new Set(facets.map((facet) => facet.type));
  const values = facets.map((facet) => facet.value).join(' ').toLowerCase();

  if (types.has('cusip') || /official statement|continuing disclosure|revenue bond|go bond|bond/i.test(values)) {
    return {
      intent: 'debt-document-search',
      intentLabel: 'Debt / Document Search',
      recommendedPromptMode: 'debt-bond-research',
      recommendedSource: 'EMMA / MSRB',
    };
  }
  if (/wildfire|rating action|rfp|bond counsel|municipal advisor|board minutes|bond authorization/i.test(values)) {
    return {
      intent: 'risk-monitoring',
      intentLabel: 'Risk / Development Monitor',
      recommendedPromptMode: 'risk-news-monitoring',
      recommendedSource: 'all',
    };
  }
  if (types.has('sector') && !types.has('issuer')) {
    return {
      intent: 'sector-search',
      intentLabel: 'Sector Search',
      recommendedPromptMode: 'peer-comparison',
      recommendedSource: 'all',
    };
  }
  return {
    intent: 'issuer-search',
    intentLabel: 'Issuer Search',
    recommendedPromptMode: 'issuer-credit-profile',
    recommendedSource: 'all',
  };
}

function unique(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

export function parseUniversalSearchQuery(query: string): UniversalSearchInterpretation {
  const rawQuery = query.trim();
  const normalizedQuery = normalize(rawQuery);
  const facets: UniversalSearchFacet[] = [];
  const issuerMatch = detectIssuer(rawQuery);
  const primaryIssuer = issuerMatch?.issuer;

  if (primaryIssuer) {
    addFacet(facets, {
      type: 'issuer',
      label: 'Issuer',
      value: primaryIssuer.canonicalName,
      confidence: issuerMatch.score >= 90 ? 'high' : 'medium',
    });

    const matchedAlias = primaryIssuer.aliases.find((alias) => normalize(alias) === normalizedQuery || normalizedQuery.includes(normalize(alias)));
    if (matchedAlias && matchedAlias !== primaryIssuer.canonicalName) {
      addFacet(facets, {
        type: 'alias',
        label: 'Alias',
        value: matchedAlias,
        confidence: 'high',
      });
    }
  }

  for (const match of rawQuery.toUpperCase().match(cusipPattern) ?? []) {
    addFacet(facets, {
      type: 'cusip',
      label: 'CUSIP',
      value: match.replace(/[- ]/g, ''),
      confidence: 'high',
    });
  }

  const ticker = detectTicker(rawQuery, primaryIssuer);
  if (ticker) {
    addFacet(facets, {
      type: 'ticker',
      label: 'Ticker',
      value: ticker,
      confidence: 'medium',
    });
  }

  detectStates(rawQuery).forEach((state) => {
    addFacet(facets, {
      type: 'state',
      label: 'State',
      value: state,
      confidence: 'high',
    });
  });

  sectorPatterns.forEach((sector) => {
    if (sector.patterns.some((pattern) => pattern.test(rawQuery))) {
      addFacet(facets, {
        type: 'sector',
        label: 'Sector',
        value: sector.label,
        confidence: 'high',
      });
    }
  });

  bondTypePatterns.forEach((bondType) => {
    if (bondType.patterns.some((pattern) => pattern.test(rawQuery))) {
      addFacet(facets, {
        type: 'bond_type',
        label: 'Bond Type',
        value: bondType.label,
        confidence: 'high',
      });
    }
  });

  keywordPatterns.forEach((keyword) => {
    if (keyword.patterns.some((pattern) => pattern.test(rawQuery))) {
      addFacet(facets, {
        type: 'keyword',
        label: 'Keyword',
        value: keyword.label,
        confidence: 'high',
      });
    }
  });

  const rating = rawQuery.match(ratingPattern)?.[0];
  if (rating) {
    addFacet(facets, {
      type: 'rating',
      label: 'Rating',
      value: rating.toUpperCase(),
      confidence: 'medium',
    });
  }

  if (rawQuery.split(/\s+/).length >= 4 || /\b(exposed|find|show|compare|monitor|recent|latest|risk)\b/i.test(rawQuery)) {
    addFacet(facets, {
      type: 'natural_language',
      label: 'Natural Language',
      value: rawQuery,
      confidence: 'medium',
    });
  }

  if (primaryIssuer) {
    addFacet(facets, {
      type: 'sector',
      label: 'Sector',
      value: primaryIssuer.sector,
      confidence: 'medium',
    });
    addFacet(facets, {
      type: 'state',
      label: 'State',
      value: primaryIssuer.state,
      confidence: 'medium',
    });
  }

  const intent = inferIntent(facets);
  const canonicalQuery = primaryIssuer?.canonicalName || rawQuery;
  const sectorValues = facets.filter((facet) => facet.type === 'sector').map((facet) => facet.value);
  const stateValues = facets.filter((facet) => facet.type === 'state').map((facet) => facet.value);
  const bondTypeValues = facets.filter((facet) => facet.type === 'bond_type').map((facet) => facet.value);
  const keywordValues = facets.filter((facet) => facet.type === 'keyword').map((facet) => facet.value);
  const cusips = facets.filter((facet) => facet.type === 'cusip').map((facet) => facet.value);
  const expandedQueries = unique([
    rawQuery,
    primaryIssuer?.canonicalName,
    ...(primaryIssuer?.aliases ?? []),
    ...(primaryIssuer?.bondTypes ?? []).map((bondType) => `${primaryIssuer?.canonicalName} ${bondType}`),
    ...cusips.map((cusip) => `${cusip} EMMA MSRB official statement`),
    ...sectorValues.map((sector) => `${stateValues[0] ?? ''} ${sector} municipal bonds`.trim()),
    ...bondTypeValues.map((bondType) => `${canonicalQuery} ${bondType} official statement EMMA`),
    ...keywordValues.map((keyword) => `${canonicalQuery} ${keyword}`),
  ]).slice(0, 12);

  const summary = facets.length > 0
    ? `Understood as ${intent.intentLabel.toLowerCase()}: ${facets.slice(0, 5).map((facet) => `${facet.label}: ${facet.value}`).join('; ')}.`
    : 'Use any issuer name, alias, CUSIP, ticker, sector, bond type, state, keyword, or natural-language question.';

  return {
    rawQuery,
    normalizedQuery,
    canonicalQuery,
    primaryIssuer,
    facets,
    expandedQueries,
    summary,
    ...intent,
  };
}

export function universalSearchContextLines(interpretation: UniversalSearchInterpretation) {
  return [
    `Universal search interpretation: ${interpretation.summary}`,
    `Canonical query: ${interpretation.canonicalQuery || interpretation.rawQuery}`,
    `Detected facets: ${interpretation.facets.map((facet) => `${facet.label}=${facet.value}`).join('; ') || 'none'}`,
    `Recommended workflow: ${interpretation.intentLabel}; prompt mode=${interpretation.recommendedPromptMode}; source=${interpretation.recommendedSource}`,
    `Expanded search terms: ${interpretation.expandedQueries.join(' | ') || interpretation.rawQuery}`,
  ];
}

export function scoreUniversalSearchItem(item: Record<string, unknown>, interpretation: UniversalSearchInterpretation) {
  const text = normalize([
    item.title,
    item.topic,
    item.source,
    item.summary,
    item.snippet,
    ...(Array.isArray(item.facts) ? item.facts : []),
  ].join(' '));
  let score = 0;

  if (!interpretation.rawQuery) return Number(item.score ?? 0);
  if (text.includes(interpretation.normalizedQuery)) score += 30;

  interpretation.facets.forEach((facet) => {
    const value = normalize(facet.value);
    if (!value) return;
    if (text.includes(value)) score += facet.confidence === 'high' ? 18 : 10;
    if (facet.type === 'sector' && text.includes(normalize(facet.label))) score += 4;
  });

  interpretation.expandedQueries.forEach((query) => {
    const normalized = normalize(query);
    if (normalized && text.includes(normalized)) score += 6;
  });

  return score + Number(item.score ?? 0);
}

export function rankUniversalSearchItems<T extends Record<string, unknown>>(items: T[], query: string) {
  const interpretation = parseUniversalSearchQuery(query);
  return [...items]
    .map((item) => ({
      item,
      score: scoreUniversalSearchItem(item, interpretation),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({
      ...item,
      score: Math.max(Number(item.score ?? 0), Math.min(Math.round(score), 100)),
    }));
}
