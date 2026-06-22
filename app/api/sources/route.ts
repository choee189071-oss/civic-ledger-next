import { NextResponse } from 'next/server';

const SOURCES = [
  {
    id: 'open-fiscal',
    name: 'Open FI$Cal',
    topic: 'Expenditures',
    trust: 'Official',
    freshness: 'Monthly (60-day lag)',
    url: 'https://open.fiscal.ca.gov',
    apiUrl: 'https://data.ca.gov/api/3/action/datastore_search',
    description:
      "California's financial transparency portal. Covers 184 business units (~79% of state expenditures). Data updated monthly via CKAN API — no API key required.",
    keyFacts: [
      'Covers ~79% of California state expenditures.',
      'Updated monthly with a ~60-day lag.',
      'Accessible via CKAN API on data.ca.gov.',
      'Includes spending and vendor transaction datasets.',
    ],
    live: true,
  },
  {
    id: 'ca-budget',
    name: 'California Budget',
    topic: 'Budget',
    trust: 'Official',
    freshness: 'Budget-year based',
    url: 'https://www.ebudget.ca.gov',
    apiUrl: null,
    description:
      'Official California Governor\'s Budget. Provides proposed, revised, and enacted budget materials by fiscal year. No machine-readable API — data available as PDF/web.',
    keyFacts: [
      'Official source for annual California budget framing.',
      'Covers proposed, revised, and enacted budgets.',
      'No REST API — manual download or scraping required.',
    ],
    live: false,
  },
  {
    id: 'cdiac',
    name: 'CDIAC',
    topic: 'Disclosure',
    trust: 'Official',
    freshness: 'Ongoing',
    url: 'https://www.treasurer.ca.gov/cdiac',
    apiUrl: null,
    description:
      "California Debt and Investment Advisory Commission. Public-finance resource hub for debt issuance, filings, and guidance. Data available via database query interface — no REST API.",
    keyFacts: [
      'Covers 30+ years of California debt issuance data.',
      'Supports issuer reporting and disclosure workflows.',
      'No REST API — data via web query interface and Excel download.',
    ],
    live: false,
  },
  {
    id: 'debt-line',
    name: 'Debt Line',
    topic: 'Bonds',
    trust: 'Official newsletter',
    freshness: 'Monthly',
    url: 'https://www.treasurer.ca.gov/cdiac/debtline.asp',
    apiUrl: null,
    description:
      'Monthly CDIAC newsletter listing proposed and sold debt issues plus public-finance articles. No API — newsletter PDF only.',
    keyFacts: [
      'Monthly calendar of proposed and sold debt issues.',
      'Useful for recurring bond-monitoring workflows.',
      'PDF only — no machine-readable API.',
    ],
    live: false,
  },
];

export async function GET() {
  return NextResponse.json({
    items: SOURCES,
    meta: { total: SOURCES.length, liveCount: SOURCES.filter((s) => s.live).length },
  });
}
