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

      <div className="record-meta">
        <span>{detail.topic}</span>
        <span>{detail.source}</span>
        <span>Score {detail.score}</span>
      </div>

      <section className="answer-section">
        <h3>Working conclusion</h3>
        <p className="muted">{detail.snippet}</p>
      </section>

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
