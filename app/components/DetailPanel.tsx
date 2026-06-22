type Props = {
  detail: any;
  onOpenReading: () => void;
};

export function DetailPanel({ detail, onOpenReading }: Props) {
  if (!detail) {
    return (
      <div className="detail-card">
        <h3>Detail</h3>
        <p className="muted">Select a result to fetch its record.</p>
      </div>
    );
  }

  return (
    <div className="detail-card">
      <h3>{detail.title}</h3>
      <p className="muted" style={{ marginTop: 8 }}>{detail.snippet}</p>
      <div className="meta" style={{ margin: '14px 0' }}>
        <span>{detail.topic}</span>
        <span>{detail.source}</span>
        <span>Score {detail.score}</span>
      </div>
      <div className="stack">
        {detail.facts?.map((f: string) => (
          <div key={f} className="muted">{f}</div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {detail.citations?.map((c: string) => (
          <span key={c} className="citation">{c}</span>
        ))}
      </div>
      <div className="toolbar" style={{ marginTop: 16 }}>
        <button className="button-primary" onClick={onOpenReading}>Open reading</button>
      </div>
    </div>
  );
}
