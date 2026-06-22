type Props = {
  items: any[];
};

export function SourcesPanel({ items }: Props) {
  return (
    <section className="full-page-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Registry</p>
          <h2>Source registry</h2>
        </div>
        <span className="count">{items.length}</span>
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
  );
}
