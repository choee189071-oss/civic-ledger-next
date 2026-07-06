import { workspaceFeatures } from '../../lib/workspace-features';

type Props = {
  current: string;
  experienceMode: 'reader' | 'supervisor';
  onChange: (view: string) => void;
  onExperienceModeChange: (mode: 'reader' | 'supervisor') => void;
  savedRecords: any[];
  recentWorkspaces: any[];
  favorites: any[];
  onOpenRecent: (item: any) => void;
  onOpenFavorite: (item: any) => void;
};

export function Sidebar({
  current,
  experienceMode,
  onChange,
  onExperienceModeChange,
  savedRecords,
  recentWorkspaces,
  favorites,
  onOpenRecent,
  onOpenFavorite,
}: Props) {
  const primaryViews = [
    { id: 'search', label: 'Research', icon: '⌕' },
  ];

  const workspaceViews = [
    { id: 'reading', label: 'Reading Room', icon: '□' },
    { id: 'library', label: 'Reports', icon: '▤' },
  ];

  const sourceViews = [
    { id: 'documents', label: 'Important Files', icon: '▧' },
    ...(experienceMode === 'supervisor' ? [
      { id: 'profiles', label: 'Issuer Profiles', icon: '◇' },
      { id: 'sources', label: 'Source List', icon: '☷' },
    ] : []),
  ];

  const supervisorViews = [
    ...(workspaceFeatures.dashboardView ? [{ id: 'developments', label: 'Dashboard', icon: '↗' }] : []),
    ...(workspaceFeatures.workflowCenterView ? [{ id: 'workflows', label: 'Templates', icon: '▦' }] : []),
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

      <div className="mode-switch" role="tablist" aria-label="Workspace mode">
        <button
          type="button"
          role="tab"
          aria-selected={experienceMode === 'reader'}
          className={experienceMode === 'reader' ? 'active' : ''}
          onClick={() => onExperienceModeChange('reader')}
        >
          Reader
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={experienceMode === 'supervisor'}
          className={experienceMode === 'supervisor' ? 'active' : ''}
          onClick={() => onExperienceModeChange('supervisor')}
        >
          Supervisor
        </button>
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

      <section className="sidebar-section compact">
        <div className="sidebar-label">Source Management</div>
        <nav className="nav secondary-nav">
          {sourceViews.map((v) => (
            <button
              key={v.id}
              className={current === v.id || (current === 'source-management' && v.id === 'documents') ? 'active' : ''}
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

      {experienceMode === 'supervisor' && supervisorViews.length > 0 && (
        <section className="sidebar-section compact supervisor-tools-section">
          <div className="sidebar-label">Supervisor Tools</div>
          <nav className="nav secondary-nav">
            {supervisorViews.map((v) => (
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
      )}
    </aside>
  );
}
