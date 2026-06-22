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
  const citations = [
    ...new Set(
      props.items.flatMap((item) =>
        item.citations.map((c) => `${c} · ${item.source}`)
      )
    )
  ];

  return (
    <section className="workspace-panel query-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Ask</p>
          <h2>Research intake</h2>
        </div>
        <span className="count">{props.items.length}</span>
      </div>

      <div className="searchbox">
        <input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && props.onSearch()}
          placeholder="Issuer, bond, budget, filing, source..."
        />
        <button className="icon-button primary" onClick={props.onSearch} aria-label="Run research search">⌕</button>
      </div>

      <div className="filters">
        <label>
          Topic
          <select value={props.topic} onChange={(e) => props.onTopic(e.target.value)}>
          <option value="all">All topics</option>
          <option value="Budget">Budget</option>
          <option value="Expenditures">Expenditures</option>
          <option value="Disclosure">Disclosure</option>
          <option value="Bonds">Bonds</option>
          </select>
        </label>
        <label>
          Source
          <select value={props.source} onChange={(e) => props.onSource(e.target.value)}>
          <option value="all">All sources</option>
          <option value="Open FI$Cal">Open FI$Cal</option>
          <option value="California Budget">California Budget</option>
          <option value="CDIAC">CDIAC</option>
          <option value="Debt Line">Debt Line</option>
          </select>
        </label>
        <label>
          Sort
          <select value={props.sort} onChange={(e) => props.onSort(e.target.value)}>
          <option value="score">Sort by relevance</option>
          <option value="freshness">Sort by freshness</option>
          <option value="title">Sort by title</option>
          </select>
        </label>
      </div>

      <div className="segmented-control">
        {[
          ['results', 'Results'],
          ['summary', 'Brief'],
          ['citations', 'Citations']
        ].map(([id, label]) => (
          <button
            key={id}
            className={props.tab === id ? 'active' : ''}
            onClick={() => props.onTab(id)}
          >
            {label}
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
              <div className="result-topline">
                <div>
                  <div className="meta">
                    <span>{item.topic}</span>
                    <span>{item.source}</span>
                  </div>
                  <h3>{item.title}</h3>
                </div>
                <span className="badge">{item.score}</span>
              </div>
              <p className="muted">{item.summary}</p>
            </article>
          ))}
        </div>
      )}

      {props.tab === 'summary' && props.items[0] && (
        <div className="stack">
          <div className="brief-box">
            <span className="status-pill ready">Top match</span>
            <h3>{props.items[0].title}</h3>
            <p className="muted">{props.items[0].summary}</p>
          </div>
          {props.items[0].facts.map((f) => <div key={f} className="fact-line">{f}</div>)}
        </div>
      )}

      {props.tab === 'citations' && (
        <div className="stack">
          {citations.map((c) => (
            <div key={c}><span className="citation">{c}</span></div>
          ))}
        </div>
      )}
    </section>
  );
}
