"use client";

import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SearchPanel } from './components/SearchPanel';
import { DetailPanel } from './components/DetailPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { ReadingPanel } from './components/ReadingPanel';

const defaultWorkflowOptions = {
  includeLiveSearch: true,
  includePerplexity: true,
  includeOpenaiSynthesis: true,
  includeDocumentInventory: true,
  includeSourceTiers: true,
  includeCoverageDashboard: true,
  includeMissingData: true,
  includeExport: true,
};

function normalizeRecord(item: any) {
  return {
    ...item,
    score: item.score ?? 82,
    summary: item.summary ?? item.snippet ?? item.title,
    snippet: item.snippet ?? item.summary ?? '',
    facts: item.facts ?? [
      item.program && `Program: ${item.program}`,
      item.fund && `Fund: ${item.fund}`,
      item.accountCategory && `Account category: ${item.accountCategory}`,
      typeof item.amount === 'number' && `Amount: $${item.amount.toLocaleString()}`,
      item.fiscalYear && `Fiscal year: ${item.fiscalYear}`,
    ].filter(Boolean),
    citations: item.citations ?? [
      item.source === 'Open FI$Cal' ? 'https://open.fiscal.ca.gov' : item.source,
    ].filter(Boolean),
  };
}

export default function HomePage() {
  const [view, setView] = useState('search');
  const [query, setQuery] = useState('LADWP');
  const [promptMode, setPromptMode] = useState('issuer-credit-profile');
  const [customAngle, setCustomAngle] = useState('');
  const [topic, setTopic] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('score');
  const [tab, setTab] = useState('results');
  const [reportTemplate, setReportTemplate] = useState('credit-memo');
  const [workflowOptions, setWorkflowOptions] = useState<Record<string, boolean>>(defaultWorkflowOptions);
  const [results, setResults] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [generatedReport, setGeneratedReport] = useState<any | null>(null);
  const [reading, setReading] = useState<any | null>(null);
  const [savedRecords, setSavedRecords] = useState<any[]>([]);
  const [isResearching, setIsResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  async function loadSearch(
    nextQuery = query,
    nextTopic = topic,
    nextSource = source,
    nextSort = sort
  ) {
    const params = new URLSearchParams({
      q: nextQuery,
      topic: nextTopic,
      source: nextSource,
      sort: nextSort
    });
    const res = await fetch(`/api/search?${params.toString()}`);
    const payload = await res.json();
    const items = (payload.items ?? []).map(normalizeRecord);
    setResults(items);
    const first = items[0];
    if (first) {
      setSelectedId(first.id);
      setDetail(first);
      setGeneratedReport(first.generatedReport ?? null);
    } else {
      setSelectedId(null);
      setDetail(null);
      setGeneratedReport(null);
    }
  }

  async function loadSources() {
    const res = await fetch('/api/sources');
    const payload = await res.json();
    setSources(payload.items);
  }

  async function loadDetail(id: string) {
    const existing = results.find((item) => item.id === id);
    if (existing) {
      setDetail(normalizeRecord(existing));
      setGeneratedReport(existing.generatedReport ?? null);
      return;
    }

    const res = await fetch(`/api/result/${id}`);
    if (!res.ok) return;
    const payload = await res.json();
    setDetail(normalizeRecord(payload));
    setGeneratedReport(payload.generatedReport ?? null);
  }

  async function loadReading(id: string) {
    const res = await fetch(`/api/reading/${id}`);
    const payload = await res.json();
    setReading(payload);
    setView('reading');
  }

  async function runResearch() {
    setIsResearching(true);
    setResearchError(null);

    try {
      const [researchRes, searchRes] = await Promise.all([
        fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            topic,
            source,
            promptMode,
            customAngle,
            outputType: reportTemplate,
            workflowOptions,
          }),
        }),
        fetch(`/api/search?${new URLSearchParams({ q: query, topic, source, sort }).toString()}`),
      ]);

      const searchPayload = await searchRes.json().catch(() => ({ items: [] }));
      const searchItems = (searchPayload.items ?? []).map(normalizeRecord);

      if (!researchRes.ok) {
        const errorPayload = await researchRes.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Live research failed.');
      }

      const researchPayload = await researchRes.json();
      const researchRecord = normalizeRecord(researchPayload.record);
      setGeneratedReport(null);
      const nextResults = [
        researchRecord,
        ...searchItems.filter((item: any) => item.id !== researchRecord.id),
      ].slice(0, 12);

      setResults(nextResults);
      setSelectedId(researchRecord.id);
      setDetail(researchRecord);
      setTab('results');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Live research failed.';
      setResearchError(message);
      await loadSearch();
    } finally {
      setIsResearching(false);
    }
  }

  async function generateReport() {
    if (!detail) return;

    setIsGeneratingReport(true);
    setReportError(null);

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: detail, template: reportTemplate, workflowOptions }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || 'Report generation failed.');
      }

      const report = payload.report;
      setGeneratedReport(report);
      setDetail((current: any) => current ? { ...current, generatedReport: report } : current);
      setResults((items) =>
        items.map((item) => item.id === detail.id ? { ...item, generatedReport: report } : item)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report generation failed.';
      setReportError(message);
    } finally {
      setIsGeneratingReport(false);
    }
  }

  function updateWorkflowOption(key: string, value: boolean) {
    setWorkflowOptions((options) => ({ ...options, [key]: value }));
  }

  function updateReportTemplate(value: string) {
    setReportTemplate(value);
    setGeneratedReport(null);
    setReportError(null);
  }

  function openCurrentReading() {
    if (!detail) return;

    if (generatedReport) {
      setReading({
        id: generatedReport.id,
        title: generatedReport.title,
        body: [generatedReport.content],
      });
      setView('reading');
      return;
    }

    if (detail.kind === 'research') {
      setReading({
        id: detail.id,
        title: `Reading: ${detail.title}`,
        body: [
          detail.summary,
          detail.snippet,
          ...(detail.facts ?? []),
        ].filter(Boolean),
      });
      setView('reading');
      return;
    }

    if (selectedId) {
      loadReading(selectedId);
    }
  }

  function saveRecord() {
    if (!detail) return;

    fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: detail, report: generatedReport }),
    }).catch((error) => {
      console.warn('[library] remote save failed, kept local copy:', error);
    });

    setSavedRecords((records) => {
      const nextRecord = {
        ...detail,
        generatedReport,
        savedAt: new Date().toISOString()
      };
      const next = [
        nextRecord,
        ...records.filter((record) => record.id !== detail.id)
      ].slice(0, 8);

      window.localStorage.setItem('civic-ledger-saved-records', JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    const stored = window.localStorage.getItem('civic-ledger-saved-records');
    if (stored) {
      setSavedRecords(JSON.parse(stored));
    }
    loadSources();
    loadSearch();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar current={view} onChange={setView} savedRecords={savedRecords} />
      <main className="main">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Research Workspace</p>
            <h1>California public finance desk</h1>
          </div>
          <div className="status-strip">
            <span className="status-pill ready">Build ready</span>
            <span className="status-pill">Perplexity ready</span>
            <span className="status-pill">OpenAI writer</span>
            <span className="status-pill">{savedRecords.length} saved</span>
          </div>
        </header>

        {view === 'search' && (
          <section className="workspace-grid">
            <SearchPanel
              query={query}
              topic={topic}
              source={source}
              sort={sort}
              promptMode={promptMode}
              customAngle={customAngle}
              reportTemplate={reportTemplate}
              workflowOptions={workflowOptions}
              items={results}
              selectedId={selectedId}
              tab={tab}
              onQuery={setQuery}
              onPromptMode={setPromptMode}
              onCustomAngle={setCustomAngle}
              onReportTemplate={updateReportTemplate}
              onWorkflowOption={updateWorkflowOption}
              onTopic={(v) => { setTopic(v); loadSearch(query, v, source, sort); }}
              onSource={(v) => { setSource(v); loadSearch(query, topic, v, sort); }}
              onSort={(v) => { setSort(v); loadSearch(query, topic, source, v); }}
              onSearch={runResearch}
              onSelect={(id) => { setSelectedId(id); loadDetail(id); }}
              onTab={setTab}
              isResearching={isResearching}
              researchError={researchError}
            />
            <DetailPanel
              detail={detail}
              reportTemplate={reportTemplate}
              generatedReport={generatedReport}
              isGeneratingReport={isGeneratingReport}
              reportError={reportError}
              onGenerateReport={generateReport}
              onOpenReading={openCurrentReading}
              onSave={saveRecord}
              isSaved={Boolean(detail && savedRecords.some((record) => record.id === detail.id))}
            />
          </section>
        )}

        {view === 'reading' && <ReadingPanel item={reading} />}
        {view === 'sources' && <SourcesPanel items={sources} detail={detail} savedRecords={savedRecords} />}
      </main>
    </div>
  );
}
