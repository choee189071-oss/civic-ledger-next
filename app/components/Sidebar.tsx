type Props = {
  current: string;
  onChange: (view: string) => void;
  savedRecords: any[];
};

export function Sidebar({ current, onChange, savedRecords }: Props) {
  const views = [
    { id: 'search', label: 'Research desk', icon: '⌕' },
    { id: 'reading', label: 'Reading room', icon: '□' },
    { id: 'sources', label: 'Source list', icon: '◇' }
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">CL</div>
        <div>
          <strong>Civic Ledger</strong>
          <div className="muted small">Public finance workspace</div>
        </div>
      </div>

      <nav className="nav">
        {views.map((v) => (
          <button
            key={v.id}
            className={current === v.id ? 'active' : ''}
            onClick={() => onChange(v.id)}
          >
            <span>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </nav>

      <section className="sidebar-section">
        <div className="section-heading">
          <span>Saved records</span>
          <span className="count">{savedRecords.length}</span>
        </div>
        <div className="saved-list">
          {savedRecords.length === 0 && (
            <p className="muted small">No records saved yet.</p>
          )}
          {savedRecords.map((record) => (
            <div key={record.id} className="saved-item">
              <span className="saved-dot" />
              <div>
                <strong>{record.title}</strong>
                <p className="muted small">{record.source} · {record.topic}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
