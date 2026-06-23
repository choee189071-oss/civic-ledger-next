type Props = {
  detail: any;
  sources: any[];
  onOpenSources: () => void;
};

function sourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function EvidencePanel({ detail, sources, onOpenSources }: Props) {
  const relatedSources = detail
    ? sources.filter((source) => source.name === detail.source || source.topic === detail.topic)
    : sources.slice(0, 3);
  const liveResults = detail?.searchResults ?? [];
  const evidenceCount = liveResults.length > 0 ? liveResults.length : relatedSources.length;

  return (
    <aside className="workspace-panel evidence-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Evidence</p>
          <h2>Evidence preview</h2>
        </div>
        <span className="count">{evidenceCount}</span>
      </div>

      <button className="button-secondary" onClick={onOpenSources}>
        Open Source List
      </button>

      {detail && (
        <section className="evidence-block">
          <h3>Current citations</h3>
          <div className="stack">
            {detail.citations?.slice(0, 4).map((citation: string) => (
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
            {liveResults.slice(0, 4).map((result: any) => (
              <article key={result.url || result.title} className="source-card">
                <div className="record-meta">
                  {result.sourceTier && <span>{result.sourceTier}</span>}
                  <span>{result.documentType || result.source || 'Web'}</span>
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
                {result.notes && <span className="freshness">{result.notes}</span>}
              </article>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
