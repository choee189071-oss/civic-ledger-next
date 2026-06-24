import { NextResponse } from 'next/server';
import { searchFiscal } from '../../../lib/fiscal-api';
import { results as mockResults } from '../../../lib/mock-data';
import { searchUsaSpending } from '../../../lib/usaspending-api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const source = searchParams.get('source') || 'all';

  if (source === 'USAspending') {
    try {
      const endDate = new Date().toISOString().slice(0, 10);
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      const records = await searchUsaSpending({
        query: q,
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
        meta: { total: records.length, q, limit, offset, dataSource: 'usaspending' },
      });
    } catch (err) {
      return NextResponse.json({
        items: [],
        meta: { total: 0, q, dataSource: 'usaspending-error', error: String(err) },
      });
    }
  }

  // If user is filtering for a non-fiscal source, fall back to mock data
  if (source !== 'all' && source !== 'Open FI$Cal') {
    const filtered = mockResults.filter((r) =>
      source === 'all' || r.source === source
    );
    return NextResponse.json({
      items: filtered,
      meta: { total: filtered.length, q, source, dataSource: 'mock' },
    });
  }

  try {
    const { records, total } = await searchFiscal({ q, limit, offset });

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

    return NextResponse.json({
      items,
      meta: { total, q, limit, offset, dataSource: 'open-fiscal' },
    });
  } catch (err) {
    console.error('[search] Open FI$Cal fetch failed, falling back to mock:', err);
    return NextResponse.json({
      items: mockResults,
      meta: { total: mockResults.length, q, dataSource: 'mock-fallback', error: String(err) },
    });
  }
}
