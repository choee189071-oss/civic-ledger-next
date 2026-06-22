type Props = {
  detail: any;
  sources: any[];
};

export function EvidencePanel({ detail, sources }: Props) {
  const relatedSources = detail
    ? sources.filter((source) => source.name === detail.source || source.topic === detail.topic)
    : sources.slice(0, 3);

  return (
    <aside className="workspace-panel evidence-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Evidence</p>
          <h2>Sources</h2>
        </div>
        <span className="count">{relatedSources.length}</span>
      </div>

      {detail && (
        <section className="evidence-block">
          <h3>Current citations</h3>
          <div className="stack">
            {detail.citations?.map((citation: string) => (
              <div key={citation} className="source-row">
                <span className="source-icon">↗</span>
                <div>
                  <strong>{citation}</strong>
                  <p className="muted small">{detail.source}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="evidence-block">
        <h3>Source registry</h3>
        <div className="stack">
          {relatedSources.map((source) => (
            <article key={source.id} className="source-card">
              <div className="record-meta">
                <span>{source.topic}</span>
                <span>{source.trust}</span>
              </div>
              <h3>{source.name}</h3>
              <p className="muted small">{source.description}</p>
              <span className="freshness">{source.freshness}</span>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
