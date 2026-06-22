type Props = {
  items: any[];
};

export function SourcesPanel({ items }: Props) {
  return (
    <div className="card">
      <h3>Sources</h3>
      <div className="stack" style={{ marginTop: 16 }}>
        {items.map((item) => (
          <div key={item.id} className="panel">
            <div className="meta">
              <span>{item.topic}</span>
              <span>{item.trust}</span>
              <span>{item.freshness}</span>
            </div>
            <h4 style={{ margin: '8px 0' }}>{item.name}</h4>
            <p className="muted">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
