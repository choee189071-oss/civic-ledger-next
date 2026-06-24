import { NextResponse } from 'next/server';
import { searchFiscal } from '../../../lib/fiscal-api';
import { results as mockResults } from '../../../lib/mock-data';
import { searchUsaSpending } from '../../../lib/usaspending-api';
import {
  parseUniversalSearchQuery,
  rankUniversalSearchItems,
  type UniversalSearchInterpretation,
} from '../../../lib/universal-search';

const sourcePortalUrls: Record<string, string> = {
  'EMMA / MSRB': 'https://emma.msrb.org',
  USAspending: 'https://www.usaspending.gov/search',
  DebtWatch: 'https://debtwatch.treasurer.ca.gov',
  'SCO ByTheNumbers': 'https://bythenumbers.sco.ca.gov',
  'Open FI$Cal': 'https://open.fiscal.ca.gov',
  'California Budget': 'https://ebudget.ca.gov',
  CDIAC: 'https://www.treasurer.ca.gov/cdiac',
  'CKAN / Data.gov': 'https://data.ca.gov',
  'Debt Line': 'https://www.treasurer.ca.gov/cdiac/debtline',
};

function shouldUseOpenFiscal(q: string, source: string, interpretation: UniversalSearchInterpretation) {
  const text = q;
  return source === 'Open FI$Cal' || /\b(spending|expenditure|department|vendor|payee|fund|program|fiscal)\b/i.test(text);
}

function applyTopicFilter(items: any[], topic: string) {
  if (!topic || topic === 'all') return items;
  return items.filter((item) => item.topic === topic || String(item.summary ?? '').includes(topic));
}

function sortItems(items: any[], sort: string) {
  if (sort === 'title') return [...items].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  if (sort === 'freshness') return [...items].sort((a, b) => Number(b.freshnessRank ?? 0) - Number(a.freshnessRank ?? 0));
  return [...items].sort((a, b) => {
    const priority = (item: any) => item.kind === 'universal-search'
      ? 3
      : item.kind === 'issuer-index-match'
        ? 2
        : item.kind === 'cusip-search-route' || item.kind === 'source-specific-route'
          ? 1
          : 0;
    return priority(b) - priority(a) || Number(b.score ?? 0) - Number(a.score ?? 0);
  });
}

function universalSearchItems(
  q: string,
  interpretation: UniversalSearchInterpretation,
  source: string
) {
  const facets = interpretation.facets.map((facet) => `${facet.label}: ${facet.value}`);
  const citations = source !== 'all' && sourcePortalUrls[source]
    ? [sourcePortalUrls[source]]
    : [
      'https://emma.msrb.org',
      'https://debtwatch.treasurer.ca.gov',
      'https://bythenumbers.sco.ca.gov',
      'https://data.ca.gov',
    ];
  const items = [
    {
      id: `universal-${encodeURIComponent(q || 'search')}`,
      kind: 'universal-search',
      title: interpretation.canonicalQuery || q || 'Universal municipal search',
      topic: interpretation.intentLabel,
      source: 'Universal Search',
      score: 99,
      freshnessRank: 5,
      summary: interpretation.summary,
      snippet: [
        'Universal Search can start from issuer names, aliases, CUSIP, ticker, sector, bond type, state, keywords, or natural-language questions.',
        `Recommended workflow: ${interpretation.intentLabel}.`,
      ].join(' '),
      facts: [
        `Canonical query: ${interpretation.canonicalQuery || q}`,
        `Recommended mode: ${interpretation.recommendedPromptMode}`,
        `Recommended source: ${source !== 'all' ? source : interpretation.recommendedSource}`,
        ...facets,
        ...interpretation.expandedQueries.slice(0, 5).map((query) => `Expanded query: ${query}`),
      ],
      citations,
      universalSearch: interpretation,
    },
  ];

  if (interpretation.primaryIssuer) {
    items.push({
      id: `issuer-${encodeURIComponent(interpretation.primaryIssuer.canonicalName)}`,
      kind: 'issuer-index-match',
      title: `${interpretation.primaryIssuer.canonicalName} issuer file`,
      topic: 'Issuer Match',
      source: 'Issuer Index',
      score: 96,
      freshnessRank: 4,
      summary: `${interpretation.primaryIssuer.canonicalName} matched from aliases including ${interpretation.primaryIssuer.aliases.slice(0, 3).join(', ')}.`,
      snippet: `Sector: ${interpretation.primaryIssuer.sector}. State: ${interpretation.primaryIssuer.state}. Typical bond types: ${(interpretation.primaryIssuer.bondTypes ?? []).join(', ') || 'Not classified'}.`,
      facts: [
        `Legal / canonical name: ${interpretation.primaryIssuer.canonicalName}`,
        `Sector: ${interpretation.primaryIssuer.sector}`,
        `State: ${interpretation.primaryIssuer.state}`,
        `Aliases: ${interpretation.primaryIssuer.aliases.join(', ')}`,
      ],
      citations,
      universalSearch: interpretation,
    });
  }

  if (interpretation.facets.some((facet) => facet.type === 'cusip')) {
    items.push({
      id: `cusip-${encodeURIComponent(interpretation.rawQuery)}`,
      kind: 'cusip-search-route',
      title: 'CUSIP disclosure route',
      topic: 'Disclosure',
      source: 'EMMA / MSRB',
      score: 95,
      freshnessRank: 5,
      summary: 'CUSIP detected. Prioritize EMMA/MSRB official statements, continuing disclosure, event notices, and trade/disclosure history.',
      snippet: 'Use this route when the query starts from a bond identifier rather than an issuer name.',
      facts: [
        ...facets,
        'Primary next step: search EMMA/MSRB by CUSIP and issuer name.',
        'Verify dated date, closing date, filing entity, and EMMA submission ID before final use.',
      ],
      citations: ['https://emma.msrb.org'],
      universalSearch: interpretation,
    });
  }

  if (source !== 'all' && sourcePortalUrls[source]) {
    items.push({
      id: `source-${encodeURIComponent(source)}-${encodeURIComponent(q || 'search')}`,
      kind: 'source-specific-route',
      title: `${source} search route`,
      topic: 'Source Route',
      source,
      score: 93,
      freshnessRank: 5,
      summary: `Use ${source} as the preferred source for ${interpretation.canonicalQuery || q}.`,
      snippet: `Expanded search terms: ${interpretation.expandedQueries.slice(0, 4).join(' | ') || q}.`,
      facts: [
        `Preferred source: ${source}`,
        ...facets,
      ],
      citations: [sourcePortalUrls[source]],
      universalSearch: interpretation,
    });
  }

  return items;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const source = searchParams.get('source') || 'all';
  const topic = searchParams.get('topic') || 'all';
  const sort = searchParams.get('sort') || 'score';
  const interpretation = parseUniversalSearchQuery(q);

  if (source === 'USAspending') {
    try {
      const endDate = new Date().toISOString().slice(0, 10);
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      const records = await searchUsaSpending({
        query: interpretation.canonicalQuery || q,
        startDate: start.toISOString().slice(0, 10),
        endDate,
        limit: Math.min(limit, 10),
      });

      return NextResponse.json({
        items: records.map((record) => ({
          id: record.id || record.url,
          title: record.title,
          topic: 'Federal Awards',
          source: 'USAspending',
          score: 92,
          summary: record.summary,
          snippet: record.summary,
          citations: [record.url],
          facts: [
            record.recipientName && `Recipient: ${record.recipientName}`,
            record.awardingAgency && `Awarding agency: ${record.awardingAgency}`,
            record.awardAmount ? `Award amount: $${record.awardAmount.toLocaleString()}` : null,
          ].filter(Boolean),
        })),
        meta: { total: records.length, q, limit, offset, dataSource: 'usaspending', universalSearch: interpretation },
      });
    } catch (err) {
      return NextResponse.json({
        items: universalSearchItems(q, interpretation, source),
        meta: { total: 0, q, dataSource: 'usaspending-error', error: String(err), universalSearch: interpretation },
      });
    }
  }

  // If user is filtering for a non-fiscal source, fall back to mock data
  if (source !== 'all' && source !== 'Open FI$Cal') {
    const filtered = [
      ...universalSearchItems(q, interpretation, source),
      ...rankUniversalSearchItems(mockResults, q).filter((r) =>
        source === 'all' || r.source === source || source === interpretation.recommendedSource
      ),
    ];
    return NextResponse.json({
      items: sortItems(applyTopicFilter(filtered, topic), sort),
      meta: { total: filtered.length, q, source, dataSource: 'universal-source-route', universalSearch: interpretation },
    });
  }

  if (source === 'all' && !shouldUseOpenFiscal(q, source, interpretation)) {
    const items = [
      ...universalSearchItems(q, interpretation, source),
      ...rankUniversalSearchItems(mockResults, q),
    ];

    return NextResponse.json({
      items: sortItems(applyTopicFilter(items, topic), sort).slice(offset, offset + limit),
      meta: { total: items.length, q, limit, offset, dataSource: 'universal-search', universalSearch: interpretation },
    });
  }

  try {
    const { records, total } = await searchFiscal({ q: interpretation.canonicalQuery || q, limit, offset });

    const items = records.map((r) => ({
      id: r.id,
      title: r.department || '(No Department)',
      topic: 'Expenditures',
      source: 'Open FI$Cal',
      fiscalYear: r.fiscalYear,
      program: r.program,
      fund: r.fund,
      amount: r.amount,
      accountCategory: r.accountCategory,
      summary: `${r.department} — ${r.program} — FY ${r.fiscalYear}`,
      snippet: `Fund: ${r.fund} | Category: ${r.accountCategory} | Amount: $${r.amount.toLocaleString()}`,
    }));
    const combined = source === 'Open FI$Cal'
      ? [...universalSearchItems(q, interpretation, source), ...items]
      : items;

    return NextResponse.json({
      items: sortItems(applyTopicFilter(combined, topic), sort),
      meta: { total, q, limit, offset, dataSource: 'open-fiscal', universalSearch: interpretation },
    });
  } catch (err) {
    console.error('[search] Open FI$Cal fetch failed, falling back to mock:', err);
    const items = [
      ...universalSearchItems(q, interpretation, source),
      ...rankUniversalSearchItems(mockResults, q),
    ];
    return NextResponse.json({
      items: sortItems(applyTopicFilter(items, topic), sort),
      meta: { total: items.length, q, dataSource: 'universal-fallback', error: String(err), universalSearch: interpretation },
    });
  }
}
