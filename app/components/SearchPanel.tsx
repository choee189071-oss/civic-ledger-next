"use client";

import { useState } from 'react';

type Result = {
  id: string;
  title: string;
  topic: string;
  source: string;
  score?: number;
  summary: string;
  facts?: string[];
  citations?: string[];
};

type Props = {
  query: string;
  topic: string;
  source: string;
  sort: string;
  promptMode: string;
  customAngle: string;
  reportTemplate: string;
  workflowOptions: Record<string, boolean>;
  items: Result[];
  selectedId: string | null;
  tab: string;
  onQuery: (v: string) => void;
  onPromptMode: (v: string) => void;
  onCustomAngle: (v: string) => void;
  onReportTemplate: (v: string) => void;
  onWorkflowOption: (key: string, value: boolean) => void;
  onTopic: (v: string) => void;
  onSource: (v: string) => void;
  onSort: (v: string) => void;
  onSearch: () => void;
  onSelect: (id: string) => void;
  onTab: (v: string) => void;
  isResearching: boolean;
  researchError: string | null;
};

const promptModes = [
  ['general-overview', 'General Overview'],
  ['issuer-credit-profile', 'Issuer / Credit Profile'],
  ['document-discovery', 'Document Discovery'],
  ['debt-bond-research', 'Debt / Bond Research'],
  ['financial-performance', 'Financial Performance'],
  ['risk-news-monitoring', 'Risk / News Monitoring'],
  ['peer-comparison', 'Peer Comparison'],
  ['custom-prompt', 'Custom Prompt'],
];

const outputTypes = [
  ['research-brief', 'Research Brief'],
  ['credit-memo', 'Credit Memo'],
  ['investment-committee-memo', 'Investment Committee Memo'],
  ['rating-committee-memo', 'Rating Committee Memo'],
  ['document-inventory-report', 'Document Inventory Report'],
  ['due-diligence-report', 'Due Diligence Report'],
  ['board-briefing', 'Board Briefing'],
  ['executive-summary', 'Executive Summary'],
  ['risk-monitor', 'Risk Monitor'],
  ['source-appendix', 'Source Appendix'],
  ['custom-report', 'Custom Report'],
];

const workflowOptionLabels = [
  ['includeLiveSearch', 'Include live web search'],
  ['includePerplexity', 'Include Perplexity search'],
  ['includeOpenaiSynthesis', 'Include OpenAI synthesis'],
  ['includeDocumentInventory', 'Include document inventory'],
  ['includeSourceTiers', 'Include source tier ranking'],
  ['includeCoverageDashboard', 'Include coverage dashboard'],
  ['includeMissingData', 'Include missing-data section'],
  ['includeExport', 'Include export file'],
];

export function SearchPanel(props: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const citations = [
    ...new Set(
      props.items.flatMap((item) =>
        (item.citations ?? []).map((c) => `${c} · ${item.source}`)
      )
    )
  ];

  return (
    <section className="workspace-panel query-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Ask</p>
          <h2>Research intake</h2>
        </div>
        <span className="count">{props.items.length}</span>
      </div>

      <div className="searchbox">
        <label className="field-label" htmlFor="issuer-search">Issuer / Entity</label>
        <input
          id="issuer-search"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && props.onSearch()}
          placeholder="Example: LADWP, SMUD, TWDB, West Sacramento"
        />
        <button
          className="icon-button primary"
          onClick={props.onSearch}
          aria-label="Run research search"
          disabled={props.isResearching}
        >
          {props.isResearching ? '…' : '⌕'}
        </button>
      </div>
      <p className="muted small">
        Recency policy: prefer developments from the last 3 months; expand to 6 months only when no fresh issuer-specific evidence is found.
      </p>

      {props.researchError && (
        <div className="error-banner">{props.researchError}</div>
      )}

      <div className="prompt-builder">
        <label>
          Research Mode
          <select value={props.promptMode} onChange={(e) => props.onPromptMode(e.target.value)}>
            {promptModes.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>

        {props.promptMode === 'custom-prompt' && (
          <label>
            Custom Research Angle
            <textarea
              value={props.customAngle}
              onChange={(e) => props.onCustomAngle(e.target.value)}
              placeholder={"Analyze LADWP as a municipal utility credit.\nFind LADWP's latest ACFR, official statements, and rating reports.\nEvaluate LADWP's power system revenue bond credit profile."}
              rows={4}
            />
          </label>
        )}

        <label>
          Output Type
          <select value={props.reportTemplate} onChange={(e) => props.onReportTemplate(e.target.value)}>
            {outputTypes.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>

        <button
          className="advanced-toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
          type="button"
        >
          <span>Advanced settings</span>
          <strong>{advancedOpen ? 'Hide' : 'Show'}</strong>
        </button>

        {advancedOpen && (
          <div className="advanced-panel">
            <div className="scope-toggle-grid" aria-label="System scope">
              {workflowOptionLabels.map(([key, label]) => (
                <label key={key} className="scope-toggle">
                  <input
                    type="checkbox"
                    checked={props.workflowOptions[key] ?? true}
                    onChange={(e) => props.onWorkflowOption(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="filters">
              <label>
                Topic
                <select value={props.topic} onChange={(e) => props.onTopic(e.target.value)}>
                <option value="all">All topics</option>
                <option value="Budget">Budget</option>
                <option value="Expenditures">Expenditures</option>
                <option value="Disclosure">Disclosure</option>
                <option value="Bonds">Bonds</option>
                </select>
              </label>
              <label>
                Source
                <select value={props.source} onChange={(e) => props.onSource(e.target.value)}>
                <option value="all">All sources</option>
                <option value="EMMA / MSRB">EMMA / MSRB</option>
                <option value="USAspending">USAspending</option>
                <option value="DebtWatch">DebtWatch</option>
                <option value="SCO ByTheNumbers">SCO ByTheNumbers</option>
                <option value="Open FI$Cal">Open FI$Cal</option>
                <option value="California Budget">California Budget</option>
                <option value="CDIAC">CDIAC</option>
                <option value="CKAN / Data.gov">CKAN / Data.gov</option>
                <option value="Debt Line">Debt Line</option>
                </select>
              </label>
              <label>
                Sort
                <select value={props.sort} onChange={(e) => props.onSort(e.target.value)}>
                <option value="score">Sort by relevance</option>
                <option value="freshness">Sort by freshness</option>
                <option value="title">Sort by title</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="segmented-control">
        {[
          ['results', 'Results'],
          ['summary', 'Brief'],
          ['citations', 'Citations']
        ].map(([id, label]) => (
          <button
            key={id}
            className={props.tab === id ? 'active' : ''}
            onClick={() => props.onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {props.tab === 'results' && (
        <div className="result-list">
          {props.items.length === 0 && (
            <p className="muted">No results match the current query.</p>
          )}
          {props.items.map((item) => (
            <article
              key={item.id}
              className={`result ${props.selectedId === item.id ? 'active' : ''}`}
              onClick={() => props.onSelect(item.id)}
            >
              <div className="result-topline">
                <div>
                  <div className="meta">
                    <span>{item.topic}</span>
                    <span>{item.source}</span>
                  </div>
                  <h3>{item.title}</h3>
                </div>
                <span className="badge">{item.score ?? 'Live'}</span>
              </div>
              <p className="muted">{item.summary}</p>
            </article>
          ))}
        </div>
      )}

      {props.tab === 'summary' && props.items[0] && (
        <div className="stack">
          <div className="brief-box">
            <span className="status-pill ready">Top match</span>
            <h3>{props.items[0].title}</h3>
            <p className="muted">{props.items[0].summary}</p>
          </div>
          {(props.items[0].facts ?? []).map((f) => <div key={f} className="fact-line">{f}</div>)}
        </div>
      )}

      {props.tab === 'citations' && (
        <div className="stack">
          {citations.map((c) => (
            <div key={c}><span className="citation">{c}</span></div>
          ))}
        </div>
      )}
    </section>
  );
}
