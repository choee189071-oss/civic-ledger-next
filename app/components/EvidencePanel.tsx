type Props = {
  detail: any;
  sources: any[];
};

function sourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function EvidencePanel({ detail, sources }: Props) {
  const relatedSources = detail
    ? sources.filter((source) => source.name === detail.source || source.topic === detail.topic)
    : sources.slice(0, 3);
  const liveResults = detail?.searchResults ?? [];

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
                  {/https?:\/\//.test(citation) ? (
                    <a href={citation} target="_blank" rel="noreferrer">
                      {sourceLabel(citation)}
                    </a>
                  ) : (
                    <strong>{citation}</strong>
                  )}
                  <p className="muted small">{detail.source}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {liveResults.length > 0 && (
        <section className="evidence-block">
          <h3>Live search results</h3>
          <div className="stack">
            {liveResults.slice(0, 6).map((result: any) => (
              <article key={result.url || result.title} className="source-card">
                <div className="record-meta">
                  <span>{result.source || 'Web'}</span>
                  {(result.date || result.last_updated) && (
                    <span>{result.date || result.last_updated}</span>
                  )}
                </div>
                {result.url ? (
                  <a href={result.url} target="_blank" rel="noreferrer">
                    <h3>{result.title || sourceLabel(result.url)}</h3>
                  </a>
                ) : (
                  <h3>{result.title || 'Untitled result'}</h3>
                )}
                {result.snippet && <p className="muted small">{result.snippet}</p>}
              </article>
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
