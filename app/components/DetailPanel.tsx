"use client";

import { useState } from 'react';
import { FormattedReport } from './FormattedReport';

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
};

const reportTemplates = [
  ['research-brief', 'Research Brief'],
  ['credit-memo', 'Credit Memo'],
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
  reportTemplate: string
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
    `| Tier 1 / primary sources | ${tier1Count} candidate records |`,
    `| Fresh 3-month evidence | ${freshCount} candidate records |`,
    `| 6-month fallback evidence | ${fallbackCount} candidate records |`,
    `| Manual verification / gaps | ${manualCount + missingCoverage} items |`,
    `| Generated at | ${mdCell(generatedReport?.generatedAt || detail.generatedAt || new Date().toISOString())} |`,
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

  return [
    `# ${title}`,
    '',
    `Generated: ${generatedReport?.generatedAt || detail.generatedAt || new Date().toISOString()}`,
    '',
    exportDashboardMarkdown(detail, generatedReport, evidencePackage, sourceStatuses, runStatus, reportTemplate),
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
        <p className="muted">Select a research result to prepare a deliverable.</p>
      </section>
    );
  }

  const input = workflowInput(detail, reportTemplate);
  const evidencePackage = evidencePackageFor(detail);
  const evidenceQuality = evidenceQualitySummary(detail, evidencePackage, sourceStatuses);
  const evidenceSources = allSourceCandidates(detail, evidencePackage).slice(0, 12);
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
  const primarySourceCount = Object.entries(evidenceQuality.tierCounts)
    .filter(([key]) => /tier\s*[12]|high/i.test(key))
    .reduce((total, [, value]) => total + value, 0);
  const freshEvidenceCount = Object.entries(evidenceQuality.recencyCounts)
    .filter(([key]) => /3.?month|preferred|fresh/i.test(key))
    .reduce((total, [, value]) => total + value, 0);
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
      JSON.stringify(evidencePackage, null, 2),
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

      {activeTab === 'discovery' && (
        <>
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
                <span>Total evidence</span>
                <strong>{evidenceQuality.totalSources}</strong>
                <p>Sources in this research package.</p>
              </div>
              <div>
                <span>Tier 1 / 2</span>
                <strong>{primarySourceCount}</strong>
                <p>Primary or official-source candidates.</p>
              </div>
              <div>
                <span>Fresh window</span>
                <strong>{freshEvidenceCount}</strong>
                <p>Preferred 3-month evidence signals.</p>
              </div>
              <div>
                <span>Needs review</span>
                <strong>{needsReviewCount}</strong>
                <p>Candidate, missing, or manual items.</p>
              </div>
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

          <section className="answer-section">
            <h3>Discovery memo</h3>
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
                <FormattedReport content={generatedReport.content} />
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
