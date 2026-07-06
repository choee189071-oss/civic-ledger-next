"use client";

import { useState, type MouseEvent } from 'react';
import { parseUniversalSearchQuery } from '../../lib/universal-search';

type Result = {
  id: string;
  kind?: string;
  title: string;
  topic: string;
  source: string;
  score?: number;
  summary: string;
  snippet?: string;
  facts?: string[];
  citations?: string[];
  fiscalYear?: string;
  generatedAt?: string;
  savedAt?: string;
  documentInventory?: Array<Record<string, any>>;
  coverageDashboard?: Array<Record<string, any>>;
  searchResults?: Array<Record<string, any>>;
  evidencePackage?: Record<string, any>;
  workflowInput?: Record<string, any>;
  universalSearch?: Record<string, any>;
};

type Props = {
  experienceMode?: 'reader' | 'supervisor';
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
  onSearch: (overrides?: {
    query?: string;
    promptMode?: string;
    customAngle?: string;
    outputType?: string;
    topic?: string;
    source?: string;
    sort?: string;
  }) => void;
  onSelect: (id: string) => void;
  onTab: (v: string) => void;
  isResearching: boolean;
  researchError: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

const researchTypes = [
  {
    id: 'general-brief',
    label: 'General Overview / Research Brief',
    promptMode: 'general-overview',
    reportTemplate: 'research-brief',
    customAngle: '',
  },
  {
    id: 'credit-memo',
    label: 'Issuer Credit Profile / Credit Memo',
    promptMode: 'issuer-credit-profile',
    reportTemplate: 'credit-memo',
    customAngle: '',
  },
  {
    id: 'ic-memo',
    label: 'Issuer Credit Profile / IC Memo',
    promptMode: 'issuer-credit-profile',
    reportTemplate: 'investment-committee-memo',
    customAngle: 'Focus on relative value, peer context, source gaps, and next diligence checks.',
  },
  {
    id: 'rating-committee',
    label: 'Issuer Credit Profile / Rating Committee Memo',
    promptMode: 'issuer-credit-profile',
    reportTemplate: 'rating-committee-memo',
    customAngle: '',
  },
  {
    id: 'document-inventory',
    label: 'Document Discovery / Inventory Report',
    promptMode: 'document-discovery',
    reportTemplate: 'document-inventory-report',
    customAngle: '',
  },
  {
    id: 'due-diligence',
    label: 'Document Discovery / Due Diligence Report',
    promptMode: 'document-discovery',
    reportTemplate: 'due-diligence-report',
    customAngle: '',
  },
  {
    id: 'source-appendix',
    label: 'Document Discovery / Source Appendix',
    promptMode: 'document-discovery',
    reportTemplate: 'source-appendix',
    customAngle: '',
  },
  {
    id: 'debt-research',
    label: 'Debt Research / Credit Memo',
    promptMode: 'debt-bond-research',
    reportTemplate: 'credit-memo',
    customAngle: '',
  },
  {
    id: 'financial-trends',
    label: 'Financial Performance / Time Series',
    promptMode: 'financial-performance',
    reportTemplate: 'time-series-analysis',
    customAngle: '',
  },
  {
    id: 'risk-monitor',
    label: 'Risk Monitoring / Risk Monitor',
    promptMode: 'risk-news-monitoring',
    reportTemplate: 'risk-monitor',
    customAngle: '',
  },
  {
    id: 'peer-comparison',
    label: 'Peer Comparison / Comparison Table',
    promptMode: 'peer-comparison',
    reportTemplate: 'peer-comparison-table',
    customAngle: '',
  },
  {
    id: 'covenant-tracking',
    label: 'Covenant Tracking / Covenant Report',
    promptMode: 'covenant-tracking',
    reportTemplate: 'covenant-tracking',
    customAngle: '',
  },
  {
    id: 'custom-report',
    label: 'Custom Prompt / Custom Report',
    promptMode: 'custom-prompt',
    reportTemplate: 'custom-report',
    customAngle: '',
  },
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

const quickStarts = [
  {
    label: 'Professional Credit Memo',
    description: 'Issuer profile, debt, ratings, covenants',
    promptMode: 'issuer-credit-profile',
    reportTemplate: 'credit-memo',
    customAngle: '',
  },
  {
    label: 'Risk Monitor',
    description: 'Recent developments and watch items',
    promptMode: 'risk-news-monitoring',
    reportTemplate: 'risk-monitor',
    customAngle: '',
  },
  {
    label: 'Document Hunt',
    description: 'ACFR, OS, EMMA, ratings, board packets',
    promptMode: 'document-discovery',
    reportTemplate: 'document-inventory-report',
    customAngle: '',
  },
  {
    label: 'IC Memo',
    description: 'Investment committee-ready structure',
    promptMode: 'issuer-credit-profile',
    reportTemplate: 'investment-committee-memo',
    customAngle: 'Focus on relative value, peer context, source gaps, and next diligence checks.',
  },
];

const searchExamples = [
  'LADWP',
  'Los Angeles Department of Water',
  'California Water',
  'Power Revenue Bond',
  'School District',
  'AA Utility',
  'Issuer exposed to wildfire',
];

function displayValue(value: any, fallback = 'Not found') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  if (!text || /^null$|^undefined$|^n\/a$/i.test(text)) return fallback;
  return text;
}

function factValue(facts: string[] | undefined, pattern: RegExp) {
  const match = facts?.find((fact) => pattern.test(fact));
  if (!match) return '';
  return match.replace(/^[^:]+:\s*/, '').trim();
}

function maxFiscalYear(text: string) {
  const years = [...text.matchAll(/\b(?:FY\s*)?(20\d{2})\b/gi)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2020 && year <= new Date().getFullYear() + 1);

  return years.length > 0 ? `FY ${Math.max(...years)}` : '';
}

function formatCardDate(value: any) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toLocaleDateString();
}

function sourceDate(source: Record<string, any>) {
  return displayValue(
    source.publicationDate ||
    source.publication_date ||
    source.date ||
    source.last_updated ||
    source.emmaFilingDate ||
    source.emma_filing_date,
    ''
  );
}

function researchTypeIdFor(promptMode: string, reportTemplate: string) {
  const exact = researchTypes.find((item) =>
    item.promptMode === promptMode && item.reportTemplate === reportTemplate
  );
  if (exact) return exact.id;
  if (promptMode === 'custom-prompt') return 'custom-report';
  return (
    researchTypes.find((item) => item.promptMode === promptMode)?.id ||
    researchTypes.find((item) => item.reportTemplate === reportTemplate)?.id ||
    researchTypes[0].id
  );
}

function sourceTitle(source: Record<string, any>) {
  return displayValue(source.title || source.document || source.document_title || source.url, 'Source candidate');
}

function sourceType(source: Record<string, any>) {
  return displayValue(source.documentType || source.document_type || source.type || source.source, '');
}

function normalizeCoverageRows(item: Result) {
  const coverage = item.evidencePackage?.coverage_dashboard ?? item.coverageDashboard ?? [];

  if (Array.isArray(coverage)) {
    return coverage;
  }

  if (coverage && typeof coverage === 'object') {
    return Object.entries(coverage).map(([key, value]: [string, any]) => ({
      area: key.replace(/_/g, ' '),
      status: value?.status,
      confidence: value?.confidence,
    }));
  }

  return [];
}

function isCoverageFound(row: Record<string, any>) {
  return /found|available|complete|verified|used/i.test(`${row.status ?? ''} ${row.confidence ?? ''}`);
}

function coveragePercent(item: Result) {
  const rows = normalizeCoverageRows(item);
  if (rows.length === 0) return '0%';
  const found = rows.filter(isCoverageFound).length;
  return `${Math.round((found / rows.length) * 100)}%`;
}

function allDocumentSources(item: Result) {
  const packageInventory = Array.isArray(item.evidencePackage?.document_inventory)
    ? item.evidencePackage?.document_inventory
    : [];

  return [
    ...packageInventory,
    ...(item.documentInventory ?? []),
    ...(item.searchResults ?? []),
  ].filter(Boolean);
}

function latestDocument(item: Result, pattern?: RegExp) {
  const sources = allDocumentSources(item)
    .filter((source) => !pattern || pattern.test(`${sourceTitle(source)} ${sourceType(source)} ${source.url ?? ''}`))
    .map((source) => ({
      source,
      time: Date.parse(sourceDate(source)),
    }))
    .sort((a, b) => (Number.isNaN(b.time) ? 0 : b.time) - (Number.isNaN(a.time) ? 0 : a.time));

  return sources[0]?.source;
}

function firstRegexValue(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() ?? '';
}

function issuerSnapshotFor(item: Result) {
  const factsText = (item.facts ?? []).join(' ');
  const bodyText = [item.summary, item.snippet, factsText, item.title].join(' ');
  const universalIssuer = item.universalSearch?.primaryIssuer?.canonicalName;
  const universalRating = item.universalSearch?.facets?.find((facet: any) => facet.type === 'rating')?.value;
  const latestFiling = latestDocument(item, /filing|disclosure|official statement|rating|acfr|audit|emma|msrb/i) ?? latestDocument(item);
  const latestRating = latestDocument(item, /rating|moody|s&p|fitch|kbra|kroll|outlook|upgrade|downgrade/i);
  const ratingFromText = firstRegexValue(bodyText, /\b(Aaa|Aa[1-3]?|AAA|AA[+-]?|A[+-]|Baa[1-3]?|BBB[+-]?)\b/i);
  const debtFromText = firstRegexValue(bodyText, /(?:outstanding debt|debt outstanding|total debt)[^$]{0,60}(\$[0-9,.]+\s*(?:million|billion|m|bn)?)/i);
  const latestFinancialYear = item.fiscalYear || factValue(item.facts, /fiscal year/i) || maxFiscalYear(bodyText);
  const filingDate = sourceDate(latestFiling ?? {});
  const lastUpdated = item.generatedAt || item.savedAt || item.evidencePackage?.search_timestamp || filingDate;

  return {
    issuer: displayValue(item.workflowInput?.issuer || item.evidencePackage?.issuer || universalIssuer || item.title),
    ratings: displayValue(factValue(item.facts, /^ratings?/i) || universalRating || ratingFromText),
    outstandingDebt: displayValue(factValue(item.facts, /outstanding debt|total debt/i) || debtFromText),
    latestFiling: latestFiling ? displayValue(filingDate || sourceTitle(latestFiling)) : 'Not found',
    latestFilingTitle: latestFiling ? sourceTitle(latestFiling) : '',
    latestFinancialYear: displayValue(latestFinancialYear),
    coverage: coveragePercent(item),
    recentRatingAction: displayValue(
      factValue(item.facts, /recent rating action|rating action|outlook|upgrade|downgrade/i) ||
      (latestRating ? sourceTitle(latestRating) : '')
    ),
    lastUpdated: displayValue(formatCardDate(lastUpdated)),
  };
}

export function SearchPanel(props: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isReaderMode = props.experienceMode !== 'supervisor';
  const universalSearch = parseUniversalSearchQuery(props.query);
  const visibleFacets = universalSearch.facets.slice(0, 8);
  const selectedResearchTypeId = researchTypeIdFor(props.promptMode, props.reportTemplate);
  const citations = [
    ...new Set(
      props.items.flatMap((item) =>
        (item.citations ?? []).map((c) => `${c} · ${item.source}`)
      )
    )
  ];

  function applyResearchType(id: string) {
    const next = researchTypes.find((item) => item.id === id);
    if (!next) return;

    props.onPromptMode(next.promptMode);
    props.onReportTemplate(next.reportTemplate);
    props.onCustomAngle(next.customAngle);
  }

  if (props.collapsed) {
    return (
      <section className="workspace-panel query-panel query-panel-collapsed" aria-label="Research intake collapsed">
        <button
          className="intake-resize-button"
          type="button"
          aria-label="Expand research intake"
          title="Expand research intake"
          onClick={props.onToggleCollapse}
        >
          ⇥
        </button>
        <div className="collapsed-intake-summary">
          <span className="eyebrow">Ask</span>
          <strong>{props.query || 'Search'}</strong>
          <em>{props.items.length} results</em>
        </div>
        <button
          className="icon-button primary collapsed-search-button"
          aria-label="Run research search"
          type="button"
          disabled={props.isResearching}
          onClick={() => props.onSearch()}
        >
          {props.isResearching ? '…' : '⌕'}
        </button>
      </section>
    );
  }

  return (
    <section className={`workspace-panel query-panel ${isReaderMode ? 'reader-query-panel' : ''}`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Ask</p>
          <h2>Research intake</h2>
        </div>
        <div className="panel-heading-actions">
          <button
            className="intake-resize-button"
            type="button"
            aria-label="Collapse research intake"
            title="Collapse research intake"
            onClick={props.onToggleCollapse}
          >
            ⇤
          </button>
          <span className="count">{props.items.length}</span>
        </div>
      </div>

      <div className="searchbox">
        <label className="field-label" htmlFor="issuer-search">Universal Search</label>
        <input
          id="issuer-search"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && props.onSearch()}
          placeholder="Issuer, alias, CUSIP, ticker, sector, bond type, state, or natural language"
        />
        <button
          className="icon-button primary"
          aria-label="Run research search"
          type="button"
          disabled={props.isResearching}
          onClick={() => props.onSearch()}
        >
          {props.isResearching ? '…' : '⌕'}
        </button>
      </div>
      {props.isResearching && (
        <div className="loading-card" role="status" aria-live="polite">
          <span className="loading-spinner" />
          <div>
            <strong>{isReaderMode ? 'Researching' : 'Building research package'}</strong>
            <p>{isReaderMode ? 'Gathering current public information and preparing a readable answer.' : 'Checking live sources, document coverage, evidence quality, and memo-ready findings.'}</p>
          </div>
        </div>
      )}
      <div className="shortcut-strip" aria-label="Keyboard shortcuts">
        <span><kbd>/</kbd> Search</span>
        <span><kbd>Ctrl</kbd><kbd>K</kbd> Quick Search</span>
        <span><kbd>⌘</kbd><kbd>Enter</kbd> Run Research</span>
      </div>

      {!isReaderMode && <details className="progressive-section compact-disclosure">
        <summary>
          <div>
            <span>Secondary</span>
            <strong>Search interpretation and quick starts</strong>
          </div>
          <em>Open to refine intent.</em>
        </summary>

      <div className="universal-search-panel">
        <div className="section-heading">
          <div>
            <h3>Understood query</h3>
            <p className="muted small">{universalSearch.summary}</p>
          </div>
          <span className="status-pill ready">{universalSearch.intentLabel}</span>
        </div>
        <div className="facet-chip-row">
          {visibleFacets.length === 0 && (
            <span className="facet-chip muted-chip">No facets detected yet</span>
          )}
          {visibleFacets.map((facet) => (
            <span key={`${facet.type}-${facet.value}`} className={`facet-chip ${facet.type}`}>
              <strong>{facet.label}</strong>
              {facet.value}
            </span>
          ))}
        </div>
        <div className="search-example-row" aria-label="Universal search examples">
          {searchExamples.map((example) => (
            <button key={example} type="button" onClick={() => props.onQuery(example)}>
              {example}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        Recency policy: separate quarterly updates, one-year monitoring backfill, and three-year structural context.
      </p>

      <div className="quick-start-grid" aria-label="Research quick starts">
        {quickStarts.map((item) => (
          <button
            key={item.label}
            className={props.promptMode === item.promptMode && props.reportTemplate === item.reportTemplate ? 'active' : ''}
            type="button"
            onClick={() => {
              props.onPromptMode(item.promptMode);
              props.onReportTemplate(item.reportTemplate);
              props.onCustomAngle(item.customAngle);
            }}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

      </details>
      }

      {props.researchError && (
        <div className="error-banner" role="alert">
          <strong>{isReaderMode ? 'Research could not complete.' : 'Research could not complete.'}</strong>
          <span>{props.researchError}</span>
          {!isReaderMode && <em>Try a broader issuer name, upload the source PDF, or check API keys before rerunning.</em>}
        </div>
      )}

      <div className="prompt-builder">
        <label>
          Research Type
          <select value={selectedResearchTypeId} onChange={(e) => applyResearchType(e.target.value)}>
            {researchTypes.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
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
            <div className="empty-card">
              <p className="eyebrow">No workspace yet</p>
              <h3>Search an issuer to begin a credit research run.</h3>
              <p className="muted">
                Try an issuer name, alias, CUSIP, sector, bond type, state, or natural-language risk question. The platform will build document coverage, retrieval diagnostics, evidence quality, and a memo-ready research package.
              </p>
              <div className="empty-action-row">
                <button type="button" onClick={() => props.onQuery('LADWP')}>Try LADWP</button>
                <button type="button" onClick={() => props.onQuery('California Water Revenue Bond')}>Try California Water</button>
              </div>
            </div>
          )}
          {props.items.map((item) => {
            const snapshot = issuerSnapshotFor(item);
            const runQuickAction = (
              event: MouseEvent<HTMLButtonElement>,
              overrides: Parameters<Props['onSearch']>[0]
            ) => {
              event.stopPropagation();
              if (overrides?.query) props.onQuery(overrides.query);
              if (overrides?.promptMode) props.onPromptMode(overrides.promptMode);
              if (overrides?.outputType) props.onReportTemplate(overrides.outputType);
              if (overrides?.customAngle !== undefined) props.onCustomAngle(overrides.customAngle);
              props.onSearch(overrides);
            };

            return (
              <article
                key={item.id}
                className={`result issuer-result-card ${props.selectedId === item.id ? 'active' : ''}`}
                onClick={() => props.onSelect(item.id)}
              >
                <div className="result-topline">
                  <div>
                    <div className="meta">
                      <span>{item.topic}</span>
                      <span>{item.source}</span>
                    </div>
                    <span className="issuer-field-label">Issuer</span>
                    <h3>{snapshot.issuer}</h3>
                  </div>
                  <span className="coverage-badge">{snapshot.coverage}</span>
                </div>

                <div className="issuer-snapshot-grid">
                  <div>
                    <span>Ratings</span>
                    <strong>{snapshot.ratings}</strong>
                  </div>
                  <div>
                    <span>Outstanding Debt</span>
                    <strong>{snapshot.outstandingDebt}</strong>
                  </div>
                  <div>
                    <span>Latest Filing</span>
                    <strong>{snapshot.latestFiling}</strong>
                    {snapshot.latestFilingTitle && <p>{snapshot.latestFilingTitle}</p>}
                  </div>
                  <div>
                    <span>Latest Financial Year</span>
                    <strong>{snapshot.latestFinancialYear}</strong>
                  </div>
                  <div>
                    <span>Recent Rating Action</span>
                    <strong>{snapshot.recentRatingAction}</strong>
                  </div>
                  <div>
                    <span>Last Updated</span>
                    <strong>{snapshot.lastUpdated}</strong>
                  </div>
                </div>

                <p className="muted">{item.summary}</p>

                <div className="result-quick-actions" aria-label={`Quick actions for ${snapshot.issuer}`}>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onSelect(item.id);
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={(event) => runQuickAction(event, {
                      query: snapshot.issuer,
                      promptMode: 'issuer-credit-profile',
                      outputType: 'credit-memo',
                      customAngle: '',
                    })}
                  >
                    Credit Memo
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={(event) => runQuickAction(event, {
                      query: snapshot.issuer,
                      promptMode: 'risk-news-monitoring',
                      outputType: 'risk-monitor',
                      customAngle: 'Focus on recent rating actions, board items, filings, bond authorizations, RFPs, and material risk developments.',
                    })}
                  >
                    Risk Monitor
                  </button>
                </div>
              </article>
            );
          })}
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
