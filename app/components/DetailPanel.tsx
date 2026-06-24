"use client";

import { useState } from 'react';
import { FormattedReport } from './FormattedReport';
import {
  buildDocumentDiagnostics,
  buildRetrievalDiagnostics,
  classifyResearchFailure,
  sourceCandidatesFromRecord,
} from '../../lib/research-diagnostics';
import { buildEvidenceEngine, type EvidenceCoverage } from '../../lib/evidence-engine';
import { buildResearchWorkspace, type ResearchWorkspace } from '../../lib/research-workspace';
import { buildIssuerDashboard, type IssuerDashboard } from '../../lib/issuer-dashboard';
import { buildStructuredAnswer, type StructuredAnswer } from '../../lib/ai-experience';

type Props = {
  detail: any;
  reportTemplate: string;
  generatedReport: any | null;
  reportVersions: any[];
  sourceStatuses: Record<string, string>;
  runStatus: string;
  isGeneratingReport: boolean;
  reportError: string | null;
  onGenerateReport: () => void;
  onRegenerateSection: (sectionTitle: string, currentSection: string) => void;
  onUpdateReportContent: (content: string) => void;
  onSaveReportVersion: () => void;
  onRunStatusChange: (status: string) => void;
  onOpenReading: () => void;
  onSave: () => void;
  isSaved: boolean;
  isIssuerPinned: boolean;
  isReportPinned: boolean;
  isDocumentPinned: boolean;
  onToggleIssuerPin: () => void;
  onToggleReportPin: () => void;
  onToggleDocumentPin: () => void;
};

const reportTemplates = [
  ['research-brief', 'Research Brief'],
  ['credit-memo', 'Professional Credit Memo'],
  ['investment-committee-memo', 'Investment Committee Memo'],
  ['rating-committee-memo', 'Rating Committee Memo'],
  ['document-inventory-report', 'Document Inventory Report'],
  ['due-diligence-report', 'Due Diligence Report'],
  ['board-briefing', 'Board Briefing'],
  ['executive-summary', 'Executive Summary'],
  ['risk-monitor', 'Risk Monitor'],
  ['watchlist-monitor', 'Watchlist Monitor'],
  ['peer-comparison-table', 'Peer Comparison Table'],
  ['time-series-analysis', 'Time Series Analysis'],
  ['covenant-tracking', 'Covenant Tracking'],
  ['source-appendix', 'Source Appendix'],
  ['custom-report', 'Custom Report'],
];

const workflowTabs = [
  ['discovery', 'Research Package'],
  ['dashboard', 'Dashboard'],
  ['report', 'Draft Report'],
  ['export', 'Deliverable'],
];

const runStatuses = ['Draft', 'Needs Sources', 'Ready for Review', 'Finalized'];

function citationLabel(citation: string) {
  try {
    return new URL(citation).hostname.replace(/^www\./, '');
  } catch {
    return citation;
  }
}

function isUrl(value: string) {
  return /^https?:\/\//.test(value);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'research';
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function workflowInput(detail: any, reportTemplate: string) {
  return detail.workflowInput ?? {
    issuer: detail.title,
    research_mode: detail.researchModeLabel ?? detail.topic,
    output_type: reportTemplate,
    custom_prompt: detail.customAngle || null,
  };
}

function mdCell(value: any) {
  const text = value === undefined || value === null || String(value).trim() === ''
    ? 'Not found'
    : String(value).trim();

  return text.replace(/\|/g, '/').replace(/\n+/g, ' ');
}

function sourceValue(item: any, keys: string[]) {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return 'Not found';
}

function sourceQualitySummary(source: any, sourceStatuses: Record<string, string>) {
  const tier = sourceValue(source, ['sourceTier', 'source_tier']);
  const recency = sourceValue(source, ['recencyWindow', 'recency_window']);
  const verification = sourceStatuses[sourceKey(source)] ?? sourceValue(source, ['status', 'verification_status']);
  const confidence = sourceValue(source, ['confidenceTier', 'confidence_tier', 'confidence']);

  return [
    tier !== 'Not found' ? `Tier: ${tier}` : null,
    recency !== 'Not found' ? `Recency: ${recency}` : null,
    verification !== 'Not found' ? `Use: ${verification}` : null,
    confidence !== 'Not found' ? `Confidence: ${confidence}` : null,
  ].filter(Boolean).join('; ') || 'Not classified';
}

function normalizeCoverageRows(coverage: any) {
  if (Array.isArray(coverage)) return coverage;

  if (coverage && typeof coverage === 'object') {
    return Object.entries(coverage).map(([key, value]: [string, any]) => ({
      area: key.replace(/_/g, ' '),
      status: value?.status,
      confidence: value?.confidence,
      notes: value?.notes,
    }));
  }

  return [];
}

function structuredSourceAppendixMarkdown(detail: any, evidencePackage: any, sourceStatuses: Record<string, string>) {
  const sources = allSourceCandidates(detail, evidencePackage).slice(0, 25);

  if (sources.length === 0) {
    return [
      '## Structured Source Appendix',
      '',
      'No structured source records were available for this export.',
    ].join('\n');
  }

  const rows = sources.map((source) => [
    sourceValue(source, ['title', 'document', 'document_title']),
    sourceValue(source, ['documentType', 'document_type', 'type']),
    sourceValue(source, ['publicationDate', 'publication_date', 'date']),
    sourceQualitySummary(source, sourceStatuses),
    sourceValue(source, ['url', 'source_url']),
  ]);

  return [
    '## Structured Source Appendix',
    '',
    '| Document Title | Type | Date | Evidence Quality | URL |',
    '|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
  ].join('\n');
}

function exportDashboardMarkdown(
  detail: any,
  generatedReport: any | null,
  evidencePackage: any,
  sourceStatuses: Record<string, string>,
  runStatus: string,
  reportTemplate: string,
  evidenceEngine?: EvidenceCoverage | null
) {
  const sources = allSourceCandidates(detail, evidencePackage);
  const coverageRows = normalizeCoverageRows(evidencePackage?.coverage_dashboard ?? detail.coverageDashboard ?? []);
  const missingCoverage = coverageRows.filter((item: any) =>
    /missing|not found|manual|insufficient/i.test(`${item?.status ?? ''} ${item?.notes ?? ''}`)
  ).length;
  const tier1Count = sources.filter((source) => /tier\s*1|high/i.test(`${source.sourceTier ?? source.source_tier ?? ''}`)).length;
  const freshCount = sources.filter((source) => /3.?month|preferred/i.test(`${source.recencyWindow ?? source.recency_window ?? ''}`)).length;
  const fallbackCount = sources.filter((source) => /6.?month|fallback/i.test(`${source.recencyWindow ?? source.recency_window ?? ''}`)).length;
  const manualCount = sources.filter((source) =>
    /manual|candidate|verify|unverified|missing|rejected/i.test(
      `${sourceStatuses[sourceKey(source)] ?? ''} ${source.status ?? ''} ${source.notes ?? ''}`
    )
  ).length;

  return [
    '## Review Dashboard',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Run status | ${mdCell(runStatus || 'Draft')} |`,
    `| Output type | ${mdCell(templateLabel(reportTemplate))} |`,
    `| Research mode | ${mdCell(detail.researchModeLabel ?? detail.topic ?? 'Not found')} |`,
    `| Evidence coverage | ${mdCell(detail.evidenceQualitySummary ?? `${coverageRows.length || 'No'} coverage areas tracked; ${missingCoverage} missing/manual items flagged`)} |`,
    `| Evidence coverage score | ${evidenceEngine ? `${evidenceEngine.coveragePercent}%` : 'Not calculated'} |`,
    `| Evidence confidence | ${evidenceEngine?.confidence ?? 'Not calculated'} |`,
    `| Statement citations | ${evidenceEngine ? `${evidenceEngine.citationCount} of ${evidenceEngine.totalStatements}` : 'Not calculated'} |`,
    `| Tier 1 / primary sources | ${tier1Count} candidate records |`,
    `| Fresh 3-month evidence | ${freshCount} candidate records |`,
    `| 6-month fallback evidence | ${fallbackCount} candidate records |`,
    `| Manual verification / gaps | ${manualCount + missingCoverage} items |`,
    `| Generated at | ${mdCell(generatedReport?.generatedAt || detail.generatedAt || new Date().toISOString())} |`,
  ].join('\n');
}

function evidenceEngineMarkdown(evidenceEngine: EvidenceCoverage | null | undefined) {
  if (!evidenceEngine) {
    return [
      '## Evidence Coverage Score',
      '',
      'Evidence coverage was not calculated for this export.',
    ].join('\n');
  }

  const citationRows = evidenceEngine.citations.map((citation) => [
    citation.statement,
    citation.source,
    citation.document,
    citation.page,
    citation.section,
    citation.confidence,
    citation.citationUrl || citation.url || 'Not found',
  ]);

  const lines = [
    '## Evidence Coverage Score',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Coverage | ${evidenceEngine.coveragePercent}% |`,
    `| Confidence | ${evidenceEngine.confidence} |`,
    `| Evidence citations | ${evidenceEngine.citationCount} |`,
    `| Missing evidence statements | ${evidenceEngine.missingStatements} |`,
    evidenceEngine.warning ? `| Warning | ${mdCell(evidenceEngine.warning)} |` : '',
    '',
    '## Evidence Panel',
    '',
    '| AI Statement | Source | Document | Page | Section | Confidence | Citation |',
    '|---|---|---|---|---|---|---|',
    ...citationRows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
    evidenceEngine.missingEvidence.length > 0 ? '' : '',
    evidenceEngine.missingEvidence.length > 0 ? '## Missing Evidence Warning' : '',
    ...evidenceEngine.missingEvidence.map((statement) => `- ${statement}`),
  ];

  return lines
    .filter((line, index, list) => line !== '' || list[index - 1] !== '')
    .join('\n');
}

function markdownList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${mdCell(item)}`).join('\n') : '- Not surfaced';
}

function researchWorkspaceMarkdown(workspace: ResearchWorkspace | null | undefined) {
  if (!workspace) {
    return [
      '## Research Workspace',
      '',
      'Research workspace summary was not calculated for this export.',
    ].join('\n');
  }

  const summary = workspace.executiveSummary;

  return [
    '## Research Workspace',
    '',
    '### Executive Summary',
    '',
    '**Strengths**',
    markdownList(summary.strengths),
    '',
    '**Weaknesses**',
    markdownList(summary.weaknesses),
    '',
    '**Key Metrics**',
    markdownList(summary.keyMetrics),
    '',
    '**Credit Drivers**',
    markdownList(summary.creditDrivers),
    '',
    '**Risks**',
    markdownList(summary.risks),
    '',
    `**Outlook:** ${mdCell(summary.outlook)}`,
    '',
    '**Evidence**',
    markdownList(summary.evidence),
    '',
    '### Credit Factors',
    '',
    '| Factor | Status | Confidence | Evidence Count | Summary | Gaps |',
    '|---|---|---|---|---|---|',
    ...workspace.creditFactors.map((factor) =>
      `| ${mdCell(factor.label)} | ${mdCell(factor.status)} | ${mdCell(factor.confidence)} | ${factor.evidenceCount} | ${mdCell(factor.summary)} | ${mdCell(factor.gaps.join('; ') || 'None')} |`
    ),
    '',
    '### Key Risks',
    '',
    '| Risk | Level | Confidence | Evidence Count | Summary | Next Check |',
    '|---|---|---|---|---|---|',
    ...workspace.keyRisks.map((risk) =>
      `| ${mdCell(risk.label)} | ${mdCell(risk.level)} | ${mdCell(risk.confidence)} | ${risk.evidenceCount} | ${mdCell(risk.summary)} | ${mdCell(risk.nextCheck)} |`
    ),
  ].join('\n');
}

function issuerDashboardMarkdown(dashboard: IssuerDashboard | null | undefined) {
  if (!dashboard) {
    return [
      '## Issuer Dashboard',
      '',
      'Issuer dashboard was not calculated for this export.',
    ].join('\n');
  }

  const debtMetrics = Object.values(dashboard.debtDashboard);

  return [
    '## Issuer Dashboard',
    '',
    '### Financial Trends',
    '',
    '| Metric | Current Value | Trend | Confidence | Evidence | Next Check |',
    '|---|---|---|---|---|---|',
    ...dashboard.financialTrends.map((metric) =>
      `| ${mdCell(metric.label)} | ${mdCell(metric.currentValue)} | ${mdCell(metric.trend)} | ${mdCell(metric.confidence)} | ${mdCell(metric.evidence.join('; ') || 'Not found')} | ${mdCell(metric.nextCheck)} |`
    ),
    '',
    '### Rating Timeline',
    '',
    '| Date | Agency | Rating | Outlook | Action | Confidence | Evidence |',
    '|---|---|---|---|---|---|---|',
    ...dashboard.ratingTimeline.map((item) =>
      `| ${mdCell(item.date)} | ${mdCell(item.agency)} | ${mdCell(item.rating)} | ${mdCell(item.outlook)} | ${mdCell(item.action)} | ${mdCell(item.confidence)} | ${mdCell(item.evidence.join('; ') || 'Not found')} |`
    ),
    '',
    '### Debt Dashboard',
    '',
    '| Metric | Value | Status | Confidence | Evidence | Next Check |',
    '|---|---|---|---|---|---|',
    ...debtMetrics.map((metric) =>
      `| ${mdCell(metric.label)} | ${mdCell(metric.value)} | ${mdCell(metric.status)} | ${mdCell(metric.confidence)} | ${mdCell(metric.evidence.join('; ') || 'Not found')} | ${mdCell(metric.nextCheck)} |`
    ),
    '',
    '### Market Dashboard',
    '',
    '| Comparable Issuer | Rating | Spread | Recent Trade | Relative Value | Evidence |',
    '|---|---|---|---|---|---|',
    ...dashboard.marketDashboard.comparableIssuers.map((issuer) =>
      `| ${mdCell(issuer.issuer)} | ${mdCell(issuer.rating)} | ${mdCell(issuer.spread)} | ${mdCell(issuer.recentTrade)} | ${mdCell(issuer.relativeValue)} | ${mdCell(issuer.evidence.join('; ') || 'Not found')} |`
    ),
    '',
    '| Market Metric | Value | Status | Confidence | Next Check |',
    '|---|---|---|---|---|',
    ...[
      dashboard.marketDashboard.benchmarkSpreads,
      dashboard.marketDashboard.recentTrades,
      dashboard.marketDashboard.relativeValue,
    ].map((metric) =>
      `| ${mdCell(metric.label)} | ${mdCell(metric.value)} | ${mdCell(metric.status)} | ${mdCell(metric.confidence)} | ${mdCell(metric.nextCheck)} |`
    ),
  ].join('\n');
}

function structuredAnswerMarkdown(answer: StructuredAnswer | null | undefined) {
  if (!answer) {
    return [
      '## Structured Answer',
      '',
      'Structured answer was not calculated for this export.',
    ].join('\n');
  }

  return [
    '## Structured Answer',
    '',
    '### Summary',
    markdownList(answer.summary),
    '',
    '### Analysis',
    markdownList(answer.analysis),
    '',
    '### Evidence',
    markdownList(answer.evidence),
    '',
    '### Recommendations',
    markdownList(answer.recommendations),
    '',
    '### Confidence',
    '',
    `**${answer.confidence.level}:** ${mdCell(answer.confidence.explanation)}`,
    '',
    '### Suggested Follow-up Questions',
    markdownList(answer.suggestedFollowUps),
  ].join('\n');
}

function markdownFor(
  detail: any,
  generatedReport: any | null,
  sourceStatuses: Record<string, string>,
  runStatus: string,
  reportTemplate: string
) {
  const title = generatedReport?.title || detail.title || 'Research Report';
  const report = generatedReport?.content || detail.snippet || '';
  const evidencePackage = evidencePackageFor(detail);
  const evidenceEngine = evidenceEngineFor(detail, generatedReport, evidencePackage);
  const researchWorkspace = researchWorkspaceFor(detail, generatedReport, evidencePackage, evidenceEngine);
  const issuerDashboard = issuerDashboardFor(detail, generatedReport, evidencePackage, evidenceEngine);
  const structuredAnswer = structuredAnswerFor(detail, generatedReport, evidencePackage, evidenceEngine, researchWorkspace, issuerDashboard);

  return [
    `# ${title}`,
    '',
    `Generated: ${generatedReport?.generatedAt || detail.generatedAt || new Date().toISOString()}`,
    '',
    exportDashboardMarkdown(detail, generatedReport, evidencePackage, sourceStatuses, runStatus, reportTemplate, evidenceEngine),
    '',
    structuredAnswerMarkdown(structuredAnswer),
    '',
    researchWorkspaceMarkdown(researchWorkspace),
    '',
    issuerDashboardMarkdown(issuerDashboard),
    '',
    evidenceEngineMarkdown(evidenceEngine),
    '',
    report,
    '',
    structuredSourceAppendixMarkdown(detail, evidencePackage, sourceStatuses),
  ].join('\n');
}

function evidencePackageFor(detail: any) {
  return detail.evidencePackage ?? {
    issuer: detail.title,
    research_mode: detail.researchModeLabel ?? detail.topic,
    search_timestamp: detail.generatedAt,
    search_queries_used: detail.searchQueries ?? [],
    document_inventory: detail.documentInventory ?? [],
    coverage_dashboard: detail.coverageDashboard ?? [],
    raw_evidence_notes: detail.facts ?? [],
    missing_items: [],
  };
}

function evidenceEngineFor(detail: any, generatedReport: any | null, evidencePackage: any): EvidenceCoverage {
  const packaged = generatedReport?.evidenceEngine ||
    (!generatedReport ? detail?.evidenceEngine || evidencePackage?.evidence_engine : null);

  if (packaged?.citations && Array.isArray(packaged.citations) && !generatedReport?.editedAt) {
    return packaged as EvidenceCoverage;
  }

  return buildEvidenceEngine({
    ...detail,
    evidencePackage,
  }, generatedReport?.content || detail?.snippet || '');
}

function researchWorkspaceFor(
  detail: any,
  generatedReport: any | null,
  evidencePackage: any,
  evidenceEngine: EvidenceCoverage
): ResearchWorkspace {
  const packaged = generatedReport?.researchWorkspace ||
    detail?.researchWorkspace ||
    evidencePackage?.research_workspace;

  if (packaged?.executiveSummary && packaged?.creditFactors && packaged?.keyRisks && !generatedReport?.editedAt) {
    return packaged as ResearchWorkspace;
  }

  return buildResearchWorkspace({
    ...detail,
    evidencePackage,
  }, generatedReport?.content || detail?.snippet || '', evidenceEngine);
}

function issuerDashboardFor(
  detail: any,
  generatedReport: any | null,
  evidencePackage: any,
  evidenceEngine: EvidenceCoverage
): IssuerDashboard {
  const packaged = generatedReport?.issuerDashboard ||
    detail?.issuerDashboard ||
    evidencePackage?.issuer_dashboard;

  if (packaged?.financialTrends && packaged?.ratingTimeline && packaged?.debtDashboard && packaged?.marketDashboard && !generatedReport?.editedAt) {
    return packaged as IssuerDashboard;
  }

  return buildIssuerDashboard({
    ...detail,
    evidencePackage,
  }, generatedReport?.content || detail?.snippet || '', evidenceEngine);
}

function structuredAnswerFor(
  detail: any,
  generatedReport: any | null,
  evidencePackage: any,
  evidenceEngine: EvidenceCoverage,
  researchWorkspace: ResearchWorkspace,
  issuerDashboard: IssuerDashboard
): StructuredAnswer {
  const packaged = generatedReport?.structuredAnswer ||
    detail?.structuredAnswer ||
    evidencePackage?.structured_answer;

  if (packaged?.summary && packaged?.analysis && packaged?.evidence && packaged?.recommendations && packaged?.confidence && !generatedReport?.editedAt) {
    return packaged as StructuredAnswer;
  }

  return buildStructuredAnswer({
    record: {
      ...detail,
      evidencePackage,
    },
    content: generatedReport?.content || detail?.snippet || '',
    evidenceEngine,
    researchWorkspace,
    issuerDashboard,
  });
}

function templateLabel(value: string) {
  return reportTemplates.find(([id]) => id === value)?.[1] ?? value;
}

function reportSections(content: string) {
  const lines = (content || '').split('\n');
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  function flush() {
    if (currentTitle || currentLines.join('').trim()) {
      sections.push({
        title: currentTitle || 'Opening',
        content: currentLines.join('\n').trim(),
      });
    }
  }

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);

    if (heading) {
      flush();
      currentTitle = heading[1].replace(/\*\*/g, '').trim();
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  flush();

  return sections.filter((section) => section.content);
}

function sourceKey(item: any) {
  return (item.url || item.source_url || item.title || item.document || '').toLowerCase();
}

function allSourceCandidates(detail: any, evidencePackage: any) {
  const inventory = (evidencePackage?.document_inventory ?? detail.documentInventory ?? []).map((item: any) => ({
    title: item.title ?? item.document,
    url: item.source_url ?? item.url,
    sourceTier: item.source_tier ?? item.sourceTier,
    sourceTierRank: item.sourceTierRank,
    documentType: item.document_type ?? item.type,
    recencyWindow: item.recency_window ?? item.recencyWindow,
    date: item.date,
    publicationDate: item.publication_date ?? item.publicationDate,
    datedDate: item.dated_date ?? item.datedDate,
    closingDate: item.closing_date ?? item.closingDate,
    emmaSubmissionId: item.emma_submission_id ?? item.emmaSubmissionId,
    cusip: item.cusip,
    filingEntity: item.filing_entity ?? item.filingEntity,
    confidenceTier: item.confidence_tier ?? item.confidenceTier ?? item.confidence,
    status: item.status,
    notes: item.notes,
  }));

  const live = (detail.searchResults ?? []).map((item: any) => ({
    title: item.title,
    url: item.url,
    sourceTier: item.sourceTier,
    sourceTierRank: item.sourceTierRank,
    documentType: item.documentType,
    recencyWindow: item.recencyWindow,
    date: item.date || item.last_updated,
    publicationDate: item.publicationDate,
    datedDate: item.datedDate,
    closingDate: item.closingDate,
    emmaSubmissionId: item.emmaSubmissionId,
    cusip: item.cusip,
    filingEntity: item.filingEntity,
    confidenceTier: item.confidenceTier,
    status: item.status,
    notes: item.notes || item.snippet,
  }));

  const seen = new Set<string>();
  return [...inventory, ...live].filter((item) => {
    const key = sourceKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function incrementCount(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sourceConfidence(item: any) {
  if ((item.sourceTierRank ?? 4) <= 1 || String(item.sourceTier ?? '').startsWith('Tier 1')) return 'High';
  if ((item.sourceTierRank ?? 4) <= 2 || String(item.sourceTier ?? '').startsWith('Tier 2')) return 'Medium';
  return 'Low';
}

function evidenceQualitySummary(detail: any, evidencePackage: any, sourceStatuses: Record<string, string>) {
  const sources = allSourceCandidates(detail, evidencePackage);
  const tierCounts: Record<string, number> = {};
  const recencyCounts: Record<string, number> = {};
  const verificationCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = {};

  sources.forEach((source) => {
    incrementCount(tierCounts, source.sourceTier || 'Unclassified');
    incrementCount(recencyCounts, source.recencyWindow || 'Undated source');
    incrementCount(verificationCounts, sourceStatuses[sourceKey(source)] ?? source.status ?? 'Candidate');
    incrementCount(confidenceCounts, sourceConfidence(source));
  });

  const noUpdateSignals = [
    detail.snippet,
    ...(detail.facts ?? []),
    ...(evidencePackage?.missing_items ?? []),
  ].join(' ');
  const reason = /No recent change found/i.test(noUpdateSignals)
    ? 'No recent change found'
    : /Stale source only/i.test(noUpdateSignals)
      ? 'Stale source only'
      : /Insufficient public evidence/i.test(noUpdateSignals)
        ? 'Insufficient public evidence'
        : /Needs manual verification/i.test(noUpdateSignals)
          ? 'Needs manual verification'
          : evidencePackage?.missing_items?.length
            ? 'Missing source coverage'
            : 'Evidence available for review';

  return {
    totalSources: sources.length,
    tierCounts,
    recencyCounts,
    verificationCounts,
    confidenceCounts,
    reason,
    missingItems: evidencePackage?.missing_items ?? [],
  };
}

function sourceQualityReason(source: any, sourceStatuses: Record<string, string>) {
  const status = sourceStatuses[sourceKey(source)] ?? source.status ?? 'Candidate';
  const recency = source.recencyWindow || 'Undated source';
  const tier = source.sourceTier || 'Unclassified';

  if (status === 'Missing') return 'Required source or field is missing from the package.';
  if (status === 'Rejected') return 'Analyst rejected this source for the current report.';
  if (/Undated|date to verify/i.test(recency)) return 'Date requires manual verification before relying on it.';
  if (/Tier 3|Tier 4|Unclassified/i.test(tier)) return 'Lower-tier or unclassified source; use only as context unless verified.';
  if (status === 'Used in Report') return 'Marked as used in the current report.';
  return 'Candidate source pending analyst review.';
}

function formatEntryDate(value: any) {
  if (!value) return '';
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toLocaleDateString();
}

function coverageStatusIsFound(row: any) {
  return /found|available|complete|verified|used/i.test(`${row?.status ?? ''} ${row?.confidence ?? ''}`);
}

function entryDocumentTitle(source: any) {
  return source.title || source.document || source.url || 'Document candidate';
}

function entryDocumentMeta(source: any) {
  return [
    source.documentType || source.type,
    source.source || source.sourceTier,
    source.publicationDate || source.date || source.recencyWindow,
  ].filter(Boolean).join(' / ') || 'Metadata pending';
}

function recentResearchFor(detail: any, generatedReport: any | null, input: any, reportTemplate: string) {
  const items = [
    generatedReport ? {
      title: generatedReport.templateLabel || templateLabel(reportTemplate),
      meta: `Draft generated ${formatEntryDate(generatedReport.generatedAt) || 'today'}`,
    } : null,
    detail.generatedAt ? {
      title: detail.researchModeLabel || detail.topic || 'Research run',
      meta: `Last updated ${formatEntryDate(detail.generatedAt)}`,
    } : null,
    detail.evidenceQualitySummary ? {
      title: 'Evidence note',
      meta: detail.evidenceQualitySummary,
    } : null,
    detail.summary ? {
      title: input.output_type || templateLabel(reportTemplate),
      meta: detail.summary,
    } : null,
  ].filter(Boolean);

  return items.slice(0, 3) as Array<{ title: string; meta: string }>;
}

function documentDiagnosticsFor(detail: any, evidencePackage: any) {
  return detail.documentDiagnostics ||
    evidencePackage?.document_diagnostics ||
    buildDocumentDiagnostics(detail.title, sourceCandidatesFromRecord(detail));
}

function retrievalDiagnosticsFor(detail: any, evidencePackage: any) {
  return detail.retrievalDiagnostics ||
    evidencePackage?.retrieval_diagnostics ||
    buildRetrievalDiagnostics({
      issuer: detail.title,
      sources: sourceCandidatesFromRecord(detail),
      searchQueries: detail.searchQueries ?? evidencePackage?.search_queries_used ?? [],
    });
}

function failureClassificationFor(detail: any, evidencePackage: any, documentDiagnostics: any, retrievalDiagnostics: any) {
  return detail.failureClassification ||
    evidencePackage?.failure_classification ||
    classifyResearchFailure({ documentDiagnostics, retrievalDiagnostics });
}

function pointWidth(value: number | null, values: Array<number | null>) {
  if (value === null) return '0%';
  const numeric = values.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  const max = Math.max(...numeric, 1);
  return `${Math.max(8, Math.round((value / max) * 100))}%`;
}

function debtDashboardMetrics(dashboard: IssuerDashboard) {
  return Object.values(dashboard.debtDashboard);
}

export function DetailPanel({
  detail,
  reportTemplate,
  generatedReport,
  reportVersions,
  sourceStatuses,
  runStatus,
  isGeneratingReport,
  reportError,
  onGenerateReport,
  onRegenerateSection,
  onUpdateReportContent,
  onSaveReportVersion,
  onRunStatusChange,
  onOpenReading,
  onSave,
  isSaved,
  isIssuerPinned,
  isReportPinned,
  isDocumentPinned,
  onToggleIssuerPin,
  onToggleReportPin,
  onToggleDocumentPin,
}: Props) {
  const [activeTab, setActiveTab] = useState('discovery');
  const [copyStatus, setCopyStatus] = useState('');
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState('');
  const [sectionWorkflow, setSectionWorkflow] = useState<Record<string, {
    verified?: boolean;
    locked?: boolean;
    source?: string;
    note?: string;
  }>>({});

  if (!detail) {
    return (
      <section className="workspace-panel answer-panel empty-state">
        <p className="eyebrow">Workflow</p>
        <h2>Research workflow</h2>
        <p className="muted">Search an issuer or upload a document to create a reusable research workspace.</p>
        <div className="empty-state-grid" aria-label="Research workflow acceptance steps">
          <div>
            <strong>1. Find documents</strong>
            <span>ACFR, OS/POS, EMMA filings, ratings, budget, board packets.</span>
          </div>
          <div>
            <strong>2. Diagnose coverage</strong>
            <span>See missing documents, failed retrieval paths, source tier, and confidence.</span>
          </div>
          <div>
            <strong>3. Generate work product</strong>
            <span>Create a professional memo with evidence appendix and citations.</span>
          </div>
        </div>
      </section>
    );
  }

  const input = workflowInput(detail, reportTemplate);
  const evidencePackage = evidencePackageFor(detail);
  const evidenceEngine = evidenceEngineFor(detail, generatedReport, evidencePackage);
  const researchWorkspace = researchWorkspaceFor(detail, generatedReport, evidencePackage, evidenceEngine);
  const issuerDashboard = issuerDashboardFor(detail, generatedReport, evidencePackage, evidenceEngine);
  const structuredAnswer = structuredAnswerFor(detail, generatedReport, evidencePackage, evidenceEngine, researchWorkspace, issuerDashboard);
  const evidenceQuality = evidenceQualitySummary(detail, evidencePackage, sourceStatuses);
  const evidenceSources = allSourceCandidates(detail, evidencePackage).slice(0, 12);
  const documentDiagnostics = documentDiagnosticsFor(detail, evidencePackage);
  const retrievalDiagnostics = retrievalDiagnosticsFor(detail, evidencePackage);
  const failureClassification = failureClassificationFor(detail, evidencePackage, documentDiagnostics, retrievalDiagnostics);
  const coverageRows = normalizeCoverageRows(evidencePackage?.coverage_dashboard ?? detail.coverageDashboard ?? []);
  const coverageFoundCount = coverageRows.filter(coverageStatusIsFound).length;
  const coverageTotal = coverageRows.length;
  const coveragePercent = coverageTotal > 0 ? Math.round((coverageFoundCount / coverageTotal) * 100) : 0;
  const missingCoverageAreas = coverageRows
    .filter((row: any) => !coverageStatusIsFound(row))
    .slice(0, 2)
    .map((row: any) => row.area || row.document || row.title)
    .filter(Boolean);
  const recentDocuments = allSourceCandidates(detail, evidencePackage)
    .filter((source) => entryDocumentTitle(source))
    .slice(0, 3);
  const recentResearch = recentResearchFor(detail, generatedReport, input, reportTemplate);
  const needsReviewCount = Object.entries(evidenceQuality.verificationCounts)
    .filter(([key]) => /candidate|missing|manual|verify|rejected/i.test(key))
    .reduce((total, [, value]) => total + value, 0);
  const filenameBase = [
    slug(detail.title || 'issuer'),
    slug(detail.researchModeLabel || detail.topic || 'research'),
    slug(generatedReport?.templateLabel || input.output_type || reportTemplate),
    new Date().toISOString().slice(0, 10),
  ].join('_');

  function downloadMarkdown() {
    downloadBlob(
      markdownFor(detail, generatedReport, sourceStatuses, runStatus, reportTemplate),
      `${filenameBase}.md`,
      'text/markdown;charset=utf-8'
    );
  }

  function downloadEvidenceJson() {
    downloadBlob(
      JSON.stringify({
        ...evidencePackage,
        evidence_engine: evidenceEngine,
        research_workspace: researchWorkspace,
        issuer_dashboard: issuerDashboard,
        structured_answer: structuredAnswer,
      }, null, 2),
      `${slug(detail.title || 'issuer')}_${slug(detail.researchModeLabel || 'research')}_evidence_package_${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8'
    );
  }

  async function downloadDocx() {
    const res = await fetch('/api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: generatedReport?.title || detail.title,
        content: markdownFor(detail, generatedReport, sourceStatuses, runStatus, reportTemplate),
        filename: `${filenameBase}.docx`,
      }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenameBase}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: generatedReport?.title || detail.title,
        content: markdownFor(detail, generatedReport, sourceStatuses, runStatus, reportTemplate),
        filename: `${filenameBase}.pdf`,
      }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenameBase}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copyReport() {
    await navigator.clipboard.writeText(markdownFor(detail, generatedReport, sourceStatuses, runStatus, reportTemplate));
    setCopyStatus('Copied');
    window.setTimeout(() => setCopyStatus(''), 1600);
  }

  function updateSectionWorkflow(sectionTitle: string, patch: {
    verified?: boolean;
    locked?: boolean;
    source?: string;
    note?: string;
  }) {
    setSectionWorkflow((workflow) => ({
      ...workflow,
      [sectionTitle]: {
        ...(workflow[sectionTitle] ?? {}),
        ...patch,
      },
    }));
  }

  return (
    <section className="workspace-panel answer-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>{detail.title}</h2>
        </div>
        <label className="status-select">
          <span>Status</span>
          <select value={runStatus} onChange={(event) => onRunStatusChange(event.target.value)}>
            {runStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>

      <section className="issuer-entry-panel">
        <div className="issuer-entry-summary">
          <p className="eyebrow">Issuer workspace</p>
          <h3>{detail.title}</h3>
          <p>{detail.summary}</p>
          <div className="record-meta issuer-entry-meta">
            <span>{detail.researchModeLabel ?? detail.topic}</span>
            <span>{generatedReport?.templateLabel || input.output_type || reportTemplate}</span>
            <span>{detail.source}</span>
          </div>
        </div>

        <div className="issuer-entry-grid">
          <article className="issuer-entry-card coverage-card">
            <div>
              <span>Coverage</span>
              <strong>{coverageTotal > 0 ? `${coveragePercent}%` : 'Not started'}</strong>
            </div>
            <div className="coverage-meter" aria-label="Coverage progress">
              <span style={{ width: `${coveragePercent}%` }} />
            </div>
            <p>
              {coverageTotal > 0
                ? `${coverageFoundCount} of ${coverageTotal} evidence areas have usable support.`
                : 'Run search or upload documents to build the issuer evidence map.'}
            </p>
            {missingCoverageAreas.length > 0 && (
              <p className="issuer-entry-note">Needs: {missingCoverageAreas.join(', ')}</p>
            )}
          </article>

          <article className="issuer-entry-card">
            <span>Recent Documents</span>
            <div className="entry-list">
              {recentDocuments.length === 0 && (
                <p className="issuer-entry-note">No documents attached yet.</p>
              )}
              {recentDocuments.map((source, index) => (
                <div key={`${sourceKey(source) || entryDocumentTitle(source)}-${index}`} className="entry-list-item">
                  <strong>{entryDocumentTitle(source)}</strong>
                  <p>{entryDocumentMeta(source)}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="issuer-entry-card">
            <span>Recent Research</span>
            <div className="entry-list">
              {recentResearch.length === 0 && (
                <p className="issuer-entry-note">No prior research run is saved for this issuer.</p>
              )}
              {recentResearch.map((item, index) => (
                <div key={`${item.title}-${index}`} className="entry-list-item">
                  <strong>{item.title}</strong>
                  <p>{item.meta}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="issuer-entry-card quick-actions-card">
            <span>Quick Actions</span>
            <div className="quick-actions-stack">
              <button className="button-primary" onClick={() => setActiveTab('discovery')}>Review Evidence</button>
              <button className="button-secondary" onClick={() => setActiveTab('report')}>Draft Report</button>
              <button className="button-secondary" onClick={onOpenReading}>Open Editor</button>
              <button className="button-secondary" onClick={onSave}>{isSaved ? 'Saved to Library' : 'Save Workspace'}</button>
              <button className="button-secondary pin-button" onClick={onToggleIssuerPin}>
                {isIssuerPinned ? 'Issuer Pinned' : 'Pin Issuer'}
              </button>
              <button className="button-secondary pin-button" onClick={onToggleReportPin} disabled={!generatedReport}>
                {isReportPinned ? 'Report Pinned' : 'Pin Report'}
              </button>
              <button className="button-secondary pin-button" onClick={onToggleDocumentPin}>
                {isDocumentPinned ? 'Document Pinned' : 'Pin Document'}
              </button>
            </div>
          </article>
        </div>
      </section>

      {detail.financeFocused && detail.coreFinanceDocumentsFound === false && (
        <div className="warning-banner">
          Core finance documents were not found in this search run. The memo is a preliminary issuer overview, not a credit conclusion.
        </div>
      )}

      <div className="workflow-tabs">
        {workflowTabs.map(([id, label]) => (
          <button
            key={id}
            className={activeTab === id ? 'active' : ''}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {isGeneratingReport && (
        <div className="loading-card" role="status" aria-live="polite">
          <span className="loading-spinner" />
          <div>
            <strong>Generating professional memo</strong>
            <p>Structuring credit analysis, evidence appendix, confidence notes, and follow-up questions.</p>
          </div>
        </div>
      )}

      {activeTab === 'discovery' && (
        <>
          <section className="answer-section structured-answer-section">
            <div className="section-heading">
              <div>
                <h3>Structured answer</h3>
                <p className="muted small">Short answer format for review: Summary, Analysis, Evidence, Recommendations.</p>
              </div>
              <span className={`confidence-badge ${structuredAnswer.confidence.level.toLowerCase()}`}>
                {structuredAnswer.confidence.level}
              </span>
            </div>
            <div className="structured-answer-grid">
              <article>
                <span>Summary</span>
                {structuredAnswer.summary.slice(0, 4).map((item, index) => (
                  <p key={`structured-summary-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Analysis</span>
                {structuredAnswer.analysis.slice(0, 5).map((item, index) => (
                  <p key={`structured-analysis-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Evidence</span>
                {structuredAnswer.evidence.slice(0, 5).map((item, index) => (
                  <p key={`structured-evidence-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Recommendations</span>
                {structuredAnswer.recommendations.slice(0, 5).map((item, index) => (
                  <p key={`structured-recommendation-${index}`}>{item}</p>
                ))}
              </article>
            </div>
            <div className="confidence-explanation">
              <span>Confidence explanation</span>
              <strong>{structuredAnswer.confidence.explanation}</strong>
            </div>
            <div className="follow-up-panel">
              <div className="section-heading">
                <div>
                  <h4>Suggested follow-up questions</h4>
                  <p className="muted small">Use these to continue the workflow without guessing the next prompt.</p>
                </div>
              </div>
              <div className="follow-up-grid">
                {structuredAnswer.suggestedFollowUps.slice(0, 7).map((question, index) => (
                  <button key={`${question}-${index}`} type="button" className="follow-up-chip">
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <details className="progressive-section secondary-disclosure">
            <summary>
              <div>
                <span>Secondary</span>
                <strong>Analyst workspace, credit factors, and risks</strong>
              </div>
              <em>Open when moving from answer review to credit analysis.</em>
            </summary>

          <section className="answer-section research-workspace-section">
            <div className="section-heading">
              <div>
                <h3>Executive summary workspace</h3>
                <p className="muted small">A source-aware analyst summary organized for credit review.</p>
              </div>
              <span className="status-pill ready">Phase 5</span>
            </div>
            <div className="workspace-summary-grid">
              <article>
                <span>Strengths</span>
                {researchWorkspace.executiveSummary.strengths.slice(0, 4).map((item, index) => (
                  <p key={`strength-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Weaknesses</span>
                {researchWorkspace.executiveSummary.weaknesses.slice(0, 4).map((item, index) => (
                  <p key={`weakness-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Key Metrics</span>
                {researchWorkspace.executiveSummary.keyMetrics.slice(0, 5).map((item, index) => (
                  <p key={`metric-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Credit Drivers</span>
                {researchWorkspace.executiveSummary.creditDrivers.slice(0, 5).map((item, index) => (
                  <p key={`driver-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Risks</span>
                {researchWorkspace.executiveSummary.risks.slice(0, 5).map((item, index) => (
                  <p key={`summary-risk-${index}`}>{item}</p>
                ))}
              </article>
              <article>
                <span>Evidence</span>
                {researchWorkspace.executiveSummary.evidence.slice(0, 5).map((item, index) => (
                  <p key={`summary-evidence-${index}`}>{item}</p>
                ))}
              </article>
            </div>
            <div className="workspace-outlook">
              <span>Outlook</span>
              <strong>{researchWorkspace.executiveSummary.outlook}</strong>
            </div>
          </section>

          <section className="answer-section credit-factors-section">
            <div className="section-heading">
              <div>
                <h3>Credit factors</h3>
                <p className="muted small">Separate analytical sections for the main municipal credit profile.</p>
              </div>
              <span className="status-pill">
                {researchWorkspace.creditFactors.filter((factor) => factor.status === 'Supported').length} supported
              </span>
            </div>
            <div className="credit-factor-grid">
              {researchWorkspace.creditFactors.map((factor) => (
                <article key={factor.key} className={`credit-factor-card ${factor.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div className="credit-factor-head">
                    <h4>{factor.label}</h4>
                    <span>{factor.status}</span>
                  </div>
                  <p>{factor.summary}</p>
                  <div className="record-meta">
                    <span>{factor.confidence} confidence</span>
                    <span>{factor.evidenceCount} evidence items</span>
                  </div>
                  {factor.gaps.length > 0 && (
                    <p className="factor-gap">Gap: {factor.gaps[0]}</p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="answer-section key-risks-section">
            <div className="section-heading">
              <div>
                <h3>Key risks monitor</h3>
                <p className="muted small">Automatic risk summaries for common public-finance monitoring themes.</p>
              </div>
              <span className="status-pill warning">
                {researchWorkspace.keyRisks.filter((risk) => risk.level === 'Elevated' || risk.level === 'Watch').length} active/watch
              </span>
            </div>
            <div className="risk-monitor-grid">
              {researchWorkspace.keyRisks.map((risk) => (
                <article key={risk.key} className={`risk-monitor-card ${risk.level.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div className="risk-card-head">
                    <h4>{risk.label}</h4>
                    <span>{risk.level}</span>
                  </div>
                  <p>{risk.summary}</p>
                  <div className="record-meta">
                    <span>{risk.confidence} confidence</span>
                    <span>{risk.evidenceCount} evidence items</span>
                  </div>
                  <p className="next-check">{risk.nextCheck}</p>
                </article>
              ))}
            </div>
          </section>

          </details>

          <details className="progressive-section secondary-disclosure">
            <summary>
              <div>
                <span>Secondary</span>
                <strong>Evidence coverage and statement support</strong>
              </div>
              <em>Open before drafting or exporting.</em>
            </summary>

          <section className="answer-section evidence-command">
            <div className="section-heading">
              <div>
                <h3>Evidence command panel</h3>
                <p className="muted small">Use this before drafting or exporting a deliverable.</p>
              </div>
              <span className={`status-pill ${needsReviewCount > 0 ? 'warning' : 'ready'}`}>
                {evidenceQuality.reason}
              </span>
            </div>
            <div className="evidence-metric-grid">
              <div>
                <span>Coverage score</span>
                <strong>{evidenceEngine.coveragePercent}%</strong>
                <p>AI statements mapped to direct evidence.</p>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{evidenceEngine.confidence}</strong>
                <p>Combined source tier, match quality, and page support.</p>
              </div>
              <div>
                <span>Evidence</span>
                <strong>{evidenceEngine.citationCount}</strong>
                <p>Clickable citations attached to statements.</p>
              </div>
              <div>
                <span>Missing</span>
                <strong>{evidenceEngine.missingStatements}</strong>
                <p>Statements needing a source, page, or reviewer note.</p>
              </div>
            </div>
          </section>

          {evidenceEngine.warning && (
            <section className="missing-evidence-warning">
              <div>
                <p className="eyebrow">Missing evidence warning</p>
                <h3>Do not treat unsupported statements as final.</h3>
                <p>{evidenceEngine.warning}</p>
              </div>
              <strong>{evidenceEngine.coveragePercent}% covered</strong>
            </section>
          )}

          <section className="answer-section evidence-panel-section">
            <div className="section-heading">
              <div>
                <h3>Evidence panel</h3>
                <p className="muted small">Each AI statement is mapped to source, document, page, section, confidence, and a clickable citation.</p>
              </div>
              <span className={`status-pill ${evidenceEngine.warning ? 'warning' : 'ready'}`}>
                {evidenceEngine.citationCount} citations
              </span>
            </div>
            <div className="mini-table evidence-statement-table">
              <div className="mini-table-row header">
                <span>AI Statement</span>
                <span>Source</span>
                <span>Document</span>
                <span>Page</span>
                <span>Section</span>
                <span>Confidence</span>
                <span>Citation</span>
              </div>
              {evidenceEngine.citations.length === 0 && (
                <div className="mini-table-row">
                  <span>No statement-level evidence mapping yet.</span>
                  <span>Not found</span>
                  <span>Not found</span>
                  <span>N/A</span>
                  <span>Not found</span>
                  <span>Low</span>
                  <span>Add source</span>
                </div>
              )}
              {evidenceEngine.citations.map((citation) => (
                <div key={citation.id} className="mini-table-row">
                  <span>{citation.statement}</span>
                  <span>{citation.source}</span>
                  <span>{citation.document}</span>
                  <span>{citation.page}</span>
                  <span>{citation.section}</span>
                  <span className={`evidence-confidence ${citation.confidence.toLowerCase()}`}>{citation.confidence}</span>
                  <span>
                    {citation.citationUrl ? (
                      <a href={citation.citationUrl} target="_blank" rel="noreferrer">
                        {citation.page !== 'N/A' ? 'Open PDF page' : 'Open source'}
                      </a>
                    ) : (
                      'No URL'
                    )}
                  </span>
                </div>
              ))}
            </div>
            {evidenceEngine.missingEvidence.length > 0 && (
              <div className="missing-evidence-list">
                <h4>Statements without direct evidence</h4>
                {evidenceEngine.missingEvidence.slice(0, 8).map((statement, index) => (
                  <p key={`${statement}-${index}`}>{statement}</p>
                ))}
              </div>
            )}
          </section>

          </details>

          <details className="progressive-section tertiary-disclosure">
            <summary>
              <div>
                <span>Tertiary</span>
                <strong>Diagnostics, raw source material, and setup</strong>
              </div>
              <em>Open for troubleshooting or analyst QA.</em>
            </summary>

          {failureClassification && (
            <section className={`diagnostic-alert ${failureClassification.severity || 'warning'}`}>
              <div>
                <p className="eyebrow">Failure classification</p>
                <h3>{failureClassification.title}</h3>
                <p>{failureClassification.reason}</p>
              </div>
              <strong>{failureClassification.recommendation}</strong>
            </section>
          )}

          <section className="answer-section diagnostics-section">
            <div className="section-heading">
              <div>
                <h3>Document inventory diagnostics</h3>
                <p className="muted small">Required core documents for issuer-level public finance research.</p>
              </div>
              <span className={`status-pill ${documentDiagnostics.missingDocuments.length > 0 ? 'warning' : 'ready'}`}>
                {documentDiagnostics.coveragePercent}% coverage
              </span>
            </div>
            <div className="diagnostic-metric-grid">
              <div>
                <span>Coverage</span>
                <strong>{documentDiagnostics.coveragePercent}%</strong>
              </div>
              <div>
                <span>Missing Documents</span>
                <strong>{documentDiagnostics.missingDocuments.length}</strong>
              </div>
              <div>
                <span>Document Count</span>
                <strong>{documentDiagnostics.documentCount}</strong>
              </div>
            </div>
            <div className="document-diagnostic-grid">
              {documentDiagnostics.documents.map((document: any) => (
                <article key={document.key} className={`document-diagnostic-card ${document.status}`}>
                  <div className="document-diagnostic-head">
                    <span className={`doc-check ${document.status}`}>
                      {document.status === 'found' ? '✓' : '×'}
                    </span>
                    <div>
                      <h4>{document.label}</h4>
                      <p>{document.status === 'found' ? document.sourceTitle : document.reason}</p>
                    </div>
                  </div>
                  <div className="document-diagnostic-meta">
                    <span>{document.date || 'No date'}</span>
                    <span>{document.sourceTier || (document.status === 'found' ? 'Unclassified' : 'Missing')}</span>
                  </div>
                  {document.status === 'missing' && (
                    <p className="retry-query">Retry: {document.retryQuery}</p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="answer-section diagnostics-section">
            <div className="section-heading">
              <div>
                <h3>Retrieval diagnostics</h3>
                <p className="muted small">Where the research run searched, what succeeded, and how to retry failures.</p>
              </div>
              <span className={`status-pill ${retrievalDiagnostics.failureCount > 0 ? 'warning' : 'ready'}`}>
                {retrievalDiagnostics.successCount} success / {retrievalDiagnostics.failureCount} failure
              </span>
            </div>
            <div className="mini-table retrieval-diagnostics-table">
              <div className="mini-table-row header">
                <span>Target</span>
                <span>Status</span>
                <span>Reason</span>
                <span>Retry Query</span>
              </div>
              {retrievalDiagnostics.items.map((item: any) => (
                <div key={item.key} className="mini-table-row">
                  <span>{item.label}</span>
                  <span className={`retrieval-status ${item.status.toLowerCase()}`}>{item.status}</span>
                  <span>{item.reason}</span>
                  <span className="retry-query">{item.retryQuery}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="answer-section">
            <h3>Research setup</h3>
            <div className="key-value-grid">
              {Object.entries(input).map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{typeof value === 'boolean' ? String(value) : value ? String(value) : 'null'}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="answer-section source-answer-section">
            <h3>Source answer text</h3>
            <p className="muted small">Original model text preserved as source material. Use the structured answer above for review.</p>
            <FormattedReport content={detail.snippet} compact />
          </section>

          <section className="answer-section">
            <h3>Evidence quality dashboard</h3>
            <div className="key-value-grid">
              <div>
                <span>Total sources</span>
                <strong>{evidenceQuality.totalSources}</strong>
              </div>
              <div>
                <span>Verification reason</span>
                <strong>{evidenceQuality.reason}</strong>
              </div>
              <div>
                <span>High confidence</span>
                <strong>{evidenceQuality.confidenceCounts.High ?? 0}</strong>
              </div>
              <div>
                <span>Needs follow-up</span>
                <strong>{(evidenceQuality.verificationCounts.Missing ?? 0) + (evidenceQuality.verificationCounts.Candidate ?? 0)}</strong>
              </div>
            </div>
            <div className="mini-table evidence-quality-table">
              <div className="mini-table-row header">
                <span>Dimension</span>
                <span>Breakdown</span>
                <span>Why it matters</span>
              </div>
              <div className="mini-table-row">
                <span>Source tier</span>
                <span>{Object.entries(evidenceQuality.tierCounts).map(([key, value]) => `${key}: ${value}`).join(' | ') || 'No sources'}</span>
                <span>Tier 1/2 evidence should anchor finance conclusions.</span>
              </div>
              <div className="mini-table-row">
                <span>Recency</span>
                <span>{Object.entries(evidenceQuality.recencyCounts).map(([key, value]) => `${key}: ${value}`).join(' | ') || 'No dates'}</span>
                <span>Recent items should be separated from older context.</span>
              </div>
              <div className="mini-table-row">
                <span>Verification status</span>
                <span>{Object.entries(evidenceQuality.verificationCounts).map(([key, value]) => `${key}: ${value}`).join(' | ') || 'No status'}</span>
                <span>Candidate and missing items require review before delivery.</span>
              </div>
              <div className="mini-table-row">
                <span>Confidence</span>
                <span>{Object.entries(evidenceQuality.confidenceCounts).map(([key, value]) => `${key}: ${value}`).join(' | ') || 'No confidence score'}</span>
                <span>Confidence combines source tier and review status.</span>
              </div>
            </div>
            <div className="mini-table evidence-source-register">
              <div className="mini-table-row header">
                <span>Source</span>
                <span>Tier</span>
                <span>Recency</span>
                <span>Verification</span>
                <span>Confidence</span>
                <span>Reason</span>
              </div>
              {evidenceSources.length === 0 && (
                <div className="mini-table-row">
                  <span>No sources</span>
                  <span>Unclassified</span>
                  <span>Undated</span>
                  <span>Missing</span>
                  <span>Low</span>
                  <span>Run research or attach a document to populate evidence quality.</span>
                </div>
              )}
              {evidenceSources.map((source, index) => (
                <div key={`${sourceKey(source) || 'source'}-${index}`} className="mini-table-row">
                  <span>{source.title || source.document || source.url || 'Untitled source'}</span>
                  <span>{source.sourceTier || 'Unclassified'}</span>
                  <span>{source.recencyWindow || source.date || 'Undated source'}</span>
                  <span>{sourceStatuses[sourceKey(source)] ?? source.status ?? 'Candidate'}</span>
                  <span>{sourceConfidence(source)}</span>
                  <span>{sourceQualityReason(source, sourceStatuses)}</span>
                </div>
              ))}
            </div>
          </section>

          {detail.searchQueries?.length > 0 && (
            <section className="answer-section">
              <h3>Search queries used</h3>
              <div className="stack">
                {detail.searchQueries.map((query: string) => (
                  <div key={query} className="fact-line">{query}</div>
                ))}
              </div>
            </section>
          )}

          {detail.coverageDashboard?.length > 0 && (
            <section className="answer-section">
              <h3>Coverage dashboard</h3>
              <div className="mini-table">
                <div className="mini-table-row header">
                  <span>Evidence Area</span>
                  <span>Status</span>
                  <span>Confidence</span>
                </div>
                {detail.coverageDashboard.map((row: any, index: number) => (
                  <div key={`${row.area || 'coverage'}-${index}`} className="mini-table-row">
                    <span>{row.area}</span>
                    <span>{row.status}</span>
                    <span>{row.confidence}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {detail.documentInventory?.length > 0 && (
            <section className="answer-section">
              <h3>Document inventory</h3>
              <div className="document-list">
                {detail.documentInventory.map((row: any, index: number) => (
                  <article key={`${row.document || 'document'}-${row.url ?? row.source ?? index}`} className="document-row">
                    <div>
                      {row.url ? (
                        <a href={row.url} target="_blank" rel="noreferrer">
                          <strong>{row.document}</strong>
                        </a>
                      ) : (
                        <strong>{row.document}</strong>
                      )}
                      <p className="muted small">{row.type} · {row.source} · {row.date} · {row.recencyWindow ?? 'Undated source'}</p>
                    </div>
                    <span className="tier-pill">{row.sourceTier}</span>
                  </article>
                ))}
              </div>
            </section>
          )}

          {evidencePackage.raw_evidence_notes?.length > 0 && (
            <section className="answer-section">
              <h3>Raw evidence notes</h3>
              <div className="stack">
                {evidencePackage.raw_evidence_notes.slice(0, 8).map((item: any, index: number) => (
                  <div key={`${item.source_title || 'evidence'}-${item.claim || index}`} className="fact-line">
                    {item.claim}
                  </div>
                ))}
              </div>
            </section>
          )}

          {evidencePackage.missing_items?.length > 0 && (
            <section className="answer-section">
              <h3>Missing items</h3>
              <div className="stack">
                {evidencePackage.missing_items.map((item: string, index: number) => (
                  <div key={`${item}-${index}`} className="fact-line">{item}</div>
                ))}
              </div>
            </section>
          )}

          </details>
        </>
      )}

      {activeTab === 'dashboard' && (
        <>
          <section className="answer-section issuer-dashboard-section">
            <div className="section-heading">
              <div>
                <h3>Financial trends</h3>
                <p className="muted small">Revenue, expenses, cash, debt, liquidity, and capital spending extracted from available evidence.</p>
              </div>
              <span className="status-pill">Historical charts</span>
            </div>
            <div className="financial-trend-grid">
              {issuerDashboard.financialTrends.map((metric) => {
                const values = metric.dataPoints.map((point) => point.value);
                return (
                  <article key={metric.key} className={`trend-card ${metric.trend.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="trend-card-head">
                      <div>
                        <span>{metric.label}</span>
                        <strong>{metric.currentValue}</strong>
                      </div>
                      <em>{metric.trend}</em>
                    </div>
                    <div className="trend-bars">
                      {metric.dataPoints.map((point, index) => (
                        <div key={`${metric.key}-${point.year}-${index}`} className="trend-bar-row">
                          <span>{point.year}</span>
                          <div className="trend-bar-track">
                            <i style={{ width: pointWidth(point.value, values) }} />
                          </div>
                          <strong>{point.value !== null ? point.label.slice(0, 28) : 'Needs source'}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="record-meta">
                      <span>{metric.confidence} confidence</span>
                      <span>{metric.evidence.length} evidence items</span>
                    </div>
                    <p className="next-check">{metric.nextCheck}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="answer-section issuer-dashboard-section">
            <div className="section-heading">
              <div>
                <h3>Rating timeline</h3>
                <p className="muted small">Historical ratings, rating actions, and outlook changes surfaced in this research run.</p>
              </div>
              <span className="status-pill">
                {issuerDashboard.ratingTimeline.length} events
              </span>
            </div>
            <div className="rating-timeline">
              {issuerDashboard.ratingTimeline.map((item, index) => (
                <article key={`${item.date}-${item.agency}-${index}`} className="rating-event">
                  <div className="rating-date">{item.date}</div>
                  <div>
                    <h4>{item.agency}</h4>
                    <p>{item.action}</p>
                    <div className="record-meta">
                      <span>{item.rating}</span>
                      <span>{item.outlook}</span>
                      <span>{item.confidence} confidence</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="answer-section issuer-dashboard-section">
            <div className="section-heading">
              <div>
                <h3>Debt dashboard</h3>
                <p className="muted small">Outstanding debt, callable bonds, maturities, coupon, and spread coverage.</p>
              </div>
              <span className="status-pill">
                {debtDashboardMetrics(issuerDashboard).filter((metric) => metric.status === 'Available').length} available
              </span>
            </div>
            <div className="debt-dashboard-grid">
              {debtDashboardMetrics(issuerDashboard).map((metric) => (
                <article key={metric.label} className={`debt-metric-card ${metric.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <div className="record-meta">
                    <span>{metric.status}</span>
                    <span>{metric.confidence} confidence</span>
                  </div>
                  <p>{metric.nextCheck}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="answer-section issuer-dashboard-section">
            <div className="section-heading">
              <div>
                <h3>Market dashboard</h3>
                <p className="muted small">Comparable issuers, benchmark spreads, recent trades, and relative value.</p>
              </div>
              <span className="status-pill warning">Market data needs verification</span>
            </div>
            <div className="market-metric-grid">
              {[issuerDashboard.marketDashboard.benchmarkSpreads, issuerDashboard.marketDashboard.recentTrades, issuerDashboard.marketDashboard.relativeValue].map((metric) => (
                <article key={metric.label} className="market-metric-card">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.nextCheck}</p>
                </article>
              ))}
            </div>
            <div className="mini-table market-comps-table">
              <div className="mini-table-row header">
                <span>Comparable Issuer</span>
                <span>Rating</span>
                <span>Spread</span>
                <span>Recent Trade</span>
                <span>Relative Value</span>
              </div>
              {issuerDashboard.marketDashboard.comparableIssuers.map((issuer, index) => (
                <div key={`${issuer.issuer}-${index}`} className="mini-table-row">
                  <span>{issuer.issuer}</span>
                  <span>{issuer.rating}</span>
                  <span>{issuer.spread}</span>
                  <span>{issuer.recentTrade}</span>
                  <span>{issuer.relativeValue}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab === 'report' && (
        <section className="answer-section report-workflow">
          <div className="report-workflow-head">
            <div>
              <h3>LLM writer</h3>
              <p className="muted small">
                Output type is controlled from the intake panel. Regenerate after changing it.
              </p>
            </div>
            <span className="status-pill">Layer 3</span>
          </div>

          <div className="report-controls">
            <div className="selected-template">
              <span>Selected Output Type</span>
              <strong>{templateLabel(reportTemplate)}</strong>
            </div>
            <button
              className="button-primary"
              onClick={onGenerateReport}
              disabled={isGeneratingReport}
            >
              {isGeneratingReport ? 'Generating...' : generatedReport ? 'Regenerate' : 'Generate report'}
            </button>
          </div>

          {reportError && (
            <div className="error-banner">{reportError}</div>
          )}

          {generatedReport ? (
            <article className="generated-report">
              <div className="record-meta">
                <span>{generatedReport.templateLabel}</span>
                <span>{generatedReport.model}</span>
                <span>{new Date(generatedReport.generatedAt).toLocaleString()}</span>
                <span>{reportVersions.length} versions</span>
              </div>
              <h3>{generatedReport.title}</h3>

              <div className="report-ai-experience">
                <div>
                  <span>AI Confidence</span>
                  <strong>{structuredAnswer.confidence.level}</strong>
                  <p>{structuredAnswer.confidence.explanation}</p>
                </div>
                <div>
                  <span>Recommended Next Questions</span>
                  {structuredAnswer.suggestedFollowUps.slice(0, 3).map((question, index) => (
                    <p key={`${question}-${index}`}>{question}</p>
                  ))}
                </div>
              </div>

              <div className="report-evidence-summary">
                <div>
                  <span>Evidence Coverage</span>
                  <strong>{evidenceEngine.coveragePercent}%</strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>{evidenceEngine.confidence}</strong>
                </div>
                <div>
                  <span>Citations</span>
                  <strong>{evidenceEngine.citationCount}</strong>
                </div>
                <div>
                  <span>Missing Evidence</span>
                  <strong>{evidenceEngine.missingStatements}</strong>
                </div>
              </div>

              {evidenceEngine.warning && (
                <div className="missing-evidence-warning compact-warning">
                  <div>
                    <p className="eyebrow">Evidence warning</p>
                    <p>{evidenceEngine.warning}</p>
                  </div>
                </div>
              )}

              <div className="report-toolbar">
                <button className="button-secondary" onClick={() => setIsEditingReport((editing) => !editing)}>
                  {isEditingReport ? 'Preview Report' : 'Edit Report'}
                </button>
                <button className="button-secondary" onClick={onSaveReportVersion}>
                  Save Version
                </button>
                <button className="button-secondary" onClick={onOpenReading}>
                  Open in Reading Room
                </button>
              </div>

              {isEditingReport ? (
                <textarea
                  className="report-editor"
                  value={generatedReport.content}
                  onChange={(event) => onUpdateReportContent(event.target.value)}
                />
              ) : (
                <FormattedReport content={generatedReport.content} evidenceEngine={evidenceEngine} />
              )}

              <section className="section-regeneration">
                <div className="section-heading">
                  <div>
                    <h3>Section controls</h3>
                    <p className="muted small">Regenerate one section without replacing the full report.</p>
                  </div>
                </div>
                <div className="section-list">
                  {reportSections(generatedReport.content).map((section) => (
                    <div key={section.title} className="section-row section-workflow-row">
                      <div>
                        <span>{section.title}</span>
                        <div className="record-meta">
                          <span>{sectionWorkflow[section.title]?.verified ? 'Verified' : 'Draft'}</span>
                          <span>{sectionWorkflow[section.title]?.locked ? 'Locked' : 'Editable'}</span>
                          {sectionWorkflow[section.title]?.source && <span>Source attached</span>}
                        </div>
                        <div className="section-inline-fields">
                          <input
                            value={sectionWorkflow[section.title]?.source ?? ''}
                            onChange={(event) => updateSectionWorkflow(section.title, { source: event.target.value })}
                            placeholder="Add source URL or source note"
                          />
                          <input
                            value={sectionWorkflow[section.title]?.note ?? ''}
                            onChange={(event) => updateSectionWorkflow(section.title, { note: event.target.value })}
                            placeholder="Reviewer note"
                          />
                        </div>
                      </div>
                      <div className="section-actions">
                        <button
                          className="button-secondary"
                          onClick={() => updateSectionWorkflow(section.title, { verified: !sectionWorkflow[section.title]?.verified })}
                        >
                          {sectionWorkflow[section.title]?.verified ? 'Unverify' : 'Mark Verified'}
                        </button>
                        <button
                          className="button-secondary"
                          onClick={() => updateSectionWorkflow(section.title, { locked: !sectionWorkflow[section.title]?.locked })}
                        >
                          {sectionWorkflow[section.title]?.locked ? 'Unlock' : 'Lock'}
                        </button>
                        <button
                          className="button-secondary"
                          onClick={() => onRegenerateSection(section.title, section.content)}
                          disabled={isGeneratingReport || sectionWorkflow[section.title]?.locked}
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {reportVersions.length > 0 && (
                <section className="version-compare">
                  <div className="section-heading">
                    <div>
                      <h3>Version history</h3>
                      <p className="muted small">Save report drafts before larger rewrites or section regeneration.</p>
                    </div>
                    <select value={compareVersionId} onChange={(event) => setCompareVersionId(event.target.value)}>
                      <option value="">Compare with...</option>
                      {reportVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {compareVersionId && (
                    <div className="compare-grid">
                      <div>
                        <h4>Saved version</h4>
                        <div className="compare-box">
                          {reportVersions.find((version) => version.id === compareVersionId)?.content}
                        </div>
                      </div>
                      <div>
                        <h4>Current draft</h4>
                        <div className="compare-box">{generatedReport.content}</div>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </article>
          ) : (
            <div className="empty-workflow-state">
              Choose the output type in Research intake, then generate the professional report from the discovery package.
            </div>
          )}
        </section>
      )}

      {activeTab === 'export' && (
        <section className="answer-section report-workflow">
          <div className="report-workflow-head">
            <div>
              <h3>File output and export</h3>
              <p className="muted small">Download or reuse the report and evidence package.</p>
            </div>
            <span className="status-pill">Layer 4</span>
          </div>

          <div className="export-grid">
            <button className="button-secondary" onClick={downloadMarkdown}>Download Markdown</button>
            <button className="button-secondary" onClick={downloadPdf}>Download PDF</button>
            <button className="button-secondary" onClick={downloadDocx}>Download DOCX</button>
            <button className="button-secondary" onClick={downloadEvidenceJson}>Download Evidence JSON</button>
            <button className="button-secondary" onClick={copyReport}>Copy to Clipboard</button>
            <button className="button-primary" onClick={onSave}>{isSaved ? 'Saved to Library' : 'Save to Research Library'}</button>
          </div>
          {copyStatus && <p className="muted small">{copyStatus}</p>}
        </section>
      )}

      <section className="answer-section">
        <h3>Citations</h3>
        <div className="citation-row">
          {detail.citations?.map((c: string) => (
            isUrl(c) ? (
              <a key={c} className="citation" href={c} target="_blank" rel="noreferrer">
                {citationLabel(c)}
              </a>
            ) : (
              <span key={c} className="citation">{c}</span>
            )
          ))}
        </div>
      </section>

      <div className="action-row">
        <button className="button-primary" onClick={onSave}>
          {isSaved ? 'Saved' : 'Save record'}
        </button>
        <button className="button-secondary" onClick={onOpenReading}>Open reading</button>
      </div>
    </section>
  );
}
