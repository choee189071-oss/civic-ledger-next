type Props = {
  current: string;
  onChange: (view: string) => void;
};

export function Sidebar({ current, onChange }: Props) {
  const views = [
    { id: 'search', label: 'Search' },
    { id: 'reading', label: 'Reading' },
    { id: 'sources', label: 'Sources' }
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">↗</div>
        <div>
          <strong>Civic Ledger</strong>
          <div className="muted" style={{ fontSize: 13 }}>Public finance workspace</div>
        </div>
      </div>
      <nav className="nav">
        {views.map((v) => (
          <button
            key={v.id}
            className={current === v.id ? 'active' : ''}
            onClick={() => onChange(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="panel" style={{ marginTop: 24 }}>
        <strong>Mock API mode</strong>
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Route handlers simulate real endpoints. Swap lib/mock-data.ts for real data when ready.
        </p>
      </div>
    </aside>
  );
}
