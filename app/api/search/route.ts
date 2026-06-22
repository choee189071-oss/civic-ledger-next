import { NextResponse } from 'next/server';
import { results } from '../../../lib/mock-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const topic = searchParams.get('topic') || 'all';
  const source = searchParams.get('source') || 'all';
  const sort = searchParams.get('sort') || 'score';

  const filtered = results
    .filter((item) => {
      const haystack = [
        item.title, item.topic, item.source,
        item.summary, item.snippet,
        ...item.facts, ...item.citations
      ].join(' ').toLowerCase();
      const matchesQuery = !q || q.split(/\s+/).every((term) => haystack.includes(term));
      const matchesTopic = topic === 'all' || item.topic === topic;
      const matchesSource = source === 'all' || item.source === source;
      return matchesQuery && matchesTopic && matchesSource;
    })
    .sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'freshness') return b.freshnessRank - a.freshnessRank;
      return b.score - a.score;
    });

  return NextResponse.json({
    items: filtered,
    meta: { total: filtered.length, q, topic, source, sort }
  });
}
