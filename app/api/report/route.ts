import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const REPORT_TEMPLATES = {
  'research-brief': {
    label: 'Research Brief',
    audience: 'research analyst or manager who needs a clean, source-grounded brief',
    sections: [
      'Executive Summary',
      'Issuer Overview',
      'Key Findings',
      'Source Coverage',
      'Missing Information',
      'Next Steps',
    ],
  },
  'general-research': {
    label: 'General Research',
    audience: 'research analyst or manager who needs a clean, source-grounded brief',
    sections: [
      'Executive Summary',
      'Issuer Overview',
      'Key Findings',
      'Source Coverage',
      'Missing Information',
      'Next Steps',
    ],
  },
  'credit-memo': {
    label: 'Credit Memo',
    audience: 'public finance credit analyst preparing an issuer memo',
    sections: [
      'Credit Snapshot',
      'Preliminary Credit View',
      'Executive Summary',
      'Issuer Overview',
      'Ratings and Recent Actions',
      'Credit Strengths',
      'Credit Risks',
      'Financial Performance',
      'Debt Profile',
      'Capital Plan',
      'Outlook / Monitoring Items',
      'Missing Information',
      'Recommended Next Steps',
      'Source Appendix',
    ],
  },
  'investment-committee-memo': {
    label: 'Investment Committee Memo',
    audience: 'investment committee evaluating whether to advance or monitor a credit',
    sections: [
      'Recommendation',
      'Investment Thesis',
      'Key Credit Drivers',
      'Downside Risks',
      'Relative Value / Peer Context',
      'Required Follow-Up',
      'Source Appendix',
    ],
  },
  'document-inventory-report': {
    label: 'Document Inventory Report',
    audience: 'analyst validating source coverage before drafting or committee review',
    sections: [
      'Search Diagnostics',
      'Document Inventory',
      'Source Tier Summary',
      'Coverage Dashboard',
      'Missing Documents',
      'Recommended Follow-Up Searches',
    ],
  },
  'rating-committee-memo': {
    label: 'Rating Committee Memo',
    audience: 'rating committee reviewing an issuer or obligor credit profile',
    sections: [
      'Rating Question',
      'Analytical Summary',
      'Business / Enterprise Profile',
      'Financial Profile',
      'Debt and Legal Security',
      'Key Strengths',
      'Key Risks',
      'Potential Rating Drivers',
      'Information Gaps',
    ],
  },
  'due-diligence-report': {
    label: 'Due Diligence Report',
    audience: 'deal team or research team validating source coverage before a transaction or recommendation',
    sections: [
      'Scope',
      'Document Inventory',
      'Verified Findings',
      'Financial and Debt Review',
      'Risk Review',
      'Evidence Gaps',
      'Follow-Up Request List',
    ],
  },
  'risk-monitor': {
    label: 'Risk Monitor',
    audience: 'portfolio monitor tracking recent developments and emerging credit risk',
    sections: [
      'Monitoring Summary',
      'Recent Developments',
      'Risk Signals',
      'Source Coverage',
      'Items Requiring Verification',
      'Recommended Monitoring Queries',
    ],
  },
  'source-appendix': {
    label: 'Source Appendix',
    audience: 'analyst who needs a reusable source trail and evidence package appendix',
    sections: [
      'Search Diagnostics',
      'Source Tier Summary',
      'Document Inventory',
      'Raw Evidence Notes',
      'Coverage Dashboard',
      'Missing Items',
      'Source URLs',
    ],
  },
  'custom-report': {
    label: 'Custom Report',
    audience: 'public finance professional using the selected research mode and custom angle',
    sections: [
      'Executive Summary',
      'Key Findings',
      'Evidence Review',
      'Implications',
      'Missing Information',
      'Recommended Next Steps',
      'Source Appendix',
    ],
  },
  'board-briefing': {
    label: 'Board Briefing',
    audience: 'board member or senior executive who needs concise decisions and risks',
    sections: [
      'Briefing Summary',
      'Why It Matters',
      'Key Facts',
      'Financial Implications',
      'Risks and Watch Items',
      'Decisions / Actions Needed',
      'Appendix: Source Notes',
    ],
  },
  'executive-summary': {
    label: 'Executive Summary',
    audience: 'senior leader who wants the shortest useful version',
    sections: [
      'One-Paragraph Bottom Line',
      'Three Key Strengths',
      'Three Key Risks',
      'Evidence Coverage Score',
      'Next Step',
    ],
  },
} as const;

type ReportTemplate = keyof typeof REPORT_TEMPLATES;

function normalizeTemplate(value: unknown): ReportTemplate {
  const template = String(value ?? '').trim();

  if (template in REPORT_TEMPLATES) {
    return template as ReportTemplate;
  }

  return 'credit-memo';
}

function apiErrorMessage(payload: any, status: number) {
  if (payload?.error?.message) {
    return payload.error.message;
  }

  if (payload?.message) {
    return payload.message;
  }

  if (typeof payload?.detail === 'string') {
    return payload.detail;
  }

  return `OpenAI API error: ${status}`;
}

function responseText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = (payload?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .map((content: any) => content?.text)
    .filter(Boolean);

  return parts.join('\n\n').trim();
}

function compactRecord(record: any) {
  return {
    title: record?.title,
    workflowInput: record?.workflowInput ?? null,
    evidencePackage: record?.evidencePackage ?? null,
    outputType: record?.outputType ?? null,
    researchMode: record?.researchModeLabel ?? record?.topic,
    generatedAt: record?.generatedAt,
    summary: record?.summary,
    rawAnswer: record?.snippet,
    evidenceNotes: record?.facts ?? [],
    citations: record?.citations ?? [],
    coverageDashboard: record?.coverageDashboard ?? [],
    documentInventory: record?.documentInventory ?? [],
    sourceEvidence: (record?.searchResults ?? []).slice(0, 20).map((result: any) => ({
      title: result.title,
      url: result.url,
      date: result.date ?? result.last_updated,
      snippet: result.snippet,
      sourceTier: result.sourceTier,
      sourceTierName: result.sourceTierName,
      documentType: result.documentType,
      recencyWindow: result.recencyWindow,
      notes: result.notes,
    })),
    missingCoreFinanceDocs: record?.financeFocused && record?.coreFinanceDocumentsFound === false,
    searchQueries: record?.searchQueries ?? [],
  };
}

function reportInstructions(template: (typeof REPORT_TEMPLATES)[ReportTemplate], templateKey: ReportTemplate) {
  const creditMemoRules = templateKey === 'credit-memo'
    ? [
      'For Credit Memo, include a top-level Credit Snapshot with exactly these fields when available: Issuer, Sector, Systems, State, Revenue pledge, Research mode, Evidence coverage score, Preliminary view, Confidence, Primary risks, Primary strengths, Final recommendation status.',
      'For Preliminary view, avoid final recommendations unless required Tier 1 documents are found. If evidence is incomplete, mark the view preliminary and explain the missing documents.',
    ]
    : [];

  return [
    'You are Civic Ledger Writer, a senior public finance analyst and report editor.',
    'Transform the supplied structured research package into a polished deliverable report.',
    'Preserve useful detail: keep important dollar amounts, ratios, dates, document names, source tiers, issuer/system distinctions, and caveats.',
    'Preserve the recency policy from the research package. Prefer developments inside the 3-month window; use the 6-month fallback only when no 3-month evidence exists.',
    'Never describe older evidence as recent. Label it as older context, and explain whether it is still structurally relevant.',
    'When no fresh item is found, distinguish among: No recent change found, Stale source only, Insufficient public evidence, and Needs manual verification.',
    'Make the report easy to read: use concise headings, short paragraphs, bullets, and tables where helpful.',
    'Do not invent facts, ratings, metrics, documents, or conclusions not supported by the package.',
    'Separate facts, inferences, and recommendations.',
    'If the package says core finance documents are missing, clearly state that the output is preliminary and not a credit conclusion.',
    'Use Tier 1 and Tier 2 sources for conclusions; Tier 3 can provide technical context; Tier 4 should only be mentioned as low-priority context.',
    'Keep source references visible in plain text using source names, document names, and URLs where available.',
    'Distinguish Power System and Water System conclusions when the package separates them.',
    'Mark any unverified value as "to be verified".',
    'Avoid overlong raw evidence dumps in the main memo; put long source details in the appendix.',
    ...creditMemoRules,
    `Audience: ${template.audience}.`,
    `Required report sections, in this order: ${template.sections.join(' | ')}.`,
    'Write in professional English unless the supplied research package is primarily Chinese.',
    'End with a practical workflow section called "How to Use This Output" that explains what the user can do next with this report.',
  ].join('\n');
}

function sectionInstructions(template: (typeof REPORT_TEMPLATES)[ReportTemplate], templateKey: ReportTemplate, sectionTitle: string) {
  return [
    reportInstructions(template, templateKey),
    '',
    'SECTION REGENERATION MODE:',
    `Regenerate only the section titled "${sectionTitle}".`,
    'Return only that section in markdown, starting with the section heading.',
    'Preserve useful detail from the current section when it is still supported by the research package.',
    'Do not rewrite unrelated sections.',
  ].join('\n');
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'OPENAI_API_KEY is not configured. Add it in Vercel Project Settings > Environment Variables.',
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const record = body.record;
  const templateKey = normalizeTemplate(body.template);
  const template = REPORT_TEMPLATES[templateKey];
  const sectionTitle = typeof body.sectionTitle === 'string' ? body.sectionTitle.trim() : '';
  const currentSection = typeof body.currentSection === 'string' ? body.currentSection.trim() : '';

  if (!record) {
    return NextResponse.json({ error: 'Research record is required.' }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5.5';
  const packageJson = JSON.stringify(compactRecord(record), null, 2);

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: sectionTitle
        ? sectionInstructions(template, templateKey, sectionTitle)
        : reportInstructions(template, templateKey),
      input: sectionTitle
        ? [
          'Regenerate the selected report section from this research package.',
          `Selected template: ${template.label}`,
          `Section title: ${sectionTitle}`,
          '',
          'Current section text:',
          currentSection || 'No current section text supplied.',
          '',
          'Research package:',
          packageJson,
        ].join('\n')
        : [
          'Generate the selected report template from this research package.',
          `Selected template: ${template.label}`,
          '',
          packageJson,
        ].join('\n'),
      reasoning: {
        effort: 'medium',
      },
      text: {
        verbosity: templateKey === 'executive-summary' ? 'low' : 'medium',
      },
    }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      {
        error: apiErrorMessage(payload, res.status),
      },
      { status: res.status }
    );
  }

  const content = responseText(payload);

  return NextResponse.json({
    report: {
      id: `report-${Date.now()}`,
      template: templateKey,
      templateLabel: template.label,
      title: sectionTitle
        ? `${template.label}: ${sectionTitle}`
        : `${template.label}: ${record.title ?? 'Research Report'}`,
      content: content || 'No report text returned.',
      generatedAt: new Date().toISOString(),
      model: payload.model || model,
      usage: payload.usage ?? null,
      sectionTitle: sectionTitle || null,
    },
  });
}
