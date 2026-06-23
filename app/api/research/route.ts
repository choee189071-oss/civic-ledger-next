import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type SonarSearchResult = {
  title?: string;
  url?: string;
  date?: string;
  last_updated?: string;
  snippet?: string;
  source?: string;
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

function firstParagraph(content: string) {
  return content
    .split(/\n{2,}/)
    .map((part) => part.replace(/^#+\s*/, '').trim())
    .find(Boolean) ?? content.slice(0, 260);
}

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
      return `${label}${date ? ` (${date})` : ''}${snippet}`;
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

  if (!query) {
    return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
  }

  const model = process.env.PUBFIN_MODEL || 'sonar-pro';

  const prompt = [
    'You are Civic Ledger, a public-finance research assistant.',
    'Use current public web sources to answer questions about municipal finance, public issuers, budgets, audited financial statements, official statements, debt issuance, ratings, and disclosure.',
    'Answer in the same language as the user.',
    'Be concise, source-grounded, and explicit about dates.',
    'If current evidence is insufficient, say what is missing instead of guessing.',
    'Format the answer as a short research memo with: Current answer, Evidence, Gaps, Next step.',
  ].join('\n');

  const userContent = [
    `Question: ${query}`,
    `Preferred topic filter: ${topic}`,
    `Preferred source filter: ${source}`,
    'Find the freshest credible public sources and include source names and links.',
  ].join('\n');

  const [res, searchRes] = await Promise.all([
    fetch(SONAR_URL, {
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
        max_tokens: 1600,
        temperature: 0.2,
        web_search_options: {
          search_mode: 'web',
          return_related_questions: true,
          enable_search_classifier: false,
        },
      }),
    }),
    fetch(SEARCH_URL, {
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
    }),
  ]);

  const payload = await res.json().catch(() => ({}));
  const searchPayload = await searchRes.json().catch(() => ({}));

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
  const searchResults = mergeSearchResults(
    sonar.search_results ?? [],
    searchRes.ok ? searchPayload.results ?? [] : []
  );
  const citations = mergeSearchResults(
    (sonar.citations ?? []).map((url) => ({ url })),
    searchResults
  ).map((result) => result.url).filter(Boolean) as string[];
  const facts = sourceFacts(searchResults);

  return NextResponse.json({
    record: {
      id: `research-${Date.now()}`,
      kind: 'research',
      title: query,
      topic: topic === 'all' ? 'Live Research' : topic,
      source: 'Perplexity Sonar',
      score: 100,
      summary: firstParagraph(content),
      snippet: content,
      facts: facts.length > 0 ? facts : ['Perplexity returned an answer, but no source snippets were included.'],
      citations,
      searchResults,
      relatedQuestions: sonar.related_questions ?? [],
      generatedAt: new Date().toISOString(),
      model: sonar.model || model,
      usage: sonar.usage ?? null,
    },
  });
}
