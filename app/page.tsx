"use client";

import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SearchPanel } from './components/SearchPanel';
import { DetailPanel } from './components/DetailPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { ReadingPanel } from './components/ReadingPanel';
import { ResearchLibraryPanel } from './components/ResearchLibraryPanel';
import { IssuerDevelopmentsPanel } from './components/IssuerDevelopmentsPanel';
import { IssuerProfilesPanel } from './components/IssuerProfilesPanel';
import { WorkflowCenterPanel } from './components/WorkflowCenterPanel';
import { DocumentIntakePanel } from './components/DocumentIntakePanel';
import type { DocumentWorkflowPackage } from '../lib/public-finance-document-pipeline';
import type {
  GeneratedReport,
  IssuerProfile,
  ReadingAnnotation,
  ReadingDocument,
  ReportVersion,
  ResearchRecord,
  SourceCatalogItem,
  SourceStatusMap,
} from '../lib/types/public-finance';

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

function normalizeRecord(item: Partial<ResearchRecord> & Record<string, unknown>): ResearchRecord {
  return {
    ...item,
    score: item.score ?? 82,
    title: item.title ?? 'Untitled research record',
    topic: item.topic ?? 'Research',
    source: item.source ?? 'Civic Ledger',
    summary: item.summary ?? item.snippet ?? item.title ?? 'No summary available.',
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
  } as ResearchRecord;
}

function defaultRunStatus(record: Partial<ResearchRecord> | null | undefined) {
  if (record?.workflowStatus) return record.workflowStatus;
  if (record?.financeFocused && record?.coreFinanceDocumentsFound === false) return 'Needs Sources';
  return 'Draft';
}

function readingKey(item: Partial<ReadingDocument> | null | undefined) {
  return item?.recordId || item?.id || 'reading-room';
}

function replaceSection(content: string, sectionTitle: string, replacement: string) {
  const lines = (content || '').split('\n');
  const start = lines.findIndex((line) => {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    return heading?.[1]?.replace(/\*\*/g, '').trim().toLowerCase() === sectionTitle.toLowerCase();
  });

  if (start === -1) {
    return [content, replacement].filter(Boolean).join('\n\n');
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,3}\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return [
    ...lines.slice(0, start),
    replacement.trim(),
    ...lines.slice(end),
  ].join('\n').trim();
}

function profileKey(value: string) {
  return value.trim().toLowerCase();
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
  const [results, setResults] = useState<ResearchRecord[]>([]);
  const [sources, setSources] = useState<SourceCatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResearchRecord | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [reading, setReading] = useState<ReadingDocument | null>(null);
  const [savedRecords, setSavedRecords] = useState<ResearchRecord[]>([]);
  const [runStatuses, setRunStatuses] = useState<Record<string, string>>({});
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatusMap>({});
  const [issuerProfiles, setIssuerProfiles] = useState<Record<string, IssuerProfile>>({});
  const [reportVersions, setReportVersions] = useState<Record<string, ReportVersion[]>>({});
  const [readingAnnotations, setReadingAnnotations] = useState<Record<string, ReadingAnnotation[]>>({});
  const [storageReady, setStorageReady] = useState(false);
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

  async function runResearch(overrides?: {
    query?: string;
    promptMode?: string;
    customAngle?: string;
    outputType?: string;
    topic?: string;
    source?: string;
    sort?: string;
  }) {
    const runQuery = overrides?.query ?? query;
    const runPromptMode = overrides?.promptMode ?? promptMode;
    const runCustomAngle = overrides?.customAngle ?? customAngle;
    const runOutputType = overrides?.outputType ?? reportTemplate;
    const runTopic = overrides?.topic ?? topic;
    const runSource = overrides?.source ?? source;
    const runSort = overrides?.sort ?? sort;

    setIsResearching(true);
    setResearchError(null);

    try {
      const [researchRes, searchRes] = await Promise.all([
        fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: runQuery,
            topic: runTopic,
            source: runSource,
            promptMode: runPromptMode,
            customAngle: runCustomAngle,
            outputType: runOutputType,
            workflowOptions,
          }),
        }),
        fetch(`/api/search?${new URLSearchParams({ q: runQuery, topic: runTopic, source: runSource, sort: runSort }).toString()}`),
      ]);

      const searchPayload = await searchRes.json().catch(() => ({ items: [] }));
      const searchItems = (searchPayload.items ?? []).map(normalizeRecord);

      if (!researchRes.ok) {
        const errorPayload = await researchRes.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Live research failed.');
      }

      const researchPayload = await researchRes.json();
      const researchRecord = {
        ...normalizeRecord(researchPayload.record),
        workflowStatus: defaultRunStatus(researchPayload.record),
      };
      setGeneratedReport(null);
      const nextResults: ResearchRecord[] = [
        researchRecord,
        ...searchItems.filter((item: ResearchRecord) => item.id !== researchRecord.id),
      ].slice(0, 12);

      setResults(nextResults);
      setSelectedId(researchRecord.id);
      setDetail(researchRecord);
      setRunStatuses((statuses) => ({ ...statuses, [researchRecord.id]: researchRecord.workflowStatus }));
      setTab('results');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Live research failed.';
      setResearchError(message);
      await loadSearch(runQuery, runTopic, runSource, runSort);
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
      setRunStatuses((statuses) => ({ ...statuses, [detail.id]: 'Ready for Review' }));
      setDetail((current) => current ? { ...current, generatedReport: report, workflowStatus: 'Ready for Review' } : current);
      setResults((items) =>
        items.map((item) => item.id === detail.id ? { ...item, generatedReport: report, workflowStatus: 'Ready for Review' } : item)
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

  function updateRunStatus(status: string) {
    if (!detail) return;

    setRunStatuses((statuses) => ({ ...statuses, [detail.id]: status }));
    setDetail((current) => current ? { ...current, workflowStatus: status } : current);
    setResults((items) => items.map((item) => item.id === detail.id ? { ...item, workflowStatus: status } : item));
    setSavedRecords((records) => {
      const next = records.map((record) => record.id === detail.id ? { ...record, workflowStatus: status } : record);
      window.localStorage.setItem('civic-ledger-saved-records', JSON.stringify(next));
      return next;
    });
  }

  function updateSourceStatus(key: string, status: string) {
    if (!key) return;
    setSourceStatuses((statuses) => ({ ...statuses, [key]: status }));
  }

  function saveIssuerProfile(profile: IssuerProfile) {
    if (!profile?.issuer) return;
    setIssuerProfiles((profiles) => ({
      ...profiles,
      [profileKey(profile.issuer)]: profile,
    }));
  }

  function updateReportContent(content: string) {
    if (!generatedReport) return;

    const nextReport = { ...generatedReport, content, editedAt: new Date().toISOString() };
    setGeneratedReport(nextReport);
    setDetail((current) => current ? { ...current, generatedReport: nextReport } : current);
    setResults((items) => items.map((item) => item.id === detail?.id ? { ...item, generatedReport: nextReport } : item));
  }

  function saveReportVersion() {
    if (!detail || !generatedReport) return;

    const version = {
      id: `version-${Date.now()}`,
      label: `Version ${(reportVersions[detail.id]?.length ?? 0) + 1} · ${new Date().toLocaleString()}`,
      content: generatedReport.content,
      templateLabel: generatedReport.templateLabel,
      savedAt: new Date().toISOString(),
    };

    setReportVersions((versions) => ({
      ...versions,
      [detail.id]: [version, ...(versions[detail.id] ?? [])].slice(0, 12),
    }));

    setSavedRecords((records) => {
      const next = records.map((record) => record.id === detail.id
        ? { ...record, reportVersions: [version, ...(record.reportVersions ?? [])].slice(0, 12) }
        : record);
      window.localStorage.setItem('civic-ledger-saved-records', JSON.stringify(next));
      return next;
    });
  }

  async function regenerateReportSection(sectionTitle: string, currentSection: string) {
    if (!detail || !generatedReport) return;

    saveReportVersion();
    setIsGeneratingReport(true);
    setReportError(null);

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record: detail,
          template: reportTemplate,
          sectionTitle,
          currentSection,
          workflowOptions,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || 'Section regeneration failed.');
      }

      const nextContent = replaceSection(generatedReport.content, sectionTitle, payload.report.content);
      updateReportContent(nextContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Section regeneration failed.';
      setReportError(message);
    } finally {
      setIsGeneratingReport(false);
    }
  }

  function updateReadingContent(content: string) {
    setReading((current) => current ? { ...current, body: [content], editedAt: new Date().toISOString() } : current);

    if (generatedReport && reading?.id === generatedReport.id) {
      updateReportContent(content);
    }
  }

  function addReadingAnnotation(annotation: ReadingAnnotation) {
    if (!reading) return;
    const key = readingKey(reading);
    setReadingAnnotations((items) => ({
      ...items,
      [key]: [annotation, ...(items[key] ?? [])],
    }));
    setSavedRecords((records) => {
      const next = records.map((record) => record.id === key
        ? { ...record, annotations: [annotation, ...(record.annotations ?? [])] }
        : record);
      window.localStorage.setItem('civic-ledger-saved-records', JSON.stringify(next));
      return next;
    });
  }

  function deleteReadingAnnotation(annotationId: string) {
    if (!reading) return;
    const key = readingKey(reading);
    setReadingAnnotations((items) => ({
      ...items,
      [key]: (items[key] ?? []).filter((annotation) => annotation.id !== annotationId),
    }));
    setSavedRecords((records) => {
      const next = records.map((record) => record.id === key
        ? { ...record, annotations: (record.annotations ?? []).filter((annotation) => annotation.id !== annotationId) }
        : record);
      window.localStorage.setItem('civic-ledger-saved-records', JSON.stringify(next));
      return next;
    });
  }

  function openLibraryRecord(record: ResearchRecord) {
    const normalized = normalizeRecord(record);
    setDetail(normalized);
    setSelectedId(normalized.id);
    setGeneratedReport(record.generatedReport ?? null);
    setRunStatuses((statuses) => ({ ...statuses, [normalized.id]: record.workflowStatus ?? defaultRunStatus(record) }));
    if (record.reportVersions?.length) {
      setReportVersions((versions) => ({ ...versions, [normalized.id]: record.reportVersions }));
    }
    setView('search');
  }

  function openLibraryReading(record: ResearchRecord) {
    const report = record.generatedReport;
    const key = record.id;

    if (record.annotations?.length) {
      setReadingAnnotations((items) => ({ ...items, [key]: record.annotations }));
    }

    setReading({
      id: report?.id || record.id,
      recordId: key,
      title: report?.title || `Reading: ${record.title}`,
      body: [report?.content || record.snippet || record.summary || ''],
    });
    setView('reading');
  }

  function openParsedDocumentReading(item: ReadingDocument) {
    setReading(item);
    setView('reading');
  }

  function applyDocumentWorkflow(workflow: DocumentWorkflowPackage, open = false) {
    const record = normalizeRecord(workflow.record);

    setReportTemplate(workflow.report.template ?? 'credit-memo');
    setGeneratedReport(workflow.report);
    setSelectedId(record.id);
    setDetail(record);
    setRunStatuses((statuses) => ({
      ...statuses,
      [record.id]: record.workflowStatus ?? defaultRunStatus(record),
    }));
    setResults((items) => [
      record,
      ...items.filter((item) => item.id !== record.id),
    ].slice(0, 12));
    setTab('results');
    setReportError(null);

    if (open) {
      setView('search');
    }
  }

  function startIssuerDevelopmentScan(issuer: string, mode: string, angle: string) {
    const isGeneralCcdUpdate = /CCD_GENERAL_UPDATE/i.test(angle);
    const nextOutputType = isGeneralCcdUpdate ? 'risk-monitor' : 'research-brief';
    const nextCustomAngle = `${mode}: ${angle}`;

    setQuery(issuer);
    setPromptMode('custom-prompt');
    setCustomAngle(nextCustomAngle);
    setReportTemplate(nextOutputType);
    setTopic('all');
    setSource('all');
    setSort('freshness');
    setGeneratedReport(null);
    setReportError(null);
    setView('search');
    void runResearch({
      query: issuer,
      promptMode: 'custom-prompt',
      customAngle: nextCustomAngle,
      outputType: nextOutputType,
      topic: 'all',
      source: 'all',
      sort: 'freshness',
    });
  }

  function startWorkflowRun(workflow: {
    query: string;
    promptMode: string;
    customAngle: string;
    outputType: string;
    source?: string;
    sort?: string;
  }) {
    setQuery(workflow.query);
    setPromptMode(workflow.promptMode);
    setCustomAngle(workflow.customAngle);
    setReportTemplate(workflow.outputType);
    setTopic('all');
    setSource(workflow.source ?? 'all');
    setSort(workflow.sort ?? 'freshness');
    setGeneratedReport(null);
    setReportError(null);
    setView('search');
    void runResearch({
      query: workflow.query,
      promptMode: workflow.promptMode,
      customAngle: workflow.customAngle,
      outputType: workflow.outputType,
      topic: 'all',
      source: workflow.source ?? 'all',
      sort: workflow.sort ?? 'freshness',
    });
  }

  function openCurrentReading() {
    if (!detail) return;

    if (generatedReport) {
      setReading({
        id: generatedReport.id,
        recordId: detail.id,
        title: generatedReport.title,
        body: [generatedReport.content],
      });
      setView('reading');
      return;
    }

    if (detail.kind === 'research') {
      setReading({
        id: detail.id,
        recordId: detail.id,
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
        workflowStatus: runStatuses[detail.id] ?? detail.workflowStatus ?? defaultRunStatus(detail),
        reportVersions: reportVersions[detail.id] ?? [],
        annotations: readingAnnotations[detail.id] ?? [],
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
    const storedRunStatuses = window.localStorage.getItem('civic-ledger-run-statuses');
    if (storedRunStatuses) {
      setRunStatuses(JSON.parse(storedRunStatuses));
    }
    const storedSourceStatuses = window.localStorage.getItem('civic-ledger-source-statuses');
    if (storedSourceStatuses) {
      setSourceStatuses(JSON.parse(storedSourceStatuses));
    }
    const storedIssuerProfiles = window.localStorage.getItem('civic-ledger-issuer-profiles');
    if (storedIssuerProfiles) {
      setIssuerProfiles(JSON.parse(storedIssuerProfiles));
    }
    const storedVersions = window.localStorage.getItem('civic-ledger-report-versions');
    if (storedVersions) {
      setReportVersions(JSON.parse(storedVersions));
    }
    const storedAnnotations = window.localStorage.getItem('civic-ledger-reading-annotations');
    if (storedAnnotations) {
      setReadingAnnotations(JSON.parse(storedAnnotations));
    }
    setStorageReady(true);
    loadSources();
    loadSearch();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('civic-ledger-run-statuses', JSON.stringify(runStatuses));
  }, [runStatuses, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('civic-ledger-source-statuses', JSON.stringify(sourceStatuses));
  }, [sourceStatuses, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('civic-ledger-issuer-profiles', JSON.stringify(issuerProfiles));
  }, [issuerProfiles, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('civic-ledger-report-versions', JSON.stringify(reportVersions));
  }, [reportVersions, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('civic-ledger-reading-annotations', JSON.stringify(readingAnnotations));
  }, [readingAnnotations, storageReady]);

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
            <span className="status-pill">LlamaParse intake</span>
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
              reportVersions={detail ? reportVersions[detail.id] ?? [] : []}
              sourceStatuses={sourceStatuses}
              runStatus={detail ? runStatuses[detail.id] ?? detail.workflowStatus ?? defaultRunStatus(detail) : 'Draft'}
              isGeneratingReport={isGeneratingReport}
              reportError={reportError}
              onGenerateReport={generateReport}
              onRegenerateSection={regenerateReportSection}
              onUpdateReportContent={updateReportContent}
              onSaveReportVersion={saveReportVersion}
              onRunStatusChange={updateRunStatus}
              onOpenReading={openCurrentReading}
              onSave={saveRecord}
              isSaved={Boolean(detail && savedRecords.some((record) => record.id === detail.id))}
            />
          </section>
        )}

        {view === 'reading' && (
          <ReadingPanel
            item={reading}
            annotations={readingAnnotations[readingKey(reading)] ?? []}
            onUpdateContent={updateReadingContent}
            onAddAnnotation={addReadingAnnotation}
            onDeleteAnnotation={deleteReadingAnnotation}
          />
        )}
        {view === 'developments' && (
          <IssuerDevelopmentsPanel
            savedRecords={savedRecords}
            onRunIssuerScan={startIssuerDevelopmentScan}
          />
        )}
        {view === 'workflows' && (
          <WorkflowCenterPanel
            savedRecords={savedRecords}
            issuerProfiles={issuerProfiles}
            onRunWorkflow={startWorkflowRun}
          />
        )}
        {view === 'profiles' && (
          <IssuerProfilesPanel
            profiles={issuerProfiles}
            savedRecords={savedRecords}
            currentRecord={detail}
            onSaveProfile={saveIssuerProfile}
          />
        )}
        {view === 'documents' && (
          <DocumentIntakePanel
            onOpenReading={openParsedDocumentReading}
            onWorkflowReady={(workflow) => applyDocumentWorkflow(workflow, false)}
            onOpenWorkflow={(workflow) => applyDocumentWorkflow(workflow, true)}
          />
        )}
        {view === 'sources' && (
          <SourcesPanel
            items={sources}
            detail={detail}
            savedRecords={savedRecords}
            sourceStatuses={sourceStatuses}
            onSourceStatusChange={updateSourceStatus}
          />
        )}
        {view === 'library' && (
          <ResearchLibraryPanel
            records={savedRecords}
            onOpenRecord={openLibraryRecord}
            onOpenReading={openLibraryReading}
          />
        )}
      </main>
    </div>
  );
}
