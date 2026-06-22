type Result = {
  id: string;
  title: string;
  topic: string;
  source: string;
  score: number;
  summary: string;
  facts: string[];
  citations: string[];
};

type Props = {
  query: string;
  topic: string;
  source: string;
  sort: string;
  items: Result[];
  selectedId: string | null;
  tab: string;
  onQuery: (v: string) => void;
  onTopic: (v: string) => void;
  onSource: (v: string) => void;
  onSort: (v: string) => void;
  onSearch: () => void;
  onSelect: (id: string) => void;
  onTab: (v: string) => void;
};

export function SearchPanel(props: Props) {
  const top = props.items[0];
  const citations = [
    ...new Set(
      props.items.flatMap((item) =>
        item.citations.map((c) => `${c} · ${item.source}`)
      )
    )
  ];

  return (
    <div className="card">
      <h3>Search</h3>
      <div className="searchbox" style={{ margin: '16px 0' }}>
        <input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && props.onSearch()}
          placeholder="Ask about California public finance…"
        />
        <button className="button-primary" onClick={props.onSearch}>Search</button>
      </div>
      <div className="filters">
        <select value={props.topic} onChange={(e) => props.onTopic(e.target.value)}>
          <option value="all">All topics</option>
          <option value="Budget">Budget</option>
          <option value="Expenditures">Expenditures</option>
          <option value="Disclosure">Disclosure</option>
          <option value="Bonds">Bonds</option>
        </select>
        <select value={props.source} onChange={(e) => props.onSource(e.target.value)}>
          <option value="all">All sources</option>
          <option value="Open FI$Cal">Open FI$Cal</option>
          <option value="California Budget">California Budget</option>
          <option value="CDIAC">CDIAC</option>
          <option value="Debt Line">Debt Line</option>
        </select>
        <select value={props.sort} onChange={(e) => props.onSort(e.target.value)}>
          <option value="score">Sort by relevance</option>
          <option value="freshness">Sort by freshness</option>
          <option value="title">Sort by title</option>
        </select>
      </div>
      <div className="toolbar" style={{ margin: '16px 0' }}>
        {['results', 'summary', 'citations'].map((t) => (
          <button
            key={t}
            className={`tab ${props.tab === t ? 'active' : ''}`}
            onClick={() => props.onTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {props.tab === 'results' && (
        <div className="result-list">
          {props.items.length === 0 && (
            <p className="muted">No results match the current query.</p>
          )}
          {props.items.map((item) => (
            <article
              key={item.id}
              className={`result ${props.selectedId === item.id ? 'active' : ''}`}
              onClick={() => props.onSelect(item.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div className="meta">
                    <span>{item.topic}</span>
                    <span>{item.source}</span>
                  </div>
                  <h4 style={{ margin: '8px 0' }}>{item.title}</h4>
                </div>
                <span className="badge">{item.score}</span>
              </div>
              <p className="muted">{item.summary}</p>
            </article>
          ))}
        </div>
      )}

      {props.tab === 'summary' && top && (
        <div className="stack">
          <p className="muted"><strong>Top match:</strong> {top.title} · {top.source}</p>
          {top.facts.map((f) => <div key={f} className="muted">{f}</div>)}
        </div>
      )}

      {props.tab === 'citations' && (
        <div className="stack">
          {citations.map((c) => (
            <div key={c}><span className="citation">{c}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
