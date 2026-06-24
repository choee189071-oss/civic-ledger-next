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

export function WorkflowCenterPanel({ savedRecords, issuerProfiles, onRunWorkflow }: Props) {
  const [watchlistText, setWatchlistText] = useState(defaultWatchlist.join('\n'));
  const [selectedIssuer, setSelectedIssuer] = useState(defaultWatchlist[0]);
  const [peerText, setPeerText] = useState('LADWP\nSMUD\nSacramento Municipal Utility District');
  const [yearRange, setYearRange] = useState('FY2022-FY2025');
  const [customNotes, setCustomNotes] = useState('');

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
  }, []);

  function saveWatchlist() {
    window.localStorage.setItem('civic-ledger-watchlist', watchlistText);
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
