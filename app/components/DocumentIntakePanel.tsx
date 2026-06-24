"use client";

import { useState } from 'react';

type EvidenceFinding = {
  section: string;
  status: 'Found' | 'Missing';
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string;
  manualCheck: string;
};

type ParseResult = {
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
    findings: EvidenceFinding[];
    missingFields: string[];
    workflowSections: string[];
    suggestedNextSteps: string[];
  };
  llamaExtract?: unknown;
};

type Props = {
  onOpenReading: (item: { id: string; title: string; body: string[] }) => void;
};

const documentTypes = [
  { value: 'ACFR / audited financial statements', label: 'ACFR / Audit' },
  { value: 'Official Statement / POS', label: 'Official Statement / POS' },
  { value: 'EMMA annual report / continuing disclosure', label: 'EMMA Annual Report' },
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

function markdownBundle(result: ParseResult) {
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

export function DocumentIntakePanel({ onOpenReading }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [documentType, setDocumentType] = useState(documentTypes[0].value);
  const [tier, setTier] = useState('agentic');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [activeTab, setActiveTab] = useState('evidence');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runParse() {
    setError(null);
    setResult(null);

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

      setResult(payload.extraction);
      setActiveTab('evidence');
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Document parse failed.');
    } finally {
      setIsParsing(false);
    }
  }

  function openReading() {
    if (!result) return;
    onOpenReading({
      id: `parsed-${Date.now()}`,
      title: result.title,
      body: [markdownBundle(result)],
    });
  }

  const foundCount = result?.evidencePackage.findings.filter((finding) => finding.status === 'Found').length ?? 0;
  const missingCount = result?.evidencePackage.missingFields.length ?? 0;

  return (
    <section className="full-page-panel document-intake-page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PDF Intelligence</p>
          <h2>Document intake</h2>
          <p className="muted small">Parse ACFRs, official statements, and EMMA annual reports into structured public-finance evidence.</p>
        </div>
        <span className="count">{result ? `${foundCount}/${result.evidencePackage.findings.length}` : '3 core docs'}</span>
      </div>

      <div className="document-intake-grid">
        <section className="workflow-config-panel">
          <div className="section-heading">
            <div>
              <h3>Upload or link PDF</h3>
              <p className="muted small">For large ACFRs, a public PDF URL is usually more reliable than browser upload.</p>
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

          <label>
            LlamaParse tier
            <select value={tier} onChange={(event) => setTier(event.target.value)}>
              {tierOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <button className="button-primary" onClick={runParse} disabled={isParsing}>
            {isParsing ? 'Parsing PDF...' : 'Parse PDF'}
          </button>

          {error && <div className="inline-error">{error}</div>}

          <div className="source-list-section compact-note">
            <h3>What this extracts</h3>
            <p className="muted small">ACFR: MD&A, liquidity, debt, pensions/OPEB. OS/POS: pledge, debt service, covenants, ABT. EMMA annual report: filing period, debt updates, covenant evidence, event notices.</p>
          </div>
        </section>

        <section className="workflow-run-panel">
          {!result ? (
            <div className="empty-document-state">
              <p className="eyebrow">Ready</p>
              <h3>Turn core PDF evidence into workflow-ready material.</h3>
              <p className="muted">The result will appear here as an evidence package, parsed markdown, and exportable JSON.</p>
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
                  <button className="button-secondary" onClick={() => downloadText(JSON.stringify(result, null, 2), `${slug(result.title)}_evidence.json`, 'application/json;charset=utf-8')}>Download JSON</button>
                  <button className="button-primary" onClick={openReading}>Open in Reading</button>
                </div>
              </div>

              <div className="document-score-strip">
                <span className="status-pill ready">{foundCount} found</span>
                <span className={missingCount > 0 ? 'status-pill warning' : 'status-pill ready'}>{missingCount} missing</span>
                <span className="status-pill">{result.evidencePackage.documentKind}</span>
              </div>

              <div className="report-tabs">
                {['evidence', 'markdown', 'json'].map((tab) => (
                  <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
                    {tab === 'evidence' ? 'Evidence Package' : tab === 'markdown' ? 'Parsed Markdown' : 'Raw JSON'}
                  </button>
                ))}
              </div>

              {activeTab === 'evidence' && (
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

              {activeTab === 'markdown' && (
                <pre className="document-output-pre">{result.markdown || 'No markdown returned.'}</pre>
              )}

              {activeTab === 'json' && (
                <pre className="document-output-pre">{JSON.stringify(result, null, 2)}</pre>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
