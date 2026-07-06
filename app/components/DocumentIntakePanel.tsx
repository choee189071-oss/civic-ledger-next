"use client";

import { useState } from 'react';
import {
  buildDocumentWorkflow,
  type DocumentParseResult,
  type DocumentWorkflowPackage,
} from '../../lib/public-finance-document-pipeline';

type Props = {
  experienceMode?: 'reader' | 'supervisor';
  onOpenReading: (item: { id: string; title: string; body: string[] }) => void;
  onWorkflowReady: (workflow: DocumentWorkflowPackage) => void;
  onOpenWorkflow: (workflow: DocumentWorkflowPackage) => void;
};

const documentTypes = [
  { value: 'ACFR / audited financial statements', label: 'ACFR / Audit' },
  { value: 'Official Statement / POS', label: 'Official Statement / POS' },
  { value: 'EMMA annual report / continuing disclosure', label: 'EMMA Annual Report' },
  { value: 'Budget / CIP', label: 'Budget / CIP' },
  { value: 'Board agenda / packet / minutes', label: 'Board Packet / Agenda' },
  { value: 'Rate study / rate ordinance', label: 'Rate Study / Ordinance' },
  { value: 'Rating report / rating action', label: 'Rating Report / Action' },
  { value: 'Single Audit / SEFA', label: 'Single Audit / SEFA' },
  { value: 'Other public finance source', label: 'Other Source' },
];

const importantFileSlots = [
  {
    type: 'ACFR / audited financial statements',
    label: 'ACFR / Audit',
    why: 'Revenue, expenses, liquidity, debt notes, pensions, OPEB, and audited trend evidence.',
    target: 'Financial performance',
  },
  {
    type: 'Official Statement / POS',
    label: 'OS / POS',
    why: 'Security pledge, debt service, rate covenant, additional bonds test, risks, and CUSIP detail.',
    target: 'Debt profile',
  },
  {
    type: 'EMMA annual report / continuing disclosure',
    label: 'Continuing Disclosure',
    why: 'Updated annual filing, covenant compliance, event notices, and current disclosure trail.',
    target: 'Monitoring',
  },
  {
    type: 'Budget / CIP',
    label: 'Budget / CIP',
    why: 'Forward-looking revenue assumptions, expense pressure, capital plan, and funding sources.',
    target: 'Outlook',
  },
  {
    type: 'Board agenda / packet / minutes',
    label: 'Board Packet',
    why: 'Bond authorization, resolutions, RFP approvals, MA or bond counsel hiring, and early deal signals.',
    target: 'Recent developments',
  },
  {
    type: 'Rate study / rate ordinance',
    label: 'Rate Study',
    why: 'Rate path, affordability, coverage targets, political approval, and covenant support.',
    target: 'Revenue sufficiency',
  },
];

const tierOptions = [
  { value: 'agentic', label: 'Agentic' },
  { value: 'agentic_plus', label: 'Agentic Plus' },
  { value: 'cost_effective', label: 'Cost Effective' },
];

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document';
}

function downloadText(content: string, filename: string, type: string) {
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

function markdownBundle(result: DocumentParseResult) {
  return [
    `# ${result.title}`,
    '',
    `Issuer: ${result.issuer || 'Not specified'}`,
    `Document type: ${result.documentType}`,
    `Parser: ${result.parser.provider} (${result.parser.tier})`,
    `Parsed: ${result.parsedAt}`,
    result.sourceUrl ? `Source URL: ${result.sourceUrl}` : `Filename: ${result.filename}`,
    '',
    '## Evidence Package',
    '',
    ...result.evidencePackage.findings.flatMap((finding) => [
      `### ${finding.section}`,
      `Status: ${finding.status}`,
      `Confidence: ${finding.confidence}`,
      `Manual check: ${finding.manualCheck}`,
      '',
      finding.evidence,
      '',
    ]),
    '## Parsed Markdown',
    '',
    result.markdown,
  ].join('\n');
}

export function DocumentIntakePanel({ experienceMode = 'reader', onOpenReading, onWorkflowReady, onOpenWorkflow }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [documentType, setDocumentType] = useState(documentTypes[0].value);
  const [tier, setTier] = useState('agentic');
  const [result, setResult] = useState<DocumentParseResult | null>(null);
  const [workflowPackage, setWorkflowPackage] = useState<DocumentWorkflowPackage | null>(null);
  const [activeTab, setActiveTab] = useState('evidence');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runParse() {
    setError(null);
    setResult(null);
    setWorkflowPackage(null);

    if (!file && !url.trim()) {
      setError('Upload a PDF or paste a public PDF URL.');
      return;
    }

    setIsParsing(true);
    const formData = new FormData();
    if (file) formData.append('file', file);
    if (url.trim()) formData.append('url', url.trim());
    formData.append('title', title.trim() || file?.name || url.trim() || 'Public finance document');
    formData.append('issuer', issuer.trim());
    formData.append('documentType', documentType);
    formData.append('tier', tier);

    try {
      const res = await fetch('/api/documents/parse', {
        method: 'POST',
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload.error || 'Document parse failed.');
        return;
      }

      const extraction = payload.extraction as DocumentParseResult;
      const workflow = buildDocumentWorkflow(extraction);

      setResult(extraction);
      setWorkflowPackage(workflow);
      onWorkflowReady(workflow);
      setActiveTab('evidence');
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Document parse failed.');
    } finally {
      setIsParsing(false);
    }
  }

  function openReading() {
    if (!workflowPackage) return;
    onOpenReading(workflowPackage.reading);
  }

  function openParsedMarkdown() {
    if (!result) return;
    onOpenReading({
      id: `parsed-${Date.now()}`,
      title: `Parsed Markdown: ${result.title}`,
      body: [markdownBundle(result)],
    });
  }

  function openWorkflow() {
    if (!workflowPackage) return;
    onOpenWorkflow(workflowPackage);
  }

  function selectImportantFile(type: string, label: string) {
    setDocumentType(type);
    if (!title.trim()) {
      setTitle(`${issuer.trim() ? `${issuer.trim()} ` : ''}${label}`);
    }
  }

  const selectedImportantFile = importantFileSlots.find((slot) => slot.type === documentType);
  const foundCount = result?.evidencePackage.findings.filter((finding) => finding.status === 'Found').length ?? 0;
  const missingCount = result?.evidencePackage.missingFields.length ?? 0;
  const isReaderMode = experienceMode !== 'supervisor';
  const resultTabs = isReaderMode ? ['evidence', 'markdown'] : ['evidence', 'markdown', 'json'];
  const visibleActiveTab = isReaderMode && activeTab === 'json' ? 'evidence' : activeTab;

  return (
    <section className={`full-page-panel document-intake-page ${isReaderMode ? 'reader-document-intake' : ''}`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Source Management</p>
          <h2>{isReaderMode ? 'Add source file' : 'Important files'}</h2>
          {!isReaderMode && <p className="muted small">Upload or link the files that matter most, then convert them into structured public-finance evidence.</p>}
        </div>
        {!isReaderMode && <span className="count">{result ? `${foundCount}/${result.evidencePackage.findings.length}` : '6 priority files'}</span>}
      </div>

      {!isReaderMode && <div className="important-file-slots" aria-label="Priority public finance file types">
        {importantFileSlots.map((slot) => (
          <button
            key={slot.type}
            type="button"
            className={documentType === slot.type ? 'active' : ''}
            onClick={() => selectImportantFile(slot.type, slot.label)}
          >
            <span>{slot.target}</span>
            <strong>{slot.label}</strong>
            <em>{slot.why}</em>
          </button>
        ))}
      </div>}

      <div className="document-intake-grid">
        <section className="workflow-config-panel">
          <div className="section-heading">
            <div>
              <h3>{isReaderMode ? 'Upload or paste a PDF link' : 'Add selected file'}</h3>
              {!isReaderMode && <p className="muted small">
                {selectedImportantFile
                  ? `${selectedImportantFile.label}: ${selectedImportantFile.why}`
                  : 'For large ACFRs and official statements, a public PDF URL is usually more reliable than browser upload.'}
              </p>}
            </div>
          </div>

          <label>
            PDF file
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <label>
            Public PDF URL
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://emma.msrb.org/..."
            />
          </label>

          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="LADWP FY2025 ACFR"
            />
          </label>

          <label>
            Issuer
            <input
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
              placeholder="LADWP"
            />
          </label>

          <label>
            Document type
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              {documentTypes.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {!isReaderMode && <label>
            LlamaParse tier
            <select value={tier} onChange={(event) => setTier(event.target.value)}>
              {tierOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>}

          <button className="button-primary" onClick={runParse} disabled={isParsing}>
            {isParsing ? 'Parsing PDF...' : 'Parse PDF'}
          </button>

          {error && <div className="inline-error">{error}</div>}

          {!isReaderMode && <div className="source-list-section compact-note">
            <h3>What this extracts</h3>
            <p className="muted small">ACFR: MD&A, liquidity, debt, pensions/OPEB. OS/POS: pledge, debt service, covenants, ABT. EMMA annual report: filing period and covenant updates. Budget/CIP, board packets, and rate studies: forward-looking risks, authorizations, RFPs, and rate-path evidence.</p>
          </div>}
        </section>

        <section className="workflow-run-panel">
          {!result ? (
            <div className="empty-document-state">
              <p className="eyebrow">Ready</p>
              <h3>{isReaderMode ? 'Parse a PDF into a readable source summary.' : 'Turn core PDF evidence into workflow-ready material.'}</h3>
              {!isReaderMode && <p className="muted">The result will appear here as an evidence package, source list entry, credit memo draft, and reading-room document.</p>}
            </div>
          ) : (
            <>
              <div className="issuer-detail-head">
                <div>
                  <p className="eyebrow">{result.documentType}</p>
                  <h2>{result.title}</h2>
                  <p className="muted">Parsed by {result.parser.provider} · {result.parser.tier} · {result.parser.pageCount ?? 'unknown'} pages</p>
                </div>
                <div className="report-toolbar">
                  <button className="button-secondary" onClick={() => downloadText(markdownBundle(result), `${slug(result.title)}_evidence.md`, 'text/markdown;charset=utf-8')}>Download MD</button>
                  {!isReaderMode && <button className="button-secondary" onClick={() => downloadText(JSON.stringify(result, null, 2), `${slug(result.title)}_evidence.json`, 'application/json;charset=utf-8')}>Download JSON</button>}
                  <button className="button-secondary" onClick={openParsedMarkdown}>Open Parsed Markdown</button>
                  <button className="button-primary" onClick={openReading}>Open Report in Reading</button>
                </div>
              </div>

              {!isReaderMode && workflowPackage && (
                <section className="document-pipeline-card">
                  <div>
                    <p className="eyebrow">Document-to-Report Pipeline</p>
                    <h3>{'Evidence package -> Source list -> Credit memo -> Reading room'}</h3>
                    <p className="muted small">
                      This PDF has been converted into a current research run with a draft credit memo, structured source appendix, coverage dashboard, and missing-information queue.
                    </p>
                  </div>
                  <div className="pipeline-steps">
                    {[
                      'Evidence package',
                      'Source list',
                      'Credit memo sections',
                      'Reading room',
                    ].map((step) => (
                      <span key={step}>{step}</span>
                    ))}
                  </div>
                  <div className="report-toolbar">
                    <button className="button-primary" onClick={openWorkflow}>
                      Open Workflow
                    </button>
                  </div>
                </section>
              )}

              {!isReaderMode && <div className="document-score-strip">
                <span className="status-pill ready">{foundCount} found</span>
                <span className={missingCount > 0 ? 'status-pill warning' : 'status-pill ready'}>{missingCount} missing</span>
                <span className="status-pill">{result.evidencePackage.documentKind}</span>
              </div>}

              <div className="report-tabs">
                {resultTabs.map((tab) => (
                  <button key={tab} className={visibleActiveTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
                    {tab === 'evidence' ? 'Evidence Package' : tab === 'markdown' ? 'Parsed Markdown' : 'Raw JSON'}
                  </button>
                ))}
              </div>

              {visibleActiveTab === 'evidence' && (
                <div className="source-list document-evidence-list">
                  {result.evidencePackage.findings.map((finding) => (
                    <article key={finding.section} className="source-list-row">
                      <div>
                        <div className="record-meta">
                          <span>{finding.status}</span>
                          <span>{finding.confidence} confidence</span>
                        </div>
                        <h3>{finding.section}</h3>
                        <p className="muted small">{finding.manualCheck}</p>
                        <p>{finding.evidence}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {visibleActiveTab === 'markdown' && (
                <pre className="document-output-pre">{result.markdown || 'No markdown returned.'}</pre>
              )}

              {visibleActiveTab === 'json' && (
                <pre className="document-output-pre">{JSON.stringify(result, null, 2)}</pre>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
