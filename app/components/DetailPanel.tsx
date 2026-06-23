"use client";

import { useState } from 'react';
import { htmlDocumentFromMarkdown } from './exportDocument';
import { FormattedReport } from './FormattedReport';

type Props = {
  detail: any;
  reportTemplate: string;
  generatedReport: any | null;
  reportVersions: any[];
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
  ['document-inventory-report', 'Document Inventory Report'],
  ['executive-summary', 'Executive Summary'],
  ['risk-monitor', 'Risk Monitor'],
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

function markdownFor(detail: any, generatedReport: any | null) {
  const title = generatedReport?.title || detail.title || 'Research Report';
  const report = generatedReport?.content || detail.snippet || '';
  const citations = (detail.citations ?? []).map((citation: string) => `- ${citation}`).join('\n');

  return [
    `# ${title}`,
    '',
    `Generated: ${generatedReport?.generatedAt || detail.generatedAt || new Date().toISOString()}`,
    '',
    report,
    '',
    '## Source Appendix',
    citations || '- No citations available.',
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

export function DetailPanel({
  detail,
  reportTemplate,
  generatedReport,
  reportVersions,
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
  const filenameBase = [
    slug(detail.title || 'issuer'),
    slug(detail.researchModeLabel || detail.topic || 'research'),
    slug(generatedReport?.templateLabel || input.output_type || reportTemplate),
    new Date().toISOString().slice(0, 10),
  ].join('_');

  function downloadMarkdown() {
    downloadBlob(markdownFor(detail, generatedReport), `${filenameBase}.md`, 'text/markdown;charset=utf-8');
  }

  function downloadEvidenceJson() {
    downloadBlob(
      JSON.stringify(evidencePackage, null, 2),
      `${slug(detail.title || 'issuer')}_${slug(detail.researchModeLabel || 'research')}_evidence_package_${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8'
    );
  }

  function downloadWord() {
    const html = htmlDocumentFromMarkdown(
      markdownFor(detail, generatedReport),
      generatedReport?.title || detail.title || 'Research Report'
    );
    downloadBlob(html, `${filenameBase}.doc`, 'application/msword;charset=utf-8');
  }

  async function downloadPdf() {
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: generatedReport?.title || detail.title,
        content: markdownFor(detail, generatedReport),
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
    await navigator.clipboard.writeText(markdownFor(detail, generatedReport));
    setCopyStatus('Copied');
    window.setTimeout(() => setCopyStatus(''), 1600);
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

      <div className="answer-summary">
        <p>{detail.summary}</p>
      </div>

      {detail.financeFocused && detail.coreFinanceDocumentsFound === false && (
        <div className="warning-banner">
          Core finance documents were not found in this search run. The memo is a preliminary issuer overview, not a credit conclusion.
        </div>
      )}

      <div className="record-meta">
        <span>{detail.researchModeLabel ?? detail.topic}</span>
        <span>{generatedReport?.templateLabel || input.output_type || reportTemplate}</span>
        <span>{detail.source}</span>
      </div>

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
                {detail.coverageDashboard.map((row: any) => (
                  <div key={row.area} className="mini-table-row">
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
                {detail.documentInventory.map((row: any) => (
                  <article key={`${row.document}-${row.url ?? row.source}`} className="document-row">
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
                {evidencePackage.raw_evidence_notes.slice(0, 8).map((item: any) => (
                  <div key={`${item.source_title}-${item.claim}`} className="fact-line">
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
                {evidencePackage.missing_items.map((item: string) => (
                  <div key={item} className="fact-line">{item}</div>
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
                    <div key={section.title} className="section-row">
                      <span>{section.title}</span>
                      <button
                        className="button-secondary"
                        onClick={() => onRegenerateSection(section.title, section.content)}
                        disabled={isGeneratingReport}
                      >
                        Regenerate
                      </button>
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
            <button className="button-secondary" onClick={downloadWord}>Download Word</button>
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
