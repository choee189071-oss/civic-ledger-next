import { NextResponse } from 'next/server';
import { buildRecencyScope, noRecentInfoGuide, recencyPrompt } from '../../../../lib/research-recency';
import {
  getPerplexityApiKey,
  getPerplexityModel,
  perplexityApiKeyErrorMessage,
} from '../../../../lib/server-env';

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
  const apiKey = getPerplexityApiKey();

  if (!apiKey) {
    return NextResponse.json(
      {
        error: perplexityApiKeyErrorMessage(),
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const issuer = String(body.issuer ?? '').trim();
  const conditions = Array.isArray(body.conditions)
    ? body.conditions.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];

  if (!issuer) {
    return NextResponse.json({ error: 'Issuer is required.' }, { status: 400 });
  }

  const model = getPerplexityModel();
  const timestamp = new Date().toISOString();
  const recencyScope = buildRecencyScope(new Date(timestamp));

  const system = [
    'You are Civic Ledger, a municipal finance monitoring analyst.',
    'Check current public web evidence for one California community college district issuer.',
    recencyPrompt(recencyScope),
    'Material developments include rating actions, outlook changes, bond issuance, official statements, EMMA/MSRB continuing disclosure, board actions, budgets, enrollment, state funding, labor, capital projects, facilities bonds, litigation, accreditation, governance, or audit issues.',
    'Pay special attention to board meeting minutes and board packets. Bond authorizations, bond resolutions, municipal advisor engagements, bond counsel engagements, RFP approvals, and RFP award results are often found in board materials before news coverage appears.',
    'Return exactly one concise issuer update. Use 2-3 sentences only.',
    noRecentInfoGuide(),
    'Do not invent developments. Include at least one source name or URL when a development is found.',
    'This is a monitoring update, not a credit opinion.',
  ].join('\n');

  const user = [
    `Issuer: ${issuer}`,
    `Timestamp: ${timestamp}`,
    '',
    'Search task:',
    `Find whether ${issuer} has any recent material development for credit/research monitoring.`,
    `First search the quarterly window (${recencyScope.preferredStartDate} to ${recencyScope.asOfDate}). If none, expand to the annual monitoring window (${recencyScope.annualStartDate} to ${recencyScope.asOfDate}) and use three-year context (${recencyScope.structuralStartDate} to ${recencyScope.asOfDate}) only for structural background.`,
    'Prioritize rating agencies, EMMA/MSRB, official statements, district board/budget pages, official district news, CCCCO materials, and credible municipal market sources.',
    'Preferred official source domains to check before general web results:',
    `- EMMA/MSRB: site:emma.msrb.org ${issuer} official statement continuing disclosure`,
    `- DebtWatch: site:debtwatch.treasurer.ca.gov ${issuer} debt issuance bonds`,
    `- CDIAC / Treasurer: site:treasurer.ca.gov/cdiac ${issuer} debt issuance`,
    `- SCO ByTheNumbers: site:bythenumbers.sco.ca.gov ${issuer} financial data`,
    `- USAspending: site:usaspending.gov ${issuer} federal awards grants`,
    conditions.length > 0 ? `Selected monitoring conditions: ${conditions.join(' | ')}` : 'Selected monitoring conditions: all standard recent-development conditions.',
    '',
    'Required board-material checks when available:',
    `- ${issuer} board meeting minutes bond authorization bond resolution since ${recencyScope.preferredStartDate}`,
    `- ${issuer} board agenda municipal advisor bond counsel since ${recencyScope.preferredStartDate}`,
    `- ${issuer} RFP bond counsel municipal advisor underwriter financial advisor results since ${recencyScope.preferredStartDate}`,
    `- ${issuer} board packet official statement bonds continuing disclosure since ${recencyScope.preferredStartDate}`,
    `- annual backfill: ${issuer} board meeting minutes bond authorization RFP EMMA rating action since ${recencyScope.annualStartDate}`,
    '',
    'Output format:',
    `### ${issuer}`,
    'Status: Development found / No recent change found / Stale source only / Insufficient public evidence / Needs manual verification',
    'Recency: Preferred 3-month evidence / Annual 1-year evidence / Structural 3-year context / Older context only / Undated source',
    'Reason: Briefly explain why this status was selected, especially when no fresh item was found.',
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
    recencyScope,
    update: responseText(payload),
    citations: payload.citations ?? [],
    searchResults: payload.search_results ?? [],
    model: payload.model || model,
    usage: payload.usage ?? null,
  });
}
