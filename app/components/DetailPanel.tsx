type Props = {
  detail: any;
  onOpenReading: () => void;
  onSave: () => void;
  isSaved: boolean;
};

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

export function DetailPanel({ detail, onOpenReading, onSave, isSaved }: Props) {
  if (!detail) {
    return (
      <section className="workspace-panel answer-panel empty-state">
        <p className="eyebrow">Answer</p>
        <h2>AI answer draft</h2>
        <p className="muted">Select a research result to prepare a record.</p>
      </section>
    );
  }

  return (
    <section className="workspace-panel answer-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Answer</p>
          <h2>{detail.title}</h2>
        </div>
        <span className="status-pill ready">Ready to review</span>
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
        <span>{detail.topic}</span>
        {detail.researchModeLabel && detail.researchModeLabel !== detail.topic && (
          <span>{detail.researchModeLabel}</span>
        )}
        <span>{detail.source}</span>
        <span>Score {detail.score}</span>
      </div>

      <section className="answer-section">
        <h3>Working conclusion</h3>
        <p className="muted answer-body">{detail.snippet}</p>
      </section>

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
                  <p className="muted small">{row.type} · {row.source} · {row.date}</p>
                </div>
                <span className="tier-pill">{row.sourceTier}</span>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="answer-section">
        <h3>Evidence notes</h3>
        <div className="stack">
          {detail.facts?.map((f: string) => (
            <div key={f} className="fact-line">{f}</div>
          ))}
        </div>
      </section>

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
