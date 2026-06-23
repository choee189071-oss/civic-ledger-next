import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SONAR_URL = 'https://api.perplexity.ai/v1/sonar';

function apiErrorMessage(payload: any, status: number) {
  if (payload?.error?.message) return payload.error.message;
  if (payload?.message) return payload.message;
  if (typeof payload?.detail === 'string') return payload.detail;
  return `Perplexity API error: ${status}`;
}

function responseText(payload: any) {
  return payload?.choices?.[0]?.message?.content?.trim() || 'No update text returned.';
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
  const issuer = String(body.issuer ?? '').trim();

  if (!issuer) {
    return NextResponse.json({ error: 'Issuer is required.' }, { status: 400 });
  }

  const model = process.env.PUBFIN_MODEL || 'sonar-pro';
  const timestamp = new Date().toISOString();

  const system = [
    'You are Civic Ledger, a municipal finance monitoring analyst.',
    'Check current public web evidence for one California community college district issuer.',
    'Focus on material recent developments from 2025-2026 unless an older item is clearly still relevant.',
    'Material developments include rating actions, outlook changes, bond issuance, official statements, EMMA/MSRB continuing disclosure, board actions, budgets, enrollment, state funding, labor, capital projects, facilities bonds, litigation, accreditation, governance, or audit issues.',
    'Return exactly one concise issuer update. Use 2-3 sentences only.',
    'If no material issuer-specific development is found, say that clearly in 1-2 sentences and mention what source types were checked.',
    'Do not invent developments. Include at least one source name or URL when a development is found.',
    'This is a monitoring update, not a credit opinion.',
  ].join('\n');

  const user = [
    `Issuer: ${issuer}`,
    `Timestamp: ${timestamp}`,
    '',
    'Search task:',
    `Find whether ${issuer} has any recent material development for credit/research monitoring.`,
    'Prioritize rating agencies, EMMA/MSRB, official statements, district board/budget pages, official district news, CCCCO materials, and credible municipal market sources.',
    '',
    'Output format:',
    `### ${issuer}`,
    'Status: Development found / No material update found / Needs manual verification',
    'Update: 2-3 sentences with date, source, and why it matters.',
    'Source: source name and URL if available.',
  ].join('\n');

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
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 650,
      temperature: 0.1,
      web_search_options: {
        search_context_size: 'medium',
      },
    }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json({ error: apiErrorMessage(payload, res.status) }, { status: res.status });
  }

  return NextResponse.json({
    issuer,
    timestamp,
    update: responseText(payload),
    citations: payload.citations ?? [],
    searchResults: payload.search_results ?? [],
    model: payload.model || model,
    usage: payload.usage ?? null,
  });
}
