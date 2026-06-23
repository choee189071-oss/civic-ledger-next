type Props = {
  items: any[];
  detail: any;
  savedRecords: any[];
  sourceStatuses: Record<string, string>;
  onSourceStatusChange: (key: string, status: string) => void;
};

const sourceStatusOptions = ['Used in Report', 'Candidate', 'Missing', 'Rejected'];

function sourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function uniqueByUrl(items: any[]) {
  const seen = new Set<string>();
  const next: any[] = [];

  for (const item of items) {
    const key = (item.url || item.source_url || item.title || item.document || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }

  return next;
}

function sourceKey(item: any) {
  return (item.url || item.source_url || item.title || item.document || '').toLowerCase();
}

function currentRunSources(detail: any) {
  if (!detail) return [];

  const inventory = (detail.evidencePackage?.document_inventory ?? detail.documentInventory ?? []).map((item: any) => ({
    title: item.title ?? item.document,
    url: item.source_url ?? item.url,
    sourceTier: item.source_tier ?? item.sourceTier,
    documentType: item.document_type ?? item.type,
    date: item.date,
    recencyWindow: item.recency_window ?? item.recencyWindow,
    notes: item.notes,
    status: item.status,
  }));

  const live = (detail.searchResults ?? []).map((item: any) => ({
    title: item.title || (item.url ? sourceLabel(item.url) : 'Untitled source'),
    url: item.url,
    sourceTier: item.sourceTier,
    documentType: item.documentType,
    date: item.date || item.last_updated,
    recencyWindow: item.recencyWindow,
    notes: item.snippet || item.notes,
    status: 'Candidate',
  }));

  const citations = (detail.citations ?? []).map((citation: string) => ({
    title: sourceLabel(citation),
    url: /^https?:\/\//.test(citation) ? citation : undefined,
    sourceTier: 'Citation',
    documentType: 'Referenced source',
    date: '',
    notes: detail.source,
    status: 'Referenced',
  }));

  const missing = (detail.evidencePackage?.missing_items ?? []).map((item: string) => ({
    title: item,
    url: undefined,
    sourceTier: 'Gap',
    documentType: 'Missing information',
    date: '',
    notes: 'Required before finalizing the research package.',
    status: 'Missing',
  }));

  return uniqueByUrl([...inventory, ...live, ...citations, ...missing]);
}

export function SourcesPanel({ items, detail, savedRecords, sourceStatuses, onSourceStatusChange }: Props) {
  const runSources = currentRunSources(detail);

  return (
    <section className="full-page-panel source-list-page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Sources</p>
          <h2>Source list</h2>
          <p className="muted small">A source-centered view of the current research run and reusable public finance feeds.</p>
        </div>
        <span className="count">{runSources.length + items.length}</span>
      </div>

      {detail && (
        <section className="source-list-section">
          <div className="section-heading">
            <div>
              <h3>Current run sources</h3>
              <p className="muted small">{detail.title} · {detail.researchModeLabel ?? detail.topic}</p>
            </div>
            <span className="status-pill ready">{runSources.length} sources</span>
          </div>

          {runSources.length === 0 ? (
            <p className="muted">Run live research to populate the source list.</p>
          ) : (
            <div className="source-list">
              {runSources.map((source) => (
                <article key={`${source.title}-${source.url}`} className="source-list-row">
                  <div>
                    <div className="record-meta">
                      <span>{source.sourceTier || 'Source'}</span>
                      <span>{source.documentType || 'Document'}</span>
                      <span>{source.recencyWindow || 'Undated source'}</span>
                      {source.date && <span>{source.date}</span>}
                    </div>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        <h3>{source.title || sourceLabel(source.url)}</h3>
                      </a>
                    ) : (
                      <h3>{source.title}</h3>
                    )}
                    {source.notes && <p className="muted small">{source.notes}</p>}
                  </div>
                  <div className="source-actions">
                    <select
                      value={sourceStatuses[sourceKey(source)] ?? (source.status === 'Missing' ? 'Missing' : source.status === 'Referenced' ? 'Used in Report' : 'Candidate')}
                      onChange={(event) => onSourceStatusChange(sourceKey(source), event.target.value)}
                    >
                      {sourceStatusOptions.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    {source.url && (
                      <a className="button-secondary source-open-button" href={source.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="source-list-section">
        <div className="section-heading">
          <div>
            <h3>Base source list</h3>
            <p className="muted small">Reusable official feeds and starting points for public finance research.</p>
          </div>
          <span className="status-pill">{items.length} base sources</span>
        </div>

        <div className="source-grid">
          {items.map((item) => (
            <article key={item.id} className="source-card">
              <div className="meta">
                <span>{item.topic}</span>
                <span>{item.trust}</span>
                <span>{item.freshness}</span>
              </div>
              <h3>{item.name}</h3>
              <p className="muted">{item.description}</p>
              <div className="stack">
                {item.keyFacts?.map((fact: string) => (
                  <div key={fact} className="fact-line">{fact}</div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="source-list-section">
        <div className="section-heading">
          <div>
            <h3>Saved research source trails</h3>
            <p className="muted small">Saved runs preserve their evidence package and generated report.</p>
          </div>
          <span className="status-pill">{savedRecords.length} saved</span>
        </div>
        <div className="saved-list">
          {savedRecords.length === 0 && <p className="muted small">No saved runs yet.</p>}
          {savedRecords.map((record) => (
            <div key={record.id} className="saved-item">
              <span className="saved-dot" />
              <div>
                <strong>{record.title}</strong>
                <p className="muted small">{record.researchModeLabel ?? record.topic} · {record.citations?.length ?? 0} citations</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
