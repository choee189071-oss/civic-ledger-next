type Props = {
  current: string;
  onChange: (view: string) => void;
  savedRecords: any[];
  recentWorkspaces: any[];
  favorites: any[];
  onOpenRecent: (item: any) => void;
  onOpenFavorite: (item: any) => void;
};

export function Sidebar({
  current,
  onChange,
  savedRecords,
  recentWorkspaces,
  favorites,
  onOpenRecent,
  onOpenFavorite,
}: Props) {
  const primaryViews = [
    { id: 'search', label: 'Search', icon: '⌕' },
    { id: 'developments', label: 'Dashboard', icon: '↗' },
    { id: 'source-management', label: 'Source Management', icon: '▧' },
    { id: 'library', label: 'Reports', icon: '▤' },
  ];

  const workspaceViews = [
    { id: 'reading', label: 'Editor', icon: '□' },
    { id: 'workflows', label: 'Templates', icon: '▦' },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">CL</div>
        <div>
          <strong>Civic Ledger</strong>
          <div className="muted small">Municipal credit research</div>
        </div>
      </div>

      <nav className="nav">
        {primaryViews.map((v) => (
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

      <section className="sidebar-section compact">
        <div className="sidebar-label">Workspace</div>
        <nav className="nav secondary-nav">
          {workspaceViews.map((v) => (
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
      </section>

      <section className="sidebar-section">
        <div className="section-heading">
          <span>Favorites</span>
          <span className="count">{favorites.length}</span>
        </div>
        <div className="saved-list">
          {favorites.length === 0 && (
            <p className="muted small">Pin issuers, reports, or documents for faster access.</p>
          )}
          {favorites.slice(0, 6).map((item) => (
            <button key={item.id} type="button" className="saved-item sidebar-action-item" onClick={() => onOpenFavorite(item)}>
              <span className={`saved-dot favorite-dot ${item.type}`} />
              <div>
                <strong>{item.title}</strong>
                <p className="muted small">{item.type} · {item.subtitle || 'Pinned workspace item'}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-heading">
          <span>Recent workspace</span>
          <span className="count">{recentWorkspaces.length}</span>
        </div>
        <div className="saved-list">
          {recentWorkspaces.length === 0 && (
            <p className="muted small">Recent issuers will appear automatically.</p>
          )}
          {recentWorkspaces.slice(0, 5).map((item) => (
            <button key={item.id} type="button" className="saved-item sidebar-action-item" onClick={() => onOpenRecent(item)}>
              <span className="saved-dot recent-dot" />
              <div>
                <strong>{item.issuer || item.title}</strong>
                <p className="muted small">{item.subtitle || item.title}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

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
