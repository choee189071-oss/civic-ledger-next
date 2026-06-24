import type { GeneratedReport, ReadingDocument, ResearchRecord } from './types/public-finance';

export type DocumentEvidenceFinding = {
  section: string;
  status: 'Found' | 'Missing';
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string;
  manualCheck: string;
};

export type DocumentParseResult = {
  title: string;
  issuer?: string;
  documentType: string;
  sourceUrl?: string | null;
  filename: string;
  parsedAt: string;
  parser: {
    provider: string;
    tier: string;
    jobId: string;
    pageCount?: number | null;
  };
  focus: string[];
  markdown: string;
  evidencePackage: {
    documentKind: string;
    findings: DocumentEvidenceFinding[];
    missingFields: string[];
    workflowSections: string[];
    suggestedNextSteps: string[];
  };
  llamaExtract?: unknown;
};

export type DocumentWorkflowPackage = {
  record: ResearchRecord;
  report: GeneratedReport;
  reading: ReadingDocument;
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document';
}

function sourceLabel(result: DocumentParseResult) {
  if (!result.sourceUrl) return 'Uploaded PDF';

  try {
    return new URL(result.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return result.sourceUrl;
  }
}

function documentSourceUrl(result: DocumentParseResult) {
  return result.sourceUrl || undefined;
}

function finding(result: DocumentParseResult, section: RegExp) {
  return result.evidencePackage.findings.find((item) => section.test(item.section));
}

function findingStatus(result: DocumentParseResult, section: RegExp) {
  return finding(result, section)?.status ?? 'Missing';
}

function findingEvidence(result: DocumentParseResult, section: RegExp) {
  const item = finding(result, section);
  if (!item || item.status === 'Missing') return 'Not found in parsed document.';
  return item.evidence;
}

function compactEvidence(value: string, max = 420) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function extractFirst(markdown: string, pattern: RegExp) {
  const match = markdown.match(pattern);
  return match?.[0]?.replace(/\s+/g, ' ').trim() || 'Not found';
}

function extractFieldValues(result: DocumentParseResult) {
  const markdown = result.markdown || '';

  return {
    dsc: extractFirst(markdown, /(?:debt service coverage|coverage ratio|coverage)[^.\n]{0,180}/i),
    rateCovenant: findingStatus(result, /rate covenant/i) === 'Found'
      ? compactEvidence(findingEvidence(result, /rate covenant/i), 220)
      : 'Not found',
    additionalBondsTest: findingStatus(result, /additional bonds/i) === 'Found'
      ? compactEvidence(findingEvidence(result, /additional bonds/i), 220)
      : 'Not found',
    cusip: extractFirst(markdown, /\b[A-Z0-9]{6}[A-Z0-9]{2}[0-9]\b/i),
    emmaFilingDate: extractFirst(markdown, /(?:filing date|filed|submitted)[^.\n]{0,120}(?:20\d{2}|19\d{2})/i),
    fiscalYear: extractFirst(markdown, /(?:fiscal year ended|year ended|fiscal year)[^.\n]{0,120}(?:20\d{2}|19\d{2})/i),
  };
}

function coverageRow(area: string, status: string, confidence: string) {
  return {
    area,
    status,
    confidence,
  };
}

function coverageDashboard(result: DocumentParseResult) {
  const financial = findingStatus(result, /operating revenue|statement of net position|updated financial metrics/i);
  const liquidity = findingStatus(result, /cash and investments|liquidity/i);
  const debtProfile = findingStatus(result, /long-term debt|debt service schedule|outstanding debt/i);
  const rateCovenant = findingStatus(result, /rate covenant|covenant compliance/i);
  const additionalBonds = findingStatus(result, /additional bonds/i);

  return [
    coverageRow('Financial Performance', financial, financial === 'Found' ? 'Medium' : 'Low'),
    coverageRow('Liquidity', liquidity, liquidity === 'Found' ? 'Medium' : 'Low'),
    coverageRow('Debt Profile', debtProfile, debtProfile === 'Found' ? 'Medium' : 'Low'),
    coverageRow('Debt Service Coverage and Covenants', rateCovenant === 'Found' || additionalBonds === 'Found' ? 'Found' : 'Missing', rateCovenant === 'Found' || additionalBonds === 'Found' ? 'Medium' : 'Low'),
    coverageRow('Rate Covenant', rateCovenant, rateCovenant === 'Found' ? 'Medium' : 'Low'),
    coverageRow('Additional Bonds Test', additionalBonds, additionalBonds === 'Found' ? 'Medium' : 'Low'),
    coverageRow('Missing Information', result.evidencePackage.missingFields.length ? 'Needs follow-up' : 'No missing parser fields', result.evidencePackage.missingFields.length ? 'Medium' : 'High'),
    coverageRow('Source Appendix', 'Found', 'High'),
  ];
}

function documentInventory(result: DocumentParseResult) {
  const values = extractFieldValues(result);

  return [{
    document: result.title,
    title: result.title,
    type: result.documentType,
    documentType: result.documentType,
    document_type: result.documentType,
    source: sourceLabel(result),
    url: documentSourceUrl(result),
    source_url: documentSourceUrl(result),
    sourceTier: 'Tier 1',
    source_tier: 'Tier 1',
    sourceTierRank: 1,
    date: result.parsedAt.slice(0, 10),
    publication_date: values.fiscalYear !== 'Not found' ? values.fiscalYear : 'Not found',
    emma_filing_date: values.emmaFilingDate,
    emmaSubmissionId: 'Not found',
    emma_submission_id: 'Not found',
    cusip: values.cusip,
    filing_entity: sourceLabel(result),
    status: 'Used in Report',
    confidence: 'High',
    confidence_tier: 'High',
    recencyWindow: 'Document date to verify',
    recency_window: 'Document date to verify',
    notes: 'Parsed with LlamaParse. Verify source origin, dates, CUSIP, dollar amounts, and covenant thresholds before final delivery.',
  }];
}

function rawEvidenceNotes(result: DocumentParseResult) {
  return result.evidencePackage.findings
    .filter((item) => item.status === 'Found')
    .map((item) => ({
      source_title: result.title,
      source_url: documentSourceUrl(result),
      source_tier: 'Tier 1',
      confidence: item.confidence,
      section: item.section,
      claim: `${item.section}: ${compactEvidence(item.evidence, 520)}`,
      manual_check: item.manualCheck,
    }));
}

function evidencePackageForRecord(result: DocumentParseResult) {
  const inventory = documentInventory(result);
  const coverage = coverageDashboard(result);

  return {
    issuer: result.issuer || result.title,
    research_mode: 'Document-to-Report Pipeline',
    output_type: 'Professional Credit Memo',
    search_timestamp: result.parsedAt,
    parser: result.parser,
    document_kind: result.evidencePackage.documentKind,
    source_strategy: {
      structured_connectors: ['LlamaParse PDF intake'],
      note: 'This package is generated from a user-supplied or URL-supplied PDF. Treat extracted values as workflow evidence until analyst verification is complete.',
    },
    document_inventory: inventory,
    coverage_dashboard: coverage,
    raw_evidence_notes: rawEvidenceNotes(result),
    missing_items: [
      ...result.evidencePackage.missingFields.map((item) => `${item}: not found in parsed PDF.`),
      'Verify all dollar amounts, ratios, dates, CUSIPs, and covenant thresholds against the original PDF.',
      'Add rating reports, latest EMMA filings, and issuer board materials before final credit conclusion.',
    ],
    workflow_sections: result.evidencePackage.workflowSections,
    suggested_next_steps: result.evidencePackage.suggestedNextSteps,
  };
}

function memoSection(title: string, body: string[]) {
  return [`## ${title}`, '', ...body.filter(Boolean), ''].join('\n');
}

function statusFor(result: DocumentParseResult) {
  return result.evidencePackage.missingFields.length > 0 ? 'Needs Sources' : 'Ready for Review';
}

function evidenceCoverageScore(result: DocumentParseResult) {
  const total = Math.max(result.evidencePackage.findings.length, 1);
  const found = result.evidencePackage.findings.filter((item) => item.status === 'Found').length;
  return Math.round((found / total) * 100);
}

function reportContent(result: DocumentParseResult) {
  const values = extractFieldValues(result);
  const coverageScore = evidenceCoverageScore(result);
  const inventory = documentInventory(result)[0];
  const findings = result.evidencePackage.findings;
  const missing = result.evidencePackage.missingFields;

  return [
    `# Professional Credit Memo: ${result.issuer || result.title}`,
    '',
    '**Status:** Preliminary document-derived memo. This is not a final credit conclusion until source origin, dollar amounts, dates, ratings, CUSIPs, and covenant calculations are verified.',
    '',
    '## Credit Snapshot',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Issuer | ${result.issuer || 'Not specified'} |`,
    `| Source document | ${result.title} |`,
    `| Document type | ${result.documentType} |`,
    `| Parser | ${result.parser.provider} (${result.parser.tier}) |`,
    `| Evidence coverage score | ${coverageScore}% (${findings.filter((item) => item.status === 'Found').length} of ${findings.length} parser checks found) |`,
    `| Debt Service Coverage (DSC) | ${values.dsc} |`,
    `| Rate Covenant | ${values.rateCovenant} |`,
    `| Additional Bonds Test | ${values.additionalBondsTest} |`,
    `| CUSIP | ${values.cusip} |`,
    `| Last EMMA filing date | ${values.emmaFilingDate} |`,
    '',
    memoSection('Document Intake Summary', [
      `The document was parsed on ${result.parsedAt} from ${result.sourceUrl || result.filename}.`,
      `The extraction focused on: ${result.focus.join(', ')}.`,
      `This memo converts the parsed material into finance workflow sections, with missing items preserved for analyst follow-up.`,
    ]),
    memoSection('Credit Strengths', [
      '- Parser-derived strengths should be treated as preliminary until verified against the original PDF and current issuer disclosures.',
      compactEvidence(findingEvidence(result, /liquidity|coverage|revenue|management|capital|rate covenant/i), 700),
    ]),
    memoSection('Credit Weaknesses', [
      '- Parser-derived weaknesses focus on missing evidence, unresolved covenant verification, and any risk language surfaced in the uploaded document.',
      missing.length
        ? missing.map((item) => `- ${item}: not found in parsed PDF.`).join('\n')
        : '- No parser-level missing fields were flagged, but analyst verification is still required.',
    ]),
    memoSection('Financial Analysis', [
      compactEvidence(findingEvidence(result, /operating revenue|statement of net position|updated financial metrics/i), 900),
    ]),
    memoSection('Liquidity', [
      compactEvidence(findingEvidence(result, /cash and investments|liquidity/i), 900),
    ]),
    memoSection('Debt', [
      compactEvidence(findingEvidence(result, /long-term debt|debt service schedule|outstanding debt/i), 900),
    ]),
    memoSection('Legal Security and Covenants', [
      `Debt Service Coverage: ${values.dsc}.`,
      `Rate Covenant: ${values.rateCovenant}.`,
      `Additional Bonds Test: ${values.additionalBondsTest}.`,
      'Conclusion status: preliminary. Confirm calculations and legal covenant language against the original PDF and any current EMMA filings.',
    ]),
    memoSection('Recommendation', [
      'Recommendation status: Needs Manual Verification.',
      'Rationale: document-derived evidence is useful for drafting, but current filings, ratings, CUSIP data, and covenant calculations must be verified before a credit conclusion.',
    ]),
    memoSection('Missing Information', missing.length
      ? missing.map((item) => `- ${item}: not found in parsed PDF.`)
      : ['No parser-level missing fields were flagged, but analyst verification is still required.']),
    memoSection('Recommended Next Steps', [
      '- Verify extracted values against the source PDF page references.',
      '- Add current rating reports and EMMA continuing disclosure filings if this memo will support a credit view.',
      '- Mark each source as Used in Report, Candidate, Missing, or Rejected in Source list.',
      '- Regenerate individual report sections after attaching additional Tier 1 evidence.',
    ]),
    memoSection('Evidence Appendix', [
      '| Document Type | Document Title | Publication / Filing Date | Filing Entity | CUSIP | EMMA Submission ID | Source Tier | Verification Status | URL |',
      '|---|---|---|---|---|---|---|---|---|',
      `| ${inventory.document_type} | ${inventory.title} | ${inventory.publication_date} | ${inventory.filing_entity} | ${inventory.cusip} | ${inventory.emma_submission_id} | ${inventory.source_tier} | ${inventory.status} | ${inventory.source_url || inventory.source} |`,
    ]),
    memoSection('How to Use This Output', [
      'Use this as the first draft of the work product. The report is editable in Reading room, exportable from Deliverable, and can be refined through the existing OpenAI writer once additional sources are attached.',
    ]),
  ].join('\n');
}

export function buildDocumentWorkflow(result: DocumentParseResult): DocumentWorkflowPackage {
  const id = `document-${slug(result.issuer || result.title)}-${Date.now()}`;
  const evidencePackage = evidencePackageForRecord(result);
  const report = {
    id: `report-${id}`,
    template: 'credit-memo',
    templateLabel: 'Professional Credit Memo',
    title: `Professional Credit Memo: ${result.issuer || result.title}`,
    content: reportContent(result),
    generatedAt: new Date().toISOString(),
    model: 'LlamaParse deterministic pipeline',
    usage: null,
    sectionTitle: null,
  };
  const record = {
    id,
    kind: 'document-pipeline',
    title: result.issuer || result.title,
    topic: 'Document-to-Report Pipeline',
    source: 'LlamaParse',
    score: evidenceCoverageScore(result),
    summary: `${result.documentType} parsed into a credit memo evidence package with ${result.evidencePackage.findings.filter((item) => item.status === 'Found').length} found sections and ${result.evidencePackage.missingFields.length} missing sections.`,
    snippet: report.content,
    facts: rawEvidenceNotes(result).map((item) => item.claim),
    citations: [result.sourceUrl || result.filename].filter(Boolean),
    generatedReport: report,
    workflowStatus: statusFor(result),
    savedAt: undefined,
    financeFocused: true,
    coreFinanceDocumentsFound: true,
    researchModeLabel: 'Document-to-Report Pipeline',
    outputType: 'credit-memo',
    promptMode: 'document-pipeline',
    customAngle: `Parsed ${result.documentType} into finance workflow sections.`,
    workflowInput: {
      issuer: result.issuer || result.title,
      research_mode: 'Document-to-Report Pipeline',
      output_type: 'credit-memo',
      document_type: result.documentType,
      source_document: result.sourceUrl || result.filename,
      parser: `${result.parser.provider} ${result.parser.tier}`,
    },
    evidencePackage,
    searchResults: [{
      title: result.title,
      url: result.sourceUrl || undefined,
      source: sourceLabel(result),
      sourceTier: 'Tier 1',
      sourceTierRank: 1,
      documentType: result.documentType,
      date: result.parsedAt.slice(0, 10),
      recencyWindow: 'Document date to verify',
      snippet: `Parsed into ${result.evidencePackage.workflowSections.join(', ')}.`,
      status: 'Used in Report',
      notes: 'LlamaParse document intake result.',
    }],
    documentInventory: documentInventory(result),
    coverageDashboard: coverageDashboard(result),
    searchQueries: [],
    generatedAt: result.parsedAt,
    recencyScope: {
      as_of_date: result.parsedAt.slice(0, 10),
      rule: 'Document date must be verified from the parsed source.',
    },
  } as ResearchRecord;
  const reading = {
    id: report.id,
    recordId: record.id,
    title: report.title,
    body: [report.content],
  };

  return { record, report, reading };
}
