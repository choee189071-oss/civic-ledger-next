"use client";

import { useEffect, useMemo, useState } from 'react';

type Props = {
  savedRecords: any[];
  issuerProfiles: Record<string, any>;
  onRunWorkflow: (workflow: {
    query: string;
    promptMode: string;
    customAngle: string;
    outputType: string;
    source?: string;
    sort?: string;
  }) => void;
};

const defaultWatchlist = ['LADWP', 'SMUD', 'San Diego CCD', 'Los Angeles CCD'];

const workflowCards = [
  {
    id: 'watchlist',
    title: 'Watchlist / Monitoring',
    label: 'Run watchlist monitor',
    promptMode: 'watchlist-monitoring',
    outputType: 'watchlist-monitor',
    source: 'all',
    angle: 'Check for new EMMA filings, rating changes, board actions, bond authorizations, RFPs, federal awards, Single Audit findings, and other recent monitoring signals. Use preferred 3-month window and 6-month fallback.',
  },
  {
    id: 'peer',
    title: 'Peer Comparison',
    label: 'Build peer table',
    promptMode: 'peer-comparison',
    outputType: 'peer-comparison-table',
    source: 'all',
    angle: 'Build a peer comparison table with DSC, reserve days, debt/revenue, outstanding debt, ratings/outlook, recent developments, comparable bond or benchmark notes, and data gaps.',
  },
  {
    id: 'time-series',
    title: 'Time Series',
    label: 'Build trend table',
    promptMode: 'time-series-analysis',
    outputType: 'time-series-analysis',
    source: 'all',
    angle: 'Extract cross-year trends from ACFRs, budgets, continuing disclosures, and official financial documents. Focus on revenue, expense, liquidity, reserves, DSC, outstanding debt, capital spending, and data gaps.',
  },
  {
    id: 'covenant',
    title: 'Covenant Tracking',
    label: 'Track covenants',
    promptMode: 'covenant-tracking',
    outputType: 'covenant-tracking',
    source: 'EMMA / MSRB',
    angle: 'Find OS/POS covenant language and compare it to latest ACFR or continuing disclosure evidence. Focus on security, revenue pledge, flow of funds, rate covenant, additional bonds test, DSC compliance, and missing verification items.',
  },
];

const monitoringConditions = [
  { id: 'board-minutes', label: 'Board minutes / packets', detail: 'Board agendas, minutes, packets, and board materials' },
  { id: 'bond-deal', label: 'New bond deal', detail: 'Bond authorization, bond resolution, POS/OS, sale notice, or debt issuance signal' },
  { id: 'ma-counsel', label: 'New MA / counsel', detail: 'Municipal advisor, bond counsel, disclosure counsel, underwriter, or financing team change' },
  { id: 'rfp', label: 'RFP / results', detail: 'RFP authorization, posted RFP, RFP award, or procurement result' },
  { id: 'emma', label: 'EMMA filings', detail: 'Continuing disclosure, annual report, event notice, official statement, or filing update' },
  { id: 'rating', label: 'Rating action', detail: 'Rating, outlook, watch, upgrade, downgrade, affirmation, or rating report' },
  { id: 'news', label: 'Issuer news', detail: 'Official press releases, material sector news, budget, audit, labor, enrollment, capital plan' },
];

type WatchlistItem = {
  issuer: string;
  status: string;
  recency: string;
  reason: string;
  update: string;
  source: string;
  checkedAt: string;
  citations?: string[];
  searchResults?: any[];
  error?: string;
};

function lines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function profileIssuers(profiles: Record<string, any>) {
  return Object.values(profiles)
    .map((profile: any) => profile?.issuer)
    .filter(Boolean);
}

function extractLine(update: string, label: string) {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'im');
  return update.match(pattern)?.[1]?.trim() || '';
}

function fallbackUpdateSummary(update: string) {
  return update
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^###\s/.test(line))
    .slice(-2)
    .join(' ');
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'watchlist';
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function WorkflowCenterPanel({ savedRecords, issuerProfiles, onRunWorkflow }: Props) {
  const [watchlistText, setWatchlistText] = useState(defaultWatchlist.join('\n'));
  const [selectedIssuer, setSelectedIssuer] = useState(defaultWatchlist[0]);
  const [peerText, setPeerText] = useState('LADWP\nSMUD\nSacramento Municipal Utility District');
  const [yearRange, setYearRange] = useState('FY2022-FY2025');
  const [customNotes, setCustomNotes] = useState('');
  const [selectedConditions, setSelectedConditions] = useState(monitoringConditions.map((item) => item.id));
  const [monitorFrequency, setMonitorFrequency] = useState('weekly');
  const [watchlistRun, setWatchlistRun] = useState<WatchlistItem[]>([]);
  const [isRunningWatchlist, setIsRunningWatchlist] = useState(false);
  const [runProgress, setRunProgress] = useState({ scanned: 0, total: 0 });

  const profileNames = useMemo(() => profileIssuers(issuerProfiles), [issuerProfiles]);
  const watchlist = useMemo(() => {
    const combined = [...lines(watchlistText), ...profileNames];
    return [...new Set(combined)].slice(0, 40);
  }, [watchlistText, profileNames]);

  useEffect(() => {
    const stored = window.localStorage.getItem('civic-ledger-watchlist');
    if (stored) {
      setWatchlistText(stored);
      const first = lines(stored)[0];
      if (first) setSelectedIssuer(first);
    }
    const storedRun = window.localStorage.getItem('civic-ledger-watchlist-run');
    if (storedRun) setWatchlistRun(JSON.parse(storedRun));
    const storedConditions = window.localStorage.getItem('civic-ledger-watchlist-conditions');
    if (storedConditions) setSelectedConditions(JSON.parse(storedConditions));
    const storedFrequency = window.localStorage.getItem('civic-ledger-watchlist-frequency');
    if (storedFrequency) setMonitorFrequency(storedFrequency);
  }, []);

  function saveWatchlist() {
    window.localStorage.setItem('civic-ledger-watchlist', watchlistText);
    window.localStorage.setItem('civic-ledger-watchlist-conditions', JSON.stringify(selectedConditions));
    window.localStorage.setItem('civic-ledger-watchlist-frequency', monitorFrequency);
  }

  function setCondition(id: string, checked: boolean) {
    setSelectedConditions((items) =>
      checked ? [...new Set([...items, id])] : items.filter((item) => item !== id)
    );
  }

  function conditionLabels() {
    return monitoringConditions
      .filter((condition) => selectedConditions.includes(condition.id))
      .map((condition) => `${condition.label}: ${condition.detail}`);
  }

  function persistRun(items: WatchlistItem[]) {
    setWatchlistRun(items);
    window.localStorage.setItem('civic-ledger-watchlist-run', JSON.stringify(items));
  }

  function parseWatchlistItem(issuer: string, payload: any): WatchlistItem {
    const update = String(payload.update ?? '');
    const status = extractLine(update, 'Status') || 'Needs manual verification';
    const recency = extractLine(update, 'Recency') || 'Undated source';
    const reason = extractLine(update, 'Reason') || 'No reason returned.';
    const source = extractLine(update, 'Source') || (payload.citations?.[0] ?? 'No source returned.');

    return {
      issuer,
      status,
      recency,
      reason,
      source,
      update: fallbackUpdateSummary(update) || update || 'No update text returned.',
      checkedAt: payload.timestamp || new Date().toISOString(),
      citations: payload.citations ?? [],
      searchResults: payload.searchResults ?? [],
    };
  }

  async function runIssuerUpdate(issuer: string): Promise<WatchlistItem> {
    const res = await fetch('/api/developments/issuer-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuer,
        conditions: conditionLabels(),
      }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        issuer,
        status: 'Needs manual verification',
        recency: 'Undated source',
        reason: payload.error || 'Automated watchlist scan failed.',
        update: 'Re-run this issuer or verify manually against board packets, EMMA/MSRB, rating pages, and official issuer materials.',
        source: 'Scanner error',
        checkedAt: new Date().toISOString(),
        error: payload.error || 'Watchlist scan failed.',
      };
    }

    return parseWatchlistItem(issuer, payload);
  }

  async function runWatchlistQueue(issuers = watchlist) {
    const queue = issuers.filter(Boolean);
    if (queue.length === 0) return;

    setIsRunningWatchlist(true);
    setRunProgress({ scanned: 0, total: queue.length });
    const initial = queue.map((issuer) => ({
      issuer,
      status: 'Queued',
      recency: 'Waiting',
      reason: 'Waiting for issuer-specific scan.',
      update: 'Waiting for issuer-specific scan.',
      source: '',
      checkedAt: '',
    }));
    persistRun(initial);

    const next = [...initial];
    for (let index = 0; index < queue.length; index += 1) {
      const issuer = queue[index];
      next[index] = {
        ...next[index],
        status: 'Scanning',
        recency: 'In progress',
        reason: 'Checking selected monitoring conditions.',
      };
      persistRun([...next]);

      const item = await runIssuerUpdate(issuer);
      next[index] = item;
      setRunProgress({ scanned: index + 1, total: queue.length });
      persistRun([...next]);
    }

    setIsRunningWatchlist(false);
  }

  function retryManualVerification() {
    const issuers = watchlistRun
      .filter((item) => /manual verification|scanner error|insufficient/i.test(`${item.status} ${item.reason} ${item.error ?? ''}`))
      .map((item) => item.issuer);

    void runWatchlistQueue(issuers);
  }

  function watchlistMarkdown(completedOnly = false) {
    const rows = (completedOnly ? watchlistRun.filter((item) => item.status !== 'Queued' && item.status !== 'Scanning') : watchlistRun);
    return [
      '# Watchlist Monitoring Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Frequency setting: ${monitorFrequency}`,
      `Conditions: ${conditionLabels().join(' | ') || 'All standard conditions'}`,
      '',
      '| Issuer | Status | Recency | Reason | Update | Source | Checked At |',
      '|---|---|---|---|---|---|---|',
      ...rows.map((item) => `| ${item.issuer} | ${item.status} | ${item.recency} | ${item.reason.replace(/\|/g, '/')} | ${item.update.replace(/\|/g, '/')} | ${String(item.source || '').replace(/\|/g, '/')} | ${item.checkedAt || 'Not checked'} |`),
      '',
      '## Manual Verification Queue',
      '',
      ...rows
        .filter((item) => /manual verification|insufficient|stale|undated|scanner error/i.test(`${item.status} ${item.recency} ${item.reason} ${item.error ?? ''}`))
        .map((item) => `- ${item.issuer}: ${item.reason}`),
    ].join('\n');
  }

  async function downloadWatchlistDocx(completedOnly = false) {
    const content = watchlistMarkdown(completedOnly);
    const res = await fetch('/api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Watchlist Monitoring Report',
        content,
        filename: `watchlist_monitor_${completedOnly ? 'completed_' : ''}${new Date().toISOString().slice(0, 10)}.docx`,
      }),
    });
    const blob = await res.blob();
    downloadBlob(blob, `watchlist_monitor_${completedOnly ? 'completed_' : ''}${new Date().toISOString().slice(0, 10)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  function downloadWatchlistMarkdown(completedOnly = false) {
    downloadBlob(
      watchlistMarkdown(completedOnly),
      `watchlist_monitor_${completedOnly ? 'completed_' : ''}${new Date().toISOString().slice(0, 10)}.md`,
      'text/markdown;charset=utf-8'
    );
  }

  function run(card: (typeof workflowCards)[number]) {
    const peerIssuers = lines(peerText);
    const query = card.id === 'peer'
      ? peerIssuers.join(' vs ')
      : selectedIssuer || watchlist[0] || 'LADWP';
    const watchlistContext = watchlist.length ? `Watchlist: ${watchlist.join(' | ')}.` : '';
    const peerContext = peerIssuers.length ? `Peer set: ${peerIssuers.join(' | ')}.` : '';
    const angle = [
      card.angle,
      card.id === 'watchlist' ? watchlistContext : null,
      card.id === 'peer' ? peerContext : null,
      card.id === 'time-series' ? `Requested years: ${yearRange}.` : null,
      customNotes ? `Analyst notes: ${customNotes}` : null,
    ].filter(Boolean).join(' ');

    onRunWorkflow({
      query,
      promptMode: card.promptMode,
      customAngle: angle,
      outputType: card.outputType,
      source: card.source,
      sort: 'freshness',
    });
  }

  return (
    <section className="full-page-panel workflow-center-page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Workflow Center</p>
          <h2>Monitoring and analysis workflows</h2>
          <p className="muted small">Run repeatable public-finance workflows from a saved issuer list, peer set, or covenant target.</p>
        </div>
        <span className="count">{watchlist.length}</span>
      </div>

      <div className="workflow-center-grid">
        <section className="workflow-config-panel">
          <div className="section-heading">
            <div>
              <h3>Issuer inputs</h3>
              <p className="muted small">Saved here locally until a database is added.</p>
            </div>
            <button className="button-secondary" onClick={saveWatchlist}>Save Watchlist</button>
          </div>

          <label>
            Watchlist issuers
            <textarea
              value={watchlistText}
              onChange={(event) => setWatchlistText(event.target.value)}
              rows={8}
              placeholder="One issuer per line"
            />
          </label>

          <label>
            Monitoring frequency
            <select value={monitorFrequency} onChange={(event) => setMonitorFrequency(event.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="manual">Manual only</option>
            </select>
          </label>

          <div className="source-list-section compact-note">
            <div className="section-heading">
              <div>
                <h3>Monitoring conditions</h3>
                <p className="muted small">These conditions are passed into each issuer scan.</p>
              </div>
            </div>
            <div className="condition-grid">
              {monitoringConditions.map((condition) => (
                <label key={condition.id} className="condition-option">
                  <input
                    type="checkbox"
                    checked={selectedConditions.includes(condition.id)}
                    onChange={(event) => setCondition(condition.id, event.target.checked)}
                  />
                  <span>{condition.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="report-toolbar">
            <button className="button-primary" onClick={() => void runWatchlistQueue()} disabled={isRunningWatchlist}>
              {isRunningWatchlist ? 'Running Watchlist...' : 'Run Watchlist Queue'}
            </button>
            <button className="button-secondary" onClick={retryManualVerification} disabled={isRunningWatchlist || watchlistRun.length === 0}>
              Retry Manual Queue
            </button>
          </div>

          <label>
            Selected issuer
            <select value={selectedIssuer} onChange={(event) => setSelectedIssuer(event.target.value)}>
              {watchlist.map((issuer) => (
                <option key={issuer} value={issuer}>{issuer}</option>
              ))}
            </select>
          </label>

          <label>
            Peer set
            <textarea
              value={peerText}
              onChange={(event) => setPeerText(event.target.value)}
              rows={5}
              placeholder="One peer issuer per line"
            />
          </label>

          <label>
            Time series years
            <input value={yearRange} onChange={(event) => setYearRange(event.target.value)} />
          </label>

          <label>
            Analyst notes
            <textarea
              value={customNotes}
              onChange={(event) => setCustomNotes(event.target.value)}
              rows={4}
              placeholder="Optional: sector, pledge, known CUSIP, bond series, or review question."
            />
          </label>
        </section>

        <section className="workflow-run-panel">
          <section className="source-list-section watchlist-run-panel">
            <div className="section-heading">
              <div>
                <h3>Watchlist run queue</h3>
                <p className="muted small">Each issuer is scanned separately. No-update findings are retained as monitoring conclusions.</p>
              </div>
              <span className="status-pill">{runProgress.scanned}/{runProgress.total || watchlistRun.length || watchlist.length} scanned</span>
            </div>

            <div className="document-score-strip">
              <span className="status-pill ready">
                {watchlistRun.filter((item) => /development found/i.test(item.status)).length} developments
              </span>
              <span className="status-pill">
                {watchlistRun.filter((item) => /no recent change/i.test(item.status)).length} no-update
              </span>
              <span className="status-pill warning">
                {watchlistRun.filter((item) => /manual verification|insufficient|scanner error/i.test(`${item.status} ${item.reason} ${item.error ?? ''}`)).length} manual
              </span>
            </div>

            <div className="report-toolbar">
              <button className="button-secondary" onClick={() => downloadWatchlistMarkdown(false)} disabled={watchlistRun.length === 0}>Download MD</button>
              <button className="button-secondary" onClick={() => downloadWatchlistMarkdown(true)} disabled={watchlistRun.length === 0}>Download Completed MD</button>
              <button className="button-secondary" onClick={() => void downloadWatchlistDocx(false)} disabled={watchlistRun.length === 0}>Download DOCX</button>
              <button className="button-secondary" onClick={() => void downloadWatchlistDocx(true)} disabled={watchlistRun.length === 0}>Completed DOCX</button>
            </div>

            <div className="watchlist-result-list">
              {watchlistRun.length === 0 && (
                <div className="empty-workflow-state">Run the watchlist queue to populate issuer-by-issuer monitoring results.</div>
              )}
              {watchlistRun.map((item) => (
                <article key={item.issuer} className="watchlist-result-row">
                  <div>
                    <div className="record-meta">
                      <span>{item.status}</span>
                      <span>{item.recency}</span>
                      <span>{item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'Queued'}</span>
                    </div>
                    <h3>{item.issuer}</h3>
                    <p className="muted small">{item.reason}</p>
                    <p>{item.update}</p>
                    {item.source && <p className="muted small">Source: {item.source}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="workflow-card-grid">
            {workflowCards.map((card) => (
              <article key={card.id} className="workflow-card">
                <div>
                  <p className="eyebrow">{card.outputType}</p>
                  <h3>{card.title}</h3>
                  <p className="muted small">{card.angle}</p>
                </div>
                <div className="record-meta">
                  <span>{card.promptMode}</span>
                  <span>{card.source}</span>
                </div>
                <button className="button-primary" onClick={() => run(card)}>{card.label}</button>
              </article>
            ))}
          </div>

          <section className="source-list-section workflow-note-section">
            <div className="section-heading">
              <div>
                <h3>Saved workflow context</h3>
                <p className="muted small">{savedRecords.length} saved research records can feed future comparison and monitoring workflows.</p>
              </div>
            </div>
            <div className="mini-table">
              <div className="mini-table-row header">
                <span>Workflow</span>
                <span>Core files</span>
                <span>Primary output</span>
              </div>
              <div className="mini-table-row">
                <span>Watchlist</span>
                <span>EMMA filings, rating pages, board packets, RFPs</span>
                <span>Development status and retry queue</span>
              </div>
              <div className="mini-table-row">
                <span>Peer Comparison</span>
                <span>ACFR, OS/POS, ratings, market context</span>
                <span>Side-by-side metric table</span>
              </div>
              <div className="mini-table-row">
                <span>Time Series</span>
                <span>Multi-year ACFR / budget / disclosure records</span>
                <span>Metric trend table</span>
              </div>
              <div className="mini-table-row">
                <span>Covenant Tracking</span>
                <span>OS/POS plus latest ACFR / continuing disclosure</span>
                <span>Compliance status and manual checks</span>
              </div>
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}
