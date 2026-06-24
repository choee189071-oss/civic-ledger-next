import { NextResponse } from 'next/server';

const SOURCES = [
  {
    id: 'emma-msrb',
    name: 'EMMA / MSRB',
    topic: 'Disclosure',
    trust: 'Official Tier 1',
    freshness: 'Ongoing',
    url: 'https://emma.msrb.org',
    apiUrl: null,
    description:
      'Official municipal market disclosure portal for official statements, continuing disclosures, CUSIPs, and issuer disclosure trails. No stable public REST API is configured yet, so the platform prioritizes EMMA through domain-targeted search.',
    keyFacts: [
      'Highest-priority source for municipal disclosure documents.',
      'Used as preferred domain search: site:emma.msrb.org.',
      'Best source for OS/POS, continuing disclosure, CUSIP, and filing trails.',
      'Connector status: preferred official search domain until a stable MSRB API or subscription feed is added.',
    ],
    live: false,
  },
  {
    id: 'usaspending',
    name: 'USAspending',
    topic: 'Federal Awards',
    trust: 'Official',
    freshness: 'API live',
    url: 'https://www.usaspending.gov',
    apiUrl: 'https://api.usaspending.gov',
    description:
      'Official U.S. federal spending API. Useful for federal grant exposure, recipient award searches, and public-sector funding analysis.',
    keyFacts: [
      'No API key required for current public endpoints.',
      'Integrated through recipient award search.',
      'Used as Tier 2 evidence for federal grants and award exposure.',
      'Complements, but does not replace, EMMA/MSRB disclosure evidence.',
    ],
    live: true,
  },
  {
    id: 'debtwatch',
    name: 'DebtWatch',
    topic: 'Bonds',
    trust: 'Official',
    freshness: 'Ongoing',
    url: 'https://debtwatch.treasurer.ca.gov',
    apiUrl: null,
    description:
      'California Treasurer debt data portal. Used as a preferred search source for California debt issuance, outstanding debt, and issuer bond context.',
    keyFacts: [
      'Official California debt issuance starting point.',
      'Used as preferred domain search: site:debtwatch.treasurer.ca.gov.',
      'Useful for California issuer debt checks and bond context.',
    ],
    live: false,
  },
  {
    id: 'sco-bythenumbers',
    name: 'SCO ByTheNumbers',
    topic: 'Local Financials',
    trust: 'Official',
    freshness: 'Annual / as reported',
    url: 'https://bythenumbers.sco.ca.gov',
    apiUrl: null,
    description:
      'California State Controller local government financial data portal for cities, counties, special districts, transit operators, and other local entities.',
    keyFacts: [
      'Important source for California local government revenue and expenditure context.',
      'Used as preferred domain search: site:bythenumbers.sco.ca.gov.',
      'Source data is posted as submitted by local governments.',
    ],
    live: false,
  },
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
    id: 'ckan-datastore',
    name: 'CKAN / Data.gov',
    topic: 'Open Data',
    trust: 'Official API framework',
    freshness: 'Dataset dependent',
    url: 'https://docs.ckan.org/en/latest/maintaining/datastore.html',
    apiUrl: 'https://data.ca.gov/api/3/action/datastore_search',
    description:
      'CKAN DataStore API framework used by data.ca.gov and other open-data portals. The platform uses CKAN for Open FI$Cal today and can extend to additional state datasets through filters or SQL search where enabled.',
    keyFacts: [
      'Supports datastore_search with filters for structured lookup.',
      'Some portals support datastore_search_sql, but SQL search must be enabled by the host.',
      'Useful for future revenue, vendor, fund balance, and open-data connectors.',
    ],
    live: true,
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
