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
      'Debt Service Coverage and Covenants',
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
      'Relative Value / Benchmark Analysis',
      'Comparable Bond List',
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
      'CUSIP / EMMA Filing Detail',
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
      'Indicative Scorecard',
      'Anchor Rating and Modifiers',
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
  'watchlist-monitor': {
    label: 'Watchlist Monitor',
    audience: 'portfolio monitor reviewing a saved issuer list for new disclosures, rating changes, board actions, RFPs, and risk signals',
    sections: [
      'Watchlist Summary',
      'Issuer Status Table',
      'New EMMA / Disclosure Items',
      'Rating and Outlook Changes',
      'Board / RFP Signals',
      'Federal Grant / Single Audit Signals',
      'No-Update Conclusions',
      'Retry / Manual Verification Queue',
      'Source Appendix',
    ],
  },
  'peer-comparison-table': {
    label: 'Peer Comparison Table',
    audience: 'analyst comparing municipal issuers or obligors side by side',
    sections: [
      'Peer Set Definition',
      'Metric Comparison Table',
      'Debt Service Coverage',
      'Liquidity / Reserve Days',
      'Debt Burden',
      'Revenue and Expense Trends',
      'Ratings / Outlook Context',
      'Comparable Bond / Benchmark Notes',
      'Data Gaps',
      'Source Appendix',
    ],
  },
  'time-series-analysis': {
    label: 'Time Series Analysis',
    audience: 'analyst reviewing one issuer across multiple fiscal years',
    sections: [
      'Trend Summary',
      'Metric Table by Fiscal Year',
      'Revenue and Expense Trend',
      'Liquidity and Reserve Trend',
      'Debt Service Coverage Trend',
      'Outstanding Debt Trend',
      'Capital Plan / Budget Trend',
      'Data Gaps and Manual Extraction Items',
      'Source Appendix',
    ],
  },
  'covenant-tracking': {
    label: 'Covenant Tracking',
    audience: 'analyst checking whether OS/POS legal covenants can be verified against current financial documents',
    sections: [
      'Covenant Tracking Summary',
      'Security and Pledge',
      'Rate Covenant',
      'Additional Bonds Test',
      'Debt Service Coverage Compliance Check',
      'Required Documents',
      'Latest Financial Evidence',
      'Compliance Status / Manual Verification',
      'Source Appendix',
    ],
  },
  'source-appendix': {
    label: 'Source Appendix',
    audience: 'analyst who needs a reusable source trail and evidence package appendix',
    sections: [
      'Search Diagnostics',
      'Source Tier Summary',
      'Structured Source Appendix',
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
      'Evidence Coverage Score Method',
      'Key Evidence Caveats',
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

function sourceText(source: any) {
  return [
    source?.title,
    source?.document,
    source?.document_title,
    source?.snippet,
    source?.notes,
    source?.url,
    source?.source_url,
  ].filter(Boolean).join(' ');
}

function firstValue(source: any, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return 'Not found';
}

function inferDocumentType(source: any) {
  const existing = firstValue(source, ['document_type', 'documentType', 'type']);
  if (existing !== 'Not found') return existing;

  const text = sourceText(source).toLowerCase();

  if (/annual comprehensive financial report|\bacfr\b|audited financial|financial statements/.test(text)) return 'ACFR / Audited Financial Statements';
  if (/preliminary official statement|\bpos\b/.test(text)) return 'Preliminary Official Statement';
  if (/official statement/.test(text)) return 'Official Statement';
  if (/emma|msrb|continuing disclosure|annual disclosure/.test(text)) return 'Continuing Disclosure';
  if (/rating report|rating action|moody|s&p|standard & poor|fitch|kroll|kb ra/.test(text)) return 'Rating Letter / Rating Report';
  if (/budget|capital improvement|\bcip\b/.test(text)) return /capital improvement|\bcip\b/.test(text) ? 'Capital Improvement Plan' : 'Budget';
  if (/board|agenda|minutes|resolution|ordinance/.test(text)) return 'Board Packet / Resolution';

  return 'Other';
}

function extractCusip(source: any) {
  const match = sourceText(source).match(/\b[A-Z0-9]{6}[A-Z0-9]{2}[0-9]\b/i);
  return match?.[0].toUpperCase() ?? firstValue(source, ['cusip', 'CUSIP']);
}

function extractEmmaSubmissionId(source: any) {
  const explicit = firstValue(source, ['emma_submission_id', 'emmaSubmissionId', 'submission_id', 'submissionId']);
  if (explicit !== 'Not found') return explicit;

  const text = sourceText(source);
  if (!/emma|msrb/i.test(text)) return 'Not found';

  const match = text.match(/(?:submission|accession|document|filing)\s*(?:id|number|no\.?)?\s*[:#]?\s*([A-Z0-9-]{6,})/i);
  return match?.[1] ?? 'Not found';
}

function sourceDate(source: any) {
  return firstValue(source, ['publication_date', 'publicationDate', 'filing_date', 'filingDate', 'date', 'last_updated', 'lastUpdated']);
}

function sourceTier(source: any) {
  return firstValue(source, ['source_tier', 'sourceTier', 'tier']);
}

function confidenceTier(source: any) {
  const explicit = firstValue(source, ['confidence_tier', 'confidenceTier', 'confidence']);
  if (explicit !== 'Not found') return explicit;

  const tier = sourceTier(source);
  if (/Tier 1/i.test(tier)) return 'High';
  if (/Tier 2/i.test(tier)) return 'Medium';
  if (/Tier 3|Tier 4/i.test(tier)) return 'Low';
  return 'Not found';
}

function sourceUrl(source: any) {
  return firstValue(source, ['source_url', 'url']);
}

function filingEntity(source: any) {
  const explicit = firstValue(source, ['filing_entity', 'filingEntity', 'source']);
  if (explicit !== 'Not found') return explicit;

  const url = sourceUrl(source);
  if (url === 'Not found') return 'Not found';

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Not found';
  }
}

function sourceAppendix(record: any) {
  const candidates = [
    ...(record?.evidencePackage?.document_inventory ?? []),
    ...(record?.documentInventory ?? []),
    ...(record?.searchResults ?? []),
    ...((record?.citations ?? []) as string[]).map((url) => ({ title: url, url })),
  ];
  const seen = new Set<string>();

  return candidates
    .map((source: any) => {
      const url = sourceUrl(source);
      const title = firstValue(source, ['document_title', 'document', 'title']);
      const key = `${url}|${title}`.toLowerCase();

      if (key === 'not found|not found' || seen.has(key)) {
        return null;
      }

      seen.add(key);

      return {
        document_title: title,
        document_type: inferDocumentType(source),
        url,
        publication_date: sourceDate(source),
        dated_date: firstValue(source, ['dated_date', 'datedDate']),
        closing_date: firstValue(source, ['closing_date', 'closingDate']),
        filing_entity: filingEntity(source),
        emma_filing_date: firstValue(source, ['emma_filing_date', 'emmaFilingDate', 'filing_date', 'filingDate']),
        emma_submission_id: extractEmmaSubmissionId(source),
        cusip: extractCusip(source),
        confidence_tier: confidenceTier(source),
        source_tier: sourceTier(source),
        recency_window: firstValue(source, ['recency_window', 'recencyWindow']),
        verification_status: firstValue(source, ['verification_status', 'verificationStatus', 'status']),
        notes: firstValue(source, ['notes', 'snippet']),
      };
    })
    .filter(Boolean)
    .slice(0, 25);
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
    sourceAppendix: sourceAppendix(record),
    sourceEvidence: (record?.searchResults ?? []).slice(0, 20).map((result: any) => ({
      title: result.title,
      url: result.url,
      date: result.date ?? result.last_updated,
      snippet: result.snippet,
      sourceTier: result.sourceTier,
      sourceTierName: result.sourceTierName,
      documentType: result.documentType,
      recencyWindow: result.recencyWindow,
      cusip: extractCusip(result),
      emmaSubmissionId: extractEmmaSubmissionId(result),
      confidenceTier: confidenceTier(result),
      notes: result.notes,
    })),
    missingCoreFinanceDocs: record?.financeFocused && record?.coreFinanceDocumentsFound === false,
    searchQueries: record?.searchQueries ?? [],
  };
}

function reportInstructions(template: (typeof REPORT_TEMPLATES)[ReportTemplate], templateKey: ReportTemplate) {
  const sourceAppendixRules = [
    'Format every Source Appendix as a structured table with these columns: Document type, Document title, Publication / filing date, Dated date, Closing date, Filing entity, CUSIP, EMMA submission ID, Confidence tier, Verification status, URL.',
    'If a Source Appendix field is not found, write "Not found" rather than leaving it blank.',
    'For EMMA/MSRB sources, include EMMA filing date and submission ID when available. If unavailable, say "Not found".',
    'Separate OS/POS dated date from closing date when both are available. Do not infer a date unless the package supplies it.',
  ];
  const creditMemoRules = templateKey === 'credit-memo'
    ? [
      'For Credit Memo, include a top-level Credit Snapshot with exactly these fields: Issuer, Sector, Systems, State, Revenue pledge, Research mode, Evidence coverage score, Preliminary view, Confidence, Debt Service Coverage (DSC), Rate Covenant, Additional Bonds Test, CUSIP, Last EMMA filing date, Primary risks, Primary strengths, Final recommendation status.',
      'For DSC, Rate Covenant, Additional Bonds Test, CUSIP, and Last EMMA filing date, use the value from the package or write "Not found".',
      'In Debt Service Coverage and Covenants, explicitly discuss DSC, rate covenant status, additional bonds test status, debt service schedule availability, and whether covenant conclusions are supported by Tier 1 evidence.',
      'For Preliminary view, avoid final recommendations unless required Tier 1 documents are found. If evidence is incomplete, mark the view preliminary and explain the missing documents.',
    ]
    : [];
  const investmentCommitteeRules = templateKey === 'investment-committee-memo'
    ? [
      'For Investment Committee Memo, include Relative Value / Benchmark Analysis with Spread to MMD / benchmark, yield / spread date, maturity context, rating context, and whether the data is current or not found.',
      'Include a Comparable Bond List table with Issuer, Sector, Security, Rating, Maturity, Coupon / Yield if found, Spread to MMD / benchmark if found, Source, and Notes.',
      'If comparable bond data is unavailable, say "Comparable bond data not found in the supplied package" and list the exact follow-up data needed.',
    ]
    : [];
  const ratingCommitteeRules = templateKey === 'rating-committee-memo'
    ? [
      'For Rating Committee Memo, include an Indicative Scorecard table covering Business Profile and Financial Profile subfactors, score / assessment, evidence, and confidence.',
      'Include Anchor Rating and Modifiers showing the preliminary anchor, upward / downward modifiers, information gaps, and final rating view status.',
      'Do not state an actual rating action unless the package contains rating agency evidence. Mark all unsupported ratings as preliminary analytical indications.',
    ]
    : [];
  const documentInventoryRules = templateKey === 'document-inventory-report'
    ? [
      'For Document Inventory Report, include CUSIP / EMMA Filing Detail with CUSIP, EMMA filing date, EMMA submission ID, OS/POS dated date, OS/POS closing date, filing entity, document type, source tier, and verification status.',
      'Flag missing CUSIP, missing EMMA filing date, missing dated date, and missing closing date as discrete follow-up items.',
    ]
    : [];
  const executiveSummaryRules = templateKey === 'executive-summary'
    ? [
      'For Executive Summary, replace shallow bulleting with a concise decision-ready structure: Bottom line, Three Key Strengths, Three Key Risks, Evidence Coverage Score, Evidence Coverage Score Method, Evidence Caveats, Next Step.',
      'Evidence Coverage Score Method must explain which Tier 1 / Tier 2 sources were counted, which core documents are missing, and why the score is preliminary or review-ready.',
    ]
    : [];
  const workflowReportRules = templateKey === 'watchlist-monitor'
    ? [
      'For Watchlist Monitor, include a table with issuer, latest development status, recency label, source tier, source URL, and next action.',
      'Treat "No recent change found" as a valid monitoring conclusion only when official or high-quality sources were checked.',
    ]
    : templateKey === 'peer-comparison-table'
      ? [
        'For Peer Comparison Table, use a side-by-side table. Required columns when available: issuer, sector, rating/outlook, DSC, liquidity/reserve days, debt/revenue, outstanding debt, recent development, source coverage, data gaps.',
        'Do not force numeric comparisons when source data is missing. Use "Not found" and list the exact document required.',
      ]
      : templateKey === 'time-series-analysis'
        ? [
          'For Time Series Analysis, organize metrics by fiscal year. Required rows when available: operating revenue, operating expense, liquidity/cash, unrestricted reserves, debt service, DSC, outstanding debt, capital spend.',
          'Separate audited historical data from budget/forecast data.',
        ]
        : templateKey === 'covenant-tracking'
          ? [
            'For Covenant Tracking, compare OS/POS legal covenant language to latest ACFR/continuing disclosure evidence.',
            'Required statuses: Compliant / Not compliant / Not found / Needs manual verification. Never infer compliance without a covenant source and a current financial source.',
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
    ...sourceAppendixRules,
    ...creditMemoRules,
    ...investmentCommitteeRules,
    ...ratingCommitteeRules,
    ...documentInventoryRules,
    ...executiveSummaryRules,
    ...workflowReportRules,
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
