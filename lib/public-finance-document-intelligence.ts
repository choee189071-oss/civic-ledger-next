export type PublicFinanceDocumentKind = 'acfr' | 'official-statement' | 'continuing-disclosure' | 'other';

export type EvidenceFinding = {
  section: string;
  status: 'Found' | 'Missing';
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string;
  manualCheck: string;
};

export type DocumentEvidencePackage = {
  documentKind: PublicFinanceDocumentKind;
  focus: string[];
  findings: EvidenceFinding[];
  missingFields: string[];
  workflowSections: string[];
  suggestedNextSteps: string[];
};

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function publicFinanceDocumentKind(documentType: string): PublicFinanceDocumentKind {
  const text = documentType.toLowerCase();

  if (/acfr|audit|audited|financial statements/.test(text)) return 'acfr';
  if (/official statement|preliminary official statement|\bos\b|\bpos\b/.test(text)) return 'official-statement';
  if (/continuing disclosure|emma|annual disclosure|annual report/.test(text)) return 'continuing-disclosure';
  return 'other';
}

export function extractionFocus(documentType: string) {
  const kind = publicFinanceDocumentKind(documentType);

  if (kind === 'acfr') {
    return [
      'MD&A highlights',
      'Statement of Net Position key figures',
      'cash and investments',
      'unrestricted reserves',
      'operating revenue and expense',
      'long-term debt',
      'pension and OPEB exposure',
      'debt service coverage when available',
    ];
  }

  if (kind === 'official-statement') {
    return [
      'security and pledge',
      'flow of funds',
      'debt service schedule',
      'rate covenant',
      'additional bonds test',
      'continuing disclosure undertaking',
      'CUSIP and bond series',
      'risk factors',
    ];
  }

  if (kind === 'continuing-disclosure') {
    return [
      'filing date',
      'CUSIP or bond series',
      'updated financial metrics',
      'covenant compliance',
      'outstanding debt',
      'rating changes',
      'event notices',
    ];
  }

  return ['summary', 'key figures', 'dates', 'source references', 'items requiring manual verification'];
}

const findingPlans: Record<PublicFinanceDocumentKind, Array<{ section: string; patterns: RegExp[]; manualCheck: string }>> = {
  acfr: [
    { section: 'MD&A / Management Discussion', patterns: [/management'?s discussion/i, /\bMD&A\b/i], manualCheck: 'Confirm major operating changes and management explanations.' },
    { section: 'Statement of Net Position', patterns: [/statement of net position/i, /net position/i], manualCheck: 'Extract total assets, liabilities, deferred inflows/outflows, and net position.' },
    { section: 'Cash and Investments', patterns: [/cash and investments/i, /cash equivalents/i, /investments/i], manualCheck: 'Confirm unrestricted vs restricted liquidity.' },
    { section: 'Operating Revenue / Expense', patterns: [/operating revenues?/i, /operating expenses?/i, /changes in net position/i], manualCheck: 'Extract revenue mix, expense growth, and operating result.' },
    { section: 'Long-term Debt', patterns: [/long[- ]term debt/i, /bonds payable/i, /debt service/i], manualCheck: 'Extract outstanding debt, maturity schedule, and debt service.' },
    { section: 'Pension / OPEB', patterns: [/pension/i, /\bOPEB\b/i, /other postemployment/i], manualCheck: 'Confirm pension/OPEB liabilities and annual contribution pressure.' },
    { section: 'Single Audit / Federal Awards', patterns: [/single audit/i, /schedule of expenditures of federal awards/i, /\bSEFA\b/i], manualCheck: 'Check findings, questioned costs, and federal program exposure.' },
  ],
  'official-statement': [
    { section: 'Security / Pledge', patterns: [/security for the bonds/i, /pledge/i, /ad valorem/i, /net revenues/i], manualCheck: 'Confirm legal pledge and whether it is GO, revenue, lease, or special tax.' },
    { section: 'Flow of Funds', patterns: [/flow of funds/i, /revenue fund/i, /bond fund/i], manualCheck: 'Confirm waterfall and priority of payments.' },
    { section: 'Debt Service Schedule', patterns: [/debt service schedule/i, /principal and interest/i, /maturity schedule/i], manualCheck: 'Extract annual debt service and final maturity.' },
    { section: 'Rate Covenant', patterns: [/rate covenant/i, /rates and charges/i], manualCheck: 'Extract required coverage level and measurement period.' },
    { section: 'Additional Bonds Test', patterns: [/additional bonds/i, /additional parity bonds/i, /\bABT\b/i], manualCheck: 'Determine whether additional bonds test is present and what threshold applies.' },
    { section: 'Continuing Disclosure Undertaking', patterns: [/continuing disclosure/i, /rule 15c2-12/i, /MSRB/i, /EMMA/i], manualCheck: 'Extract annual report deadline and event notice obligations.' },
    { section: 'Risk Factors', patterns: [/risk factors/i, /investment considerations/i, /litigation/i], manualCheck: 'Identify risks that should be carried into the credit memo.' },
  ],
  'continuing-disclosure': [
    { section: 'Filing Date / Reporting Period', patterns: [/filing date/i, /annual report/i, /fiscal year ended/i], manualCheck: 'Confirm reporting period and whether filing is current.' },
    { section: 'CUSIP / Bond Series', patterns: [/\bCUSIP\b/i, /series 20\d{2}/i, /bonds/i], manualCheck: 'Map filing to the correct bond series and CUSIPs.' },
    { section: 'Updated Financial Metrics', patterns: [/financial information/i, /operating data/i, /revenues?/i, /expenses?/i], manualCheck: 'Extract updated operating and financial metrics.' },
    { section: 'Covenant Compliance', patterns: [/covenant/i, /coverage/i, /debt service coverage/i], manualCheck: 'Confirm compliance status or note that it is not explicitly stated.' },
    { section: 'Outstanding Debt', patterns: [/outstanding debt/i, /principal amount outstanding/i, /debt service/i], manualCheck: 'Extract current debt outstanding and debt service information.' },
    { section: 'Event Notices / Material Events', patterns: [/event notice/i, /material event/i, /rating change/i, /default/i], manualCheck: 'Flag any event notices that need analyst review.' },
  ],
  other: [
    { section: 'Summary', patterns: [/summary/i, /overview/i, /financial/i], manualCheck: 'Classify document type and determine whether it supports a finance workflow.' },
    { section: 'Key Dates', patterns: [/20\d{2}/i, /fiscal year/i, /dated date/i], manualCheck: 'Extract document date, reporting period, and effective date.' },
    { section: 'Key Figures', patterns: [/\$[0-9,.]+/i, /million/i, /billion/i], manualCheck: 'Extract dollar amounts and decide whether they are issuer-specific.' },
  ],
};

function snippetForPattern(markdown: string, pattern: RegExp) {
  const match = pattern.exec(markdown);
  if (!match || match.index < 0) return '';

  const start = Math.max(0, match.index - 600);
  const end = Math.min(markdown.length, match.index + 1000);
  return normalize(markdown.slice(start, end));
}

function buildFindings(markdown: string, kind: PublicFinanceDocumentKind): EvidenceFinding[] {
  return findingPlans[kind].map((plan) => {
    const snippet = plan.patterns.map((pattern) => snippetForPattern(markdown, pattern)).find(Boolean);

    return {
      section: plan.section,
      status: snippet ? 'Found' : 'Missing',
      confidence: snippet ? 'Medium' : 'Low',
      evidence: snippet || 'Not found in the parsed markdown. This may require manual review, OCR tuning, or a different parser tier.',
      manualCheck: plan.manualCheck,
    };
  });
}

export function buildDocumentEvidencePackage(documentType: string, markdown: string): DocumentEvidencePackage {
  const kind = publicFinanceDocumentKind(documentType);
  const findings = buildFindings(markdown, kind);
  const missingFields = findings.filter((finding) => finding.status === 'Missing').map((finding) => finding.section);

  const workflowSectionsByKind: Record<PublicFinanceDocumentKind, string[]> = {
    acfr: ['Financial Performance', 'Liquidity', 'Debt Profile', 'Pension / OPEB', 'Missing Information'],
    'official-statement': ['Security / Pledge', 'Debt Profile', 'Covenants', 'Risk Factors', 'Source Appendix'],
    'continuing-disclosure': ['Recent Disclosure Update', 'Debt Profile', 'Covenant Tracking', 'Event Notice Review', 'Missing Information'],
    other: ['Document Summary', 'Key Evidence', 'Manual Review', 'Source Appendix'],
  };

  return {
    documentKind: kind,
    focus: extractionFocus(documentType),
    findings,
    missingFields,
    workflowSections: workflowSectionsByKind[kind],
    suggestedNextSteps: [
      missingFields.length > 0
        ? `Manually verify missing sections: ${missingFields.join(', ')}.`
        : 'Review extracted sections and mark source as Used in Report if issuer-specific.',
      'Confirm all dollar amounts, dates, CUSIPs, ratings, and covenant thresholds against the source PDF before finalizing.',
      'Use this evidence package as raw material for the Credit Memo, Covenant Tracking, or Source Appendix workflow.',
    ],
  };
}
