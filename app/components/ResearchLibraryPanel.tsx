type Props = {
  records: any[];
  onOpenRecord: (record: any) => void;
  onOpenReading: (record: any) => void;
};

function groupByIssuer(records: any[]) {
  return records.reduce<Record<string, any[]>>((groups, record) => {
    const issuer = record.title || record.issuer || 'Untitled issuer';
    groups[issuer] = groups[issuer] || [];
    groups[issuer].push(record);
    return groups;
  }, {});
}

export function ResearchLibraryPanel({ records, onOpenRecord, onOpenReading }: Props) {
  const groups = groupByIssuer(records);
  const issuers = Object.keys(groups).sort();

  return (
    <section className="full-page-panel library-page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h2>Research Library</h2>
          <p className="muted small">Saved research runs, reports, versions, and review status by issuer.</p>
        </div>
        <span className="count">{records.length}</span>
      </div>

      {records.length === 0 && (
        <div className="empty-workflow-state">
          Save a research run or generated report to build the issuer library.
        </div>
      )}

      {issuers.map((issuer) => (
        <section key={issuer} className="library-issuer">
          <div className="section-heading">
            <div>
              <h3>{issuer}</h3>
              <p className="muted small">{groups[issuer].length} saved runs</p>
            </div>
          </div>

          <div className="library-run-list">
            {groups[issuer].map((record) => (
              <article key={`${record.id}-${record.savedAt}`} className="library-run">
                <div>
                  <div className="record-meta">
                    <span>{record.workflowStatus || 'Draft'}</span>
                    <span>{record.generatedReport?.templateLabel || record.outputType || 'Research package'}</span>
                    <span>{record.reportVersions?.length ?? 0} versions</span>
                  </div>
                  <h3>{record.generatedReport?.title || record.title}</h3>
                  <p className="muted small">
                    {record.researchModeLabel ?? record.topic} · saved {record.savedAt ? new Date(record.savedAt).toLocaleString() : 'locally'}
                  </p>
                </div>
                <div className="library-actions">
                  <button className="button-secondary" onClick={() => onOpenRecord(record)}>Open Workspace</button>
                  <button className="button-primary" onClick={() => onOpenReading(record)}>Open Report</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
