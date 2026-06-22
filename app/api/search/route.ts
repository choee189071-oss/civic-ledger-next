import { NextResponse } from 'next/server';
import { searchFiscal } from '../../../lib/fiscal-api';
import { results as mockResults } from '../../../lib/mock-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const source = searchParams.get('source') || 'all';

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
