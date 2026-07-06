"use client";

import { useMemo, useRef, useState } from 'react';

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
  recencyScope?: {
    asOfDate: string;
    preferredStartDate: string;
    fallbackStartDate: string;
    annualStartDate: string;
    structuralStartDate: string;
  };
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

const monitoringConditions = [
  {
    id: 'board-minutes',
    label: 'Board meeting minutes / packets',
    prompt: 'board meeting minutes, board agenda, board packet, consent agenda, action items',
  },
  {
    id: 'bond-authorization',
    label: 'Bond authorization / resolution',
    prompt: 'new bond deal, bond authorization, bond resolution, GO bonds, refunding bonds, official statement authorization',
  },
  {
    id: 'advisor-counsel',
    label: 'Municipal advisor / bond counsel',
    prompt: 'hired municipal advisor, financial advisor, bond counsel, disclosure counsel, underwriter pool',
  },
  {
    id: 'rfp',
    label: 'RFP approvals / RFP results',
    prompt: 'RFP approved to post, RFP results, award of contract, municipal finance RFP, bond counsel RFP',
  },
  {
    id: 'ratings-disclosure',
    label: 'Ratings / EMMA disclosure',
    prompt: 'rating action, outlook change, EMMA continuing disclosure, MSRB filing, annual disclosure',
  },
  {
    id: 'budget-enrollment',
    label: 'Budget / enrollment / state funding',
    prompt: 'budget adoption, tentative budget, enrollment, FTES, state apportionment, COLA, labor cost',
  },
];

function matchesIssuer(record: any, issuer: string) {
  const text = `${record.title ?? ''} ${record.generatedReport?.title ?? ''}`.toLowerCase();
  return text.includes(issuer.toLowerCase());
}

export function IssuerDevelopmentsPanel({ savedRecords, onRunIssuerScan }: Props) {
  const [sectorId, setSectorId] = useState('education-ccd');
  const [monitorMode, setMonitorMode] = useState<'single' | 'sector'>('single');
  const [query, setQuery] = useState('');
  const [selectedIssuer, setSelectedIssuer] = useState(ccdIssuers[0]);
  const [ccdUpdates, setCcdUpdates] = useState<CcdUpdate[]>([]);
  const [selectedIssuers, setSelectedIssuers] = useState<string[]>(ccdIssuers);
  const [selectedConditions, setSelectedConditions] = useState<string[]>(
    monitoringConditions.map((condition) => condition.id)
  );
  const [isRunningGeneralUpdate, setIsRunningGeneralUpdate] = useState(false);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [currentScanIssuer, setCurrentScanIssuer] = useState('');
  const [generalUpdateError, setGeneralUpdateError] = useState('');
  const pauseRequestedRef = useRef(false);
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

  const selectedConditionPrompts = monitoringConditions
    .filter((condition) => selectedConditions.includes(condition.id))
    .map((condition) => `${condition.label}: ${condition.prompt}`);

  async function scanIssuer(issuer: string): Promise<CcdUpdate> {
    const res = await fetch('/api/developments/issuer-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issuer, conditions: selectedConditionPrompts }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        issuer,
        update: `### ${issuer}\nStatus: Needs manual verification\nRecency: Undated source\nReason: The automated scan failed, so the platform could not verify whether there was a quarterly or annual issuer-specific development.\nUpdate: Re-run this issuer individually or verify manually against board packets, EMMA/MSRB, rating pages, and official issuer materials.\nSource: ${payload.error || 'Scanner error'}`,
        error: payload.error || 'Scan failed.',
      };
    }

    return payload;
  }

  function mergeUpdate(updates: CcdUpdate[], update: CcdUpdate) {
    return [
      ...updates.filter((item) => item.issuer !== update.issuer),
      update,
    ];
  }

  async function runCcdQueue(issuersToScan: string[], options?: { reset?: boolean }) {
    if (issuersToScan.length === 0) return;

    pauseRequestedRef.current = false;
    setIsRunningGeneralUpdate(true);
    setBatchStatus('running');
    setGeneralUpdateError('');

    let nextUpdates: CcdUpdate[] = options?.reset ? [] : [...ccdUpdates];
    if (options?.reset) {
      setCcdUpdates([]);
    }

    try {
      for (const issuer of issuersToScan) {
        if (pauseRequestedRef.current) {
          setBatchStatus('paused');
          break;
        }

        setCurrentScanIssuer(issuer);
        const update = await scanIssuer(issuer);
        nextUpdates = mergeUpdate(nextUpdates, update);
        setCcdUpdates([...nextUpdates]);
      }

      if (!pauseRequestedRef.current) {
        setBatchStatus('completed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'General CCD update failed.';
      setGeneralUpdateError(message);
      setBatchStatus('paused');
    } finally {
      setCurrentScanIssuer('');
      setIsRunningGeneralUpdate(false);
    }
  }

  function runFullCcdUpdate() {
    const issuersToScan = selectedIssuers.length > 0 ? selectedIssuers : ccdIssuers;
    void runCcdQueue(issuersToScan, { reset: true });
  }

  function pauseCcdUpdate() {
    pauseRequestedRef.current = true;
    setBatchStatus('paused');
  }

  function resumeCcdUpdate() {
    const issuersToScan = selectedIssuers.length > 0 ? selectedIssuers : ccdIssuers;
    const completed = new Set(ccdUpdates.map((item) => item.issuer));
    void runCcdQueue(issuersToScan.filter((issuer) => !completed.has(issuer)));
  }

  function retryFailedCcdUpdate() {
    const failedIssuers = ccdUpdates.filter((item) => item.error).map((item) => item.issuer);
    void runCcdQueue(failedIssuers);
  }

  function ccdReportMarkdown(options?: { completedOnly?: boolean }) {
    const date = new Date().toISOString().slice(0, 10);
    const issuersToScan = selectedIssuers.length > 0 ? selectedIssuers : ccdIssuers;
    const foundCount = ccdUpdates.filter((item) => /Status:\s*Development found/i.test(item.update)).length;
    const noRecentCount = ccdUpdates.filter((item) => /Status:\s*No recent change found/i.test(item.update)).length;
    const staleCount = ccdUpdates.filter((item) => /Status:\s*Stale source only/i.test(item.update)).length;
    const insufficientCount = ccdUpdates.filter((item) => /Status:\s*Insufficient public evidence/i.test(item.update)).length;
    const verificationCount = ccdUpdates.filter((item) => /Status:\s*Needs manual verification/i.test(item.update)).length;
    const scope = ccdUpdates.find((item) => item.recencyScope)?.recencyScope;
    const queuedGaps = options?.completedOnly
      ? []
      : issuersToScan
        .filter((issuer) => !ccdUpdates.some((item) => item.issuer === issuer))
        .map((issuer) => `### ${issuer}\nStatus: Not scanned\nRecency: Not checked\nReason: This issuer was included in the selected batch but has not been scanned in this run.\nUpdate: No automated conclusion is available yet.\nSource: Pending queue item`);
    const bodyItems = [...ccdUpdates.map((item) => item.update), ...queuedGaps];
    const body = bodyItems.length > 0
      ? bodyItems.join('\n\n---\n\n')
      : 'No issuer updates generated yet.';
    const notScannedCount = Math.max(issuersToScan.length - ccdUpdates.length, 0);
    const conditionRows = selectedConditionPrompts.length > 0
      ? selectedConditionPrompts.map((condition) => {
        const [label, ...rest] = condition.split(':');
        return [label.trim(), rest.join(':').trim() || 'Selected monitoring condition'];
      })
      : [['All standard conditions', 'Board packets, bond actions, advisors/counsel, RFPs, EMMA/rating activity, budget/enrollment/funding signals']];

    return [
      '# General CCD Update',
      '',
      `Generated: ${date}`,
      `Coverage: ${ccdUpdates.length} of ${issuersToScan.length} selected California CCD issuers${options?.completedOnly ? ' (completed items only)' : ''}`,
      '',
      '## Monitoring Dashboard',
      '',
      '| Metric | Result |',
      '|---|---|',
      `| Quarterly recency window | ${scope ? `${scope.preferredStartDate} to ${scope.asOfDate}` : 'Last 3 months'} |`,
      `| Annual monitoring window | ${scope ? `${scope.annualStartDate} to ${scope.asOfDate}` : 'Last 1 year'} |`,
      `| Selected issuers | ${issuersToScan.length} |`,
      `| Scanned issuers | ${ccdUpdates.length} |`,
      `| Material developments surfaced | ${foundCount} |`,
      `| No recent change found | ${noRecentCount} |`,
      `| Older context only | ${staleCount} |`,
      `| Insufficient public evidence | ${insufficientCount} |`,
      `| Needs manual verification | ${verificationCount} |`,
      `| Not scanned | ${notScannedCount} |`,
      '',
      '## Use Caveat',
      '',
      'This is a monitoring scan, not a credit opinion. Each issuer is checked separately and summarized for follow-up review. Older material is background unless clearly material and still relevant.',
      '',
      '## Monitoring Conditions',
      '',
      '| Condition | Search focus |',
      '|---|---|',
      ...conditionRows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, '/')).join(' | ')} |`),
      '',
      '## Issuer Updates',
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

  async function downloadCcdPdf() {
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'General CCD Update',
        content: ccdReportMarkdown(),
        filename: `general_ccd_update_${new Date().toISOString().slice(0, 10)}.pdf`,
      }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `general_ccd_update_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadCcdDocx(options?: { completedOnly?: boolean }) {
    const res = await fetch('/api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: options?.completedOnly ? 'General CCD Update - Completed Items' : 'General CCD Update',
        content: ccdReportMarkdown(options),
        filename: `general_ccd_update_${options?.completedOnly ? 'completed_' : ''}${new Date().toISOString().slice(0, 10)}.docx`,
      }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `general_ccd_update_${options?.completedOnly ? 'completed_' : ''}${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toggleIssuer(issuer: string) {
    setSelectedIssuers((items) =>
      items.includes(issuer) ? items.filter((item) => item !== issuer) : [...items, issuer]
    );
  }

  function toggleCondition(conditionId: string) {
    setSelectedConditions((items) =>
      items.includes(conditionId) ? items.filter((item) => item !== conditionId) : [...items, conditionId]
    );
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

      <div className="monitor-mode-tabs">
        <button
          className={monitorMode === 'single' ? 'active' : ''}
          onClick={() => setMonitorMode('single')}
        >
          Single Issuer Monitor
        </button>
        <button
          className={monitorMode === 'sector' ? 'active' : ''}
          onClick={() => setMonitorMode('sector')}
        >
          General Sector Update
        </button>
      </div>

      {monitorMode === 'sector' && sectorId === 'education-ccd' && (
        <div className="sector-update-workspace">
          <section className="general-update-panel">
            <div>
              <p className="eyebrow">Batch Monitor</p>
              <h3>General CCD Update</h3>
              <p className="muted small">
                Run a sector-wide queue across selected California CCD issuers. Each issuer is checked separately with quarterly updates, annual backfill, and structural context.
              </p>
            </div>
            <div className="report-toolbar">
              <button
                className="button-primary"
                onClick={runFullCcdUpdate}
                disabled={isRunningGeneralUpdate || selectedIssuers.length === 0}
              >
                {isRunningGeneralUpdate ? 'Running...' : `Run ${selectedIssuers.length} Issuer Update`}
              </button>
              <button
                className="button-secondary"
                onClick={pauseCcdUpdate}
                disabled={!isRunningGeneralUpdate}
              >
                Pause
              </button>
              <button
                className="button-secondary"
                onClick={resumeCcdUpdate}
                disabled={isRunningGeneralUpdate || batchStatus !== 'paused'}
              >
                Resume
              </button>
              <button
                className="button-secondary"
                onClick={retryFailedCcdUpdate}
                disabled={isRunningGeneralUpdate || !ccdUpdates.some((item) => item.error)}
              >
                Retry Failed
              </button>
            </div>
          </section>

          <section className="ccd-update-console">
            <div className="section-heading">
              <div>
                <h3>General CCD Update Report</h3>
                <p className="muted small">
                  {isRunningGeneralUpdate
                    ? `Scanning ${currentScanIssuer}...`
                    : `${ccdUpdates.length} of ${selectedIssuers.length || ccdIssuers.length} selected issuers scanned · ${batchStatus}`}
                </p>
              </div>
              <div className="report-toolbar">
                <button className="button-secondary" onClick={copyCcdReport} disabled={ccdUpdates.length === 0}>Copy Report</button>
                <button className="button-secondary" onClick={downloadCcdReport} disabled={ccdUpdates.length === 0}>Download MD</button>
                <button className="button-secondary" onClick={downloadCcdPdf} disabled={ccdUpdates.length === 0}>Download PDF</button>
                <button className="button-secondary" onClick={() => downloadCcdDocx()} disabled={ccdUpdates.length === 0}>Full DOCX</button>
                <button className="button-secondary" onClick={() => downloadCcdDocx({ completedOnly: true })} disabled={ccdUpdates.length === 0}>Completed DOCX</button>
              </div>
            </div>

            <div className="scan-config-grid">
              <section className="scan-config-block">
                <div className="section-heading">
                  <div>
                    <h3>Monitoring conditions</h3>
                    <p className="muted small">These are included in every issuer-specific search prompt, with fresh items preferred over older background.</p>
                  </div>
                  <span className="status-pill">{selectedConditions.length} selected</span>
                </div>
                <div className="condition-grid">
                  {monitoringConditions.map((condition) => (
                    <label key={condition.id} className="condition-option">
                      <input
                        type="checkbox"
                        checked={selectedConditions.includes(condition.id)}
                        onChange={() => toggleCondition(condition.id)}
                      />
                      <span>{condition.label}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="scan-config-block">
                <div className="section-heading">
                  <div>
                    <h3>Issuer selection</h3>
                    <p className="muted small">Run all CCDs or choose a subset for a faster targeted update.</p>
                  </div>
                  <span className="status-pill">{selectedIssuers.length} selected</span>
                </div>
                <div className="selection-actions">
                  <button className="button-secondary" onClick={() => setSelectedIssuers(ccdIssuers)}>Select All</button>
                  <button className="button-secondary" onClick={() => setSelectedIssuers(filteredIssuers)}>Select Filtered</button>
                  <button className="button-secondary" onClick={() => setSelectedIssuers([])}>Clear</button>
                </div>
                <div className="issuer-checkbox-list">
                  {filteredIssuers.map((issuer) => (
                    <label key={issuer} className="issuer-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIssuers.includes(issuer)}
                        onChange={() => toggleIssuer(issuer)}
                      />
                      <span>{issuer}</span>
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="ccd-progress">
              <span style={{ width: `${Math.round((ccdUpdates.length / Math.max(selectedIssuers.length, 1)) * 100)}%` }} />
            </div>

            {generalUpdateError && <div className="error-banner">{generalUpdateError}</div>}

            <div className="ccd-update-grid">
              {(selectedIssuers.length > 0 ? selectedIssuers : ccdIssuers).map((issuer) => {
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
        </div>
      )}

      {monitorMode === 'sector' && sectorId !== 'education-ccd' && (
        <div className="empty-workflow-state">
          General sector update is ready for this category once issuers are added.
        </div>
      )}

      {monitorMode === 'single' && (
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
                  <p className="muted">Recent development workspace for reports, news, disclosure filings, and credit watch items. Searches separate quarterly updates, annual evidence, and structural context.</p>
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
      )}
    </section>
  );
}
