"use client";

import { useMemo, useState } from 'react';

type Props = {
  savedRecords: any[];
  onRunIssuerScan: (issuer: string, mode: string, angle: string) => void;
};

type CcdUpdate = {
  issuer: string;
  update: string;
  citations?: string[];
  error?: string;
  timestamp?: string;
};

const ccdIssuers = [
  'Los Angeles CCD',
  'San Diego CCD',
  'Long Beach CCD',
  'Riverside CCD',
  'State Center CCD',
  'Southwestern CCD',
  'San Joaquin Delta CCD',
  'Foothill-De Anza CCD',
  'Mt. San Antonio CCD',
  'Peralta CCD',
  'Pasadena Area CCD',
  'Glendale CCD',
  'Santa Monica CCD',
  'West Valley-Mission CCD',
  'Chabot-Las Positas CCD',
  'Cerritos CCD',
  'Chaffey CCD',
  'San Francisco CCD',
  'Rio Hondo CCD',
  'Compton CCD',
  'North Orange County CCD',
  'Citrus CCD',
  'Monterey Peninsula CCD',
  'Santa Barbara CCD',
  'Sierra Joint CCD',
  'Victor Valley CCD',
  'Gavilan CCD',
  'Grossmont-Cuyamaca CCD',
  'West Hills CCD',
  'El Camino CCD',
  'Redwoods CCD',
  'Merced CCD',
  'Imperial CCD',
  'Santa Clarita CCD',
  'Contra Costa CCD',
  'Lake Tahoe CCD',
  'Siskiyou Joint CCD',
  'Allan Hancock Joint CCD',
  'Sequoias CCD',
  'Antelope Valley CCD',
  'Solano County CCD',
  'Cabrillo CCD',
  'West Kern CCD',
  'Desert CCD',
  'Butte-Glenn CCD',
  'Copper Mountain CCD',
  'Barstow CCD',
  'Coast CCD',
  'Feather River CCD',
  'Hartnell CCD',
  'Kern CCD',
  'Lassen CCD',
  'Los Rios CCD',
  'Marin CCD',
  'Mendocino-Lake CCD',
  'MiraCosta CCD',
  'Mt. San Jacinto CCD',
  'Napa Valley CCD',
  'Ohlone CCD',
  'Palo Verde CCD',
  'Palomar CCD',
  'Rancho Santiago CCD',
  'San Bernardino CCD',
  'San Jose-Evergreen CCD',
  'San Luis Obispo County CCD',
  'San Mateo County CCD',
  'Shasta-Tehama-Trinity Joint CCD',
  'Sonoma County Junior CCD',
  'South Orange County CCD',
  'Ventura County CCD',
  'Yosemite CCD',
  'Yuba CCD',
];

const sectors = [
  {
    id: 'education-ccd',
    label: 'Education / CCD',
    description: 'California community college districts, including bond, enrollment, budget, rating, and board-development monitoring.',
    issuers: ccdIssuers,
  },
  {
    id: 'utilities',
    label: 'Utilities',
    description: 'Public power, water, wastewater, and utility revenue credits.',
    issuers: [],
  },
  {
    id: 'cities-counties',
    label: 'Cities / Counties',
    description: 'General government issuers, GO, lease revenue, pension, budget, and disclosure monitoring.',
    issuers: [],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    description: 'Hospital and healthcare district credits.',
    issuers: [],
  },
];

const reportTracks = [
  {
    title: 'Recent Development Brief',
    mode: 'risk-news-monitoring',
    angle: 'recent developments, rating actions, board actions, budget updates, enrollment trends, bond issuance, EMMA continuing disclosure',
  },
  {
    title: 'Credit Update',
    mode: 'issuer-credit-profile',
    angle: 'credit update with ratings, debt profile, financial performance, enrollment, state funding, and capital plan',
  },
  {
    title: 'Disclosure and Bond Monitor',
    mode: 'debt-bond-research',
    angle: 'official statements, continuing disclosure, debt issuance, bond ratings, debt service, and covenant-related developments',
  },
  {
    title: 'Board / Budget Watch',
    mode: 'financial-performance',
    angle: 'board agenda, adopted budget, tentative budget, audit, reserves, enrollment, and state apportionment developments',
  },
];

const developmentSlots = [
  'Rating actions and outlook changes',
  'Bond issuance and EMMA filings',
  'Board agenda and budget updates',
  'Enrollment, state funding, and labor items',
  'Capital projects and facilities bonds',
];

function matchesIssuer(record: any, issuer: string) {
  const text = `${record.title ?? ''} ${record.generatedReport?.title ?? ''}`.toLowerCase();
  return text.includes(issuer.toLowerCase());
}

export function IssuerDevelopmentsPanel({ savedRecords, onRunIssuerScan }: Props) {
  const [sectorId, setSectorId] = useState('education-ccd');
  const [query, setQuery] = useState('');
  const [selectedIssuer, setSelectedIssuer] = useState(ccdIssuers[0]);
  const [ccdUpdates, setCcdUpdates] = useState<CcdUpdate[]>([]);
  const [isRunningGeneralUpdate, setIsRunningGeneralUpdate] = useState(false);
  const [currentScanIssuer, setCurrentScanIssuer] = useState('');
  const [generalUpdateError, setGeneralUpdateError] = useState('');
  const sector = sectors.find((item) => item.id === sectorId) ?? sectors[0];
  const filteredIssuers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sector.issuers;
    return sector.issuers.filter((issuer) => issuer.toLowerCase().includes(needle));
  }, [query, sector.issuers]);
  const savedForIssuer = savedRecords.filter((record) => matchesIssuer(record, selectedIssuer));

  function runTrack(track: (typeof reportTracks)[number]) {
    onRunIssuerScan(selectedIssuer, track.mode, `${selectedIssuer} ${track.angle}`);
  }

  async function scanIssuer(issuer: string): Promise<CcdUpdate> {
    const res = await fetch('/api/developments/issuer-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issuer }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        issuer,
        update: `### ${issuer}\nStatus: Needs manual verification\nUpdate: The automated scan failed for this issuer. Re-run this issuer individually or verify manually.\nSource: ${payload.error || 'Scanner error'}`,
        error: payload.error || 'Scan failed.',
      };
    }

    return payload;
  }

  async function runFullCcdUpdate() {
    setIsRunningGeneralUpdate(true);
    setGeneralUpdateError('');
    setCcdUpdates([]);

    const nextUpdates: CcdUpdate[] = [];

    try {
      for (const issuer of ccdIssuers) {
        setCurrentScanIssuer(issuer);
        const update = await scanIssuer(issuer);
        nextUpdates.push(update);
        setCcdUpdates([...nextUpdates]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'General CCD update failed.';
      setGeneralUpdateError(message);
    } finally {
      setCurrentScanIssuer('');
      setIsRunningGeneralUpdate(false);
    }
  }

  function ccdReportMarkdown() {
    const date = new Date().toISOString();
    const body = ccdUpdates.length > 0
      ? ccdUpdates.map((item) => item.update).join('\n\n---\n\n')
      : 'No issuer updates generated yet.';

    return [
      '# General CCD Update',
      '',
      `Generated: ${date}`,
      `Coverage: ${ccdUpdates.length} of ${ccdIssuers.length} California CCD issuers`,
      '',
      'This is a monitoring scan, not a full credit opinion. Each issuer is checked separately and summarized in 2-3 sentences.',
      '',
      body,
    ].join('\n');
  }

  async function copyCcdReport() {
    await navigator.clipboard.writeText(ccdReportMarkdown());
  }

  function downloadCcdReport() {
    const blob = new Blob([ccdReportMarkdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `general_ccd_update_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="full-page-panel developments-page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Issuer Monitor</p>
          <h2>Issuer Recent Developments</h2>
          <p className="muted small">Track reports, recent news, disclosure activity, and sector-specific watch items by issuer.</p>
        </div>
        <span className="count">{sector.issuers.length}</span>
      </div>

      <div className="sector-tabs">
        {sectors.map((item) => (
          <button
            key={item.id}
            className={sectorId === item.id ? 'active' : ''}
            onClick={() => {
              setSectorId(item.id);
              setQuery('');
              setSelectedIssuer(item.issuers[0] ?? '');
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {sectorId === 'education-ccd' && (
        <section className="general-update-panel">
          <div>
            <p className="eyebrow">Batch Monitor</p>
            <h3>General CCD Update</h3>
            <p className="muted small">
              Run one sector-wide scan across all {ccdIssuers.length} California CCD issuers and generate a report only for issuers with material new developments.
            </p>
          </div>
          <button
            className="button-primary"
            onClick={runFullCcdUpdate}
            disabled={isRunningGeneralUpdate}
          >
            {isRunningGeneralUpdate ? 'Running CCD Queue...' : 'Run General CCD Update'}
          </button>
        </section>
      )}

      {sectorId === 'education-ccd' && (
        <section className="ccd-update-console">
          <div className="section-heading">
            <div>
              <h3>General CCD Update Report</h3>
              <p className="muted small">
                {isRunningGeneralUpdate
                  ? `Scanning ${currentScanIssuer}...`
                  : `${ccdUpdates.length} of ${ccdIssuers.length} issuers scanned`}
              </p>
            </div>
            <div className="report-toolbar">
              <button className="button-secondary" onClick={copyCcdReport} disabled={ccdUpdates.length === 0}>Copy Report</button>
              <button className="button-secondary" onClick={downloadCcdReport} disabled={ccdUpdates.length === 0}>Download MD</button>
            </div>
          </div>

          <div className="ccd-progress">
            <span style={{ width: `${Math.round((ccdUpdates.length / ccdIssuers.length) * 100)}%` }} />
          </div>

          {generalUpdateError && <div className="error-banner">{generalUpdateError}</div>}

          <div className="ccd-update-grid">
            {ccdIssuers.map((issuer) => {
              const update = ccdUpdates.find((item) => item.issuer === issuer);
              const active = currentScanIssuer === issuer;

              return (
                <article key={issuer} className={`ccd-update-row ${active ? 'active' : ''}`}>
                  <div>
                    <div className="record-meta">
                      <span>{update ? 'Checked' : active ? 'Scanning' : 'Queued'}</span>
                      {update?.error && <span>Needs verification</span>}
                    </div>
                    <h3>{issuer}</h3>
                    <p className="muted small">
                      {update ? update.update.replace(/^### .+\n?/m, '').slice(0, 520) : active ? 'Live scan in progress...' : 'Waiting for issuer-specific scan.'}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="developments-layout">
        <aside className="issuer-browser">
          <div>
            <h3>{sector.label}</h3>
            <p className="muted small">{sector.description}</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter issuer..."
          />
          <div className="issuer-list">
            {filteredIssuers.length === 0 && (
              <p className="muted small">This sector is ready for issuer data.</p>
            )}
            {filteredIssuers.map((issuer) => (
              <button
                key={issuer}
                className={selectedIssuer === issuer ? 'active' : ''}
                onClick={() => setSelectedIssuer(issuer)}
              >
                <span>{issuer}</span>
                <strong>CCD</strong>
              </button>
            ))}
          </div>
        </aside>

        <main className="issuer-development-detail">
          {selectedIssuer ? (
            <>
              <div className="issuer-detail-head">
                <div>
                  <p className="eyebrow">{sector.label}</p>
                  <h2>{selectedIssuer}</h2>
                  <p className="muted">Recent development workspace for reports, news, disclosure filings, and credit watch items.</p>
                </div>
                <button
                  className="button-primary"
                  onClick={() => onRunIssuerScan(
                    selectedIssuer,
                    'risk-news-monitoring',
                    `${selectedIssuer} recent developments rating actions board agenda budget enrollment bond issuance EMMA continuing disclosure`
                  )}
                >
                  Run Live Development Scan
                </button>
              </div>

              <section className="development-section">
                <div className="section-heading">
                  <div>
                    <h3>Report tracks</h3>
                    <p className="muted small">Start from the same issuer, but route the scan into a different work product.</p>
                  </div>
                </div>
                <div className="track-grid">
                  {reportTracks.map((track) => (
                    <article key={track.title} className="track-card">
                      <h3>{track.title}</h3>
                      <p className="muted small">{track.angle}</p>
                      <button className="button-secondary" onClick={() => runTrack(track)}>
                        Start
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="development-section">
                <div className="section-heading">
                  <div>
                    <h3>Recent news and disclosure slots</h3>
                    <p className="muted small">These slots are populated by live scans and saved reports.</p>
                  </div>
                </div>
                <div className="development-slot-list">
                  {developmentSlots.map((slot) => (
                    <article key={slot} className="development-slot">
                      <div>
                        <h3>{slot}</h3>
                        <p className="muted small">Run a live scan to collect sources, citations, and a draft update.</p>
                      </div>
                      <span className="status-pill">Ready to scan</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="development-section">
                <div className="section-heading">
                  <div>
                    <h3>Saved reports for this issuer</h3>
                    <p className="muted small">Reports saved in Research Library will appear here.</p>
                  </div>
                  <span className="status-pill">{savedForIssuer.length} saved</span>
                </div>
                <div className="saved-report-strip">
                  {savedForIssuer.length === 0 && (
                    <p className="muted small">No saved reports for {selectedIssuer} yet.</p>
                  )}
                  {savedForIssuer.map((record) => (
                    <article key={`${record.id}-${record.savedAt}`} className="saved-report-card">
                      <div className="record-meta">
                        <span>{record.workflowStatus || 'Draft'}</span>
                        <span>{record.generatedReport?.templateLabel || 'Research package'}</span>
                      </div>
                      <h3>{record.generatedReport?.title || record.title}</h3>
                      <p className="muted small">{record.savedAt ? new Date(record.savedAt).toLocaleDateString() : 'Saved locally'}</p>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-workflow-state">
              Add issuers to this sector to start monitoring recent developments.
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
