import type { ReadingDocument, ResearchRecord, SourceCatalogItem } from './types/public-finance';

export type Source = SourceCatalogItem;
export type Result = ResearchRecord;
export type Reading = ReadingDocument;

export const sources: Source[] = [
  {
    id: 'src-open-fiscal',
    name: 'Open FI$Cal',
    topic: 'Expenditures',
    trust: 'Official',
    freshness: 'Monthly updates',
    description: "California's financial transparency portal for monitoring state spending and downloading expenditure data.",
    keyFacts: [
      'Lets the public monitor state spending.',
      'Provides downloadable expenditure data.',
      'Supports exploration of departments, programs, and spending records.'
    ]
  },
  {
    id: 'src-budget',
    name: 'California Budget',
    topic: 'Budget',
    trust: 'Official',
    freshness: 'Budget-year based',
    description: 'Official California budget entry point for proposed, revised, and enacted budget materials.',
    keyFacts: [
      'Provides the California Budget entry point.',
      'Used for fiscal-year framing.',
      'Pairs well with detailed expenditure lookup.'
    ]
  },
  {
    id: 'src-cdiac',
    name: 'CDIAC',
    topic: 'Disclosure',
    trust: 'Official',
    freshness: 'Ongoing',
    description: "Public-finance resource hub from the State Treasurer's office for debt issuance, filings, and guidance.",
    keyFacts: [
      'Includes debt issuance reporting resources.',
      'Offers debt data and reference guides.',
      'Useful for issuer and disclosure research.'
    ]
  },
  {
    id: 'src-debt-line',
    name: 'Debt Line',
    topic: 'Bonds',
    trust: 'Official newsletter',
    freshness: 'Monthly',
    description: 'Monthly CDIAC newsletter listing proposed and sold debt issues plus related public-finance articles.',
    keyFacts: [
      'Contains a calendar of proposed and sold debt issues.',
      'Supports bond-market oriented monitoring.',
      'Useful bridge from filings to narrative analysis.'
    ]
  }
];

export const results: Result[] = [
  {
    id: 'r1',
    title: 'Department expenditure lookup workflow',
    topic: 'Expenditures',
    source: 'Open FI$Cal',
    score: 97,
    freshnessRank: 3,
    summary: 'Start with Open FI$Cal when the user asks which departments spent money, how much was spent, or what records can be downloaded.',
    snippet: 'The source is strongest when the question is about monitoring state spending, downloading data, or navigating department expenditure records.',
    facts: [
      'Best first stop for state expenditure lookup.',
      'Supports raw data download and exploration.',
      'Pairs with budget sources for narrative context.'
    ],
    citations: ['Open FI$Cal', 'Download Expenditures']
  },
  {
    id: 'r2',
    title: 'Budget entry-point workflow',
    topic: 'Budget',
    source: 'California Budget',
    score: 94,
    freshnessRank: 2,
    summary: 'Use California Budget first when the user needs official framing for a fiscal year, proposed budget, or revised budget discussion.',
    snippet: 'The strongest use case is fiscal-year context, official summaries, and understanding where a policy or reserve discussion sits in the budget cycle.',
    facts: [
      'Best first stop for annual budget framing.',
      'Provides the official California Budget landing point.',
      'Pairs with spending and debt sources for verification.'
    ],
    citations: ['California Budget', 'Budget pages']
  },
  {
    id: 'r3',
    title: 'Debt issuance and filing workflow',
    topic: 'Disclosure',
    source: 'CDIAC',
    score: 91,
    freshnessRank: 4,
    summary: 'Route users to CDIAC when they ask about debt issuance reporting, filing workflows, issuer guidance, or disclosure-related resources.',
    snippet: 'This source is a strong debt and disclosure hub because it provides reporting paths, guidance, and California public-finance resources.',
    facts: [
      'Best first stop for California debt and disclosure questions.',
      'Supports issuer reporting and guidance use cases.',
      'Adds professional public-finance context beyond general budget pages.'
    ],
    citations: ['CDIAC', 'Debt reporting']
  },
  {
    id: 'r4',
    title: 'Monthly debt issue monitoring',
    topic: 'Bonds',
    source: 'Debt Line',
    score: 86,
    freshnessRank: 5,
    summary: 'Use Debt Line when the user wants a newsletter-like monitoring workflow around proposed and sold debt issues in California.',
    snippet: 'It works well as a monitoring layer and as a bridge from filings to bond-oriented reading and calendar tracking.',
    facts: [
      'Good for recurring debt-monitoring questions.',
      'Includes proposed and sold debt issue listings.',
      "Complements CDIAC's broader debt guidance."
    ],
    citations: ['Debt Line', 'Monthly newsletter']
  }
];

export const readings: Record<string, Reading> = {
  r1: {
    id: 'r1',
    title: 'Reading: Using expenditure data after a budget question',
    body: [
      'When a user starts with a budget question, they often need to verify whether the narrative shows up in department-level spending records.',
      'The workbench should push them from a summary into a spending view with a source trail and a clear way to inspect records.',
      'This is where Open FI$Cal works as the operational evidence layer.'
    ]
  },
  r2: {
    id: 'r2',
    title: 'Reading: From budget framing to evidence',
    body: [
      'A budget answer should start with official fiscal-year framing, then branch into spending or debt evidence depending on the question.',
      'The reading desk should keep the narrative and the evidence trail side by side.',
      'That pattern is important for public-finance trust and explainability.'
    ]
  },
  r3: {
    id: 'r3',
    title: 'Reading: From budget to debt workflow',
    body: [
      'Some research questions start with budget language but quickly move into financing structure, reporting obligations, or issuer-level disclosure.',
      'The product should make that transition explicit rather than forcing the user to restart the search from scratch.',
      'CDIAC is the right bridge for that workflow.'
    ]
  },
  r4: {
    id: 'r4',
    title: 'Reading: Monitoring debt issues over time',
    body: [
      'A serious muni workflow needs more than one-off answers; it needs a repeatable monitoring rhythm.',
      'Debt Line acts as a recurring observation layer for debt issues and related interpretation.',
      'That makes it useful for saved briefs and future watchlists.'
    ]
  }
};
