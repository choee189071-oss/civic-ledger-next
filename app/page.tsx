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
import {
  buildIssuerProfileFromRecord,
  profileKey,
  profilePromptContext,
} from '../lib/issuer-profile-database';
import type {
  GeneratedReport,
  FavoriteItem,
  IssuerProfile,
  ReadingAnnotation,
  ReadingDocument,
  RecentWorkspaceItem,
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

const STORAGE_KEYS = {
  savedRecords: 'civic-ledger-saved-records',
  runStatuses: 'civic-ledger-run-statuses',
  sourceStatuses: 'civic-ledger-source-statuses',
  issuerProfiles: 'civic-ledger-issuer-profiles',
  reportVersions: 'civic-ledger-report-versions',
  readingAnnotations: 'civic-ledger-reading-annotations',
  recentWorkspaces: 'civic-ledger-recent-workspaces',
  favorites: 'civic-ledger-favorites',
};

const sourceManagementTabs = [
  {
    id: 'documents',
    label: 'Document Intake',
    description: 'Upload PDFs and turn source files into evidence.',
  },
  {
    id: 'profiles',
    label: 'Issuer Profiles',
    description: 'Maintain the persistent issuer file and coverage map.',
  },
  {
    id: 'sources',
    label: 'Source List',
    description: 'Review source tier, recency, and verification status.',
  },
] as const;

type SourceManagementTab = typeof sourceManagementTabs[number]['id'];

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

function researchErrorMessage(payload: any) {
  const failure = payload?.failureClassification;

  if (failure?.title) {
    return [
      failure.title,
      failure.reason ? `Reason: ${failure.reason}` : null,
      failure.recommendation ? `Recommendation: ${failure.recommendation}` : null,
    ].filter(Boolean).join(' ');
  }

  return payload?.error || 'Live research failed.';
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

function recordIssuer(record: Partial<ResearchRecord> | null | undefined) {
  return String(record?.workflowInput?.issuer || record?.title || 'Untitled issuer');
}

function reportTitleFor(record: Partial<ResearchRecord> | null | undefined, report: GeneratedReport | null | undefined) {
  return report?.title || record?.generatedReport?.title || `${recordIssuer(record)} report`;
}

function favoriteIdFor(type: FavoriteItem['type'], title: string, recordId?: string) {
  return [type, recordId || title].join(':').toLowerCase().replace(/\s+/g, '-');
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function screenFocus(view: string) {
  const sourceManagementFocus = {
    eyebrow: 'Source Management',
    title: 'Which sources can support this analysis?',
    description: 'Upload core documents, maintain issuer files, and verify source quality in one evidence workspace.',
    primaryAction: 'Manage Sources',
    secondaryAction: 'Search Issuer',
  };

  const screens: Record<string, { eyebrow: string; title: string; description: string; primaryAction: string; secondaryAction?: string }> = {
    search: {
      eyebrow: 'Search',
      title: 'Which issuer are we researching?',
      description: 'Start with one issuer, alias, CUSIP, sector, bond type, or natural-language question. The workspace will organize evidence and analysis after the run.',
      primaryAction: 'Run Research',
      secondaryAction: 'Source Management',
    },
    developments: {
      eyebrow: 'Dashboard',
      title: 'What changed recently?',
      description: 'Monitor issuer and sector developments, then turn meaningful changes into a saved research run.',
      primaryAction: 'Open Monitor',
      secondaryAction: 'Search Issuer',
    },
    'source-management': sourceManagementFocus,
    documents: sourceManagementFocus,
    profiles: sourceManagementFocus,
    library: {
      eyebrow: 'Reports',
      title: 'Which workspace should continue?',
      description: 'Return to saved issuers, reports, versions, and reading-room documents without starting over.',
      primaryAction: 'Open Saved Work',
      secondaryAction: 'Search Issuer',
    },
    sources: sourceManagementFocus,
    reading: {
      eyebrow: 'Editor',
      title: 'What report text needs review?',
      description: 'Edit the work product, add reviewer notes, and preserve comments before export.',
      primaryAction: 'Back to Search',
      secondaryAction: 'Open Reports',
    },
    workflows: {
      eyebrow: 'Templates',
      title: 'Which repeatable workflow should run?',
      description: 'Choose a monitoring, diligence, or memo workflow and keep raw logs behind the workflow result.',
      primaryAction: 'Run Workflow',
      secondaryAction: 'Search Issuer',
    },
  };

  return screens[view] ?? screens.search;
}

export default function HomePage() {
  const [view, setView] = useState('search');
  const [sourceManagementTab, setSourceManagementTab] = useState<SourceManagementTab>('documents');
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
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspaceItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
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
  const [autosaveStatus, setAutosaveStatus] = useState('Autosave ready');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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
      const normalized = normalizeRecord(existing);
      setDetail(normalized);
      setGeneratedReport(existing.generatedReport ?? null);
      touchRecentWorkspace(normalized);
      return;
    }

    const res = await fetch(`/api/result/${id}`);
    if (!res.ok) return;
    const payload = await res.json();
    const normalized = normalizeRecord(payload);
    setDetail(normalized);
    setGeneratedReport(payload.generatedReport ?? null);
    touchRecentWorkspace(normalized);
  }

  async function loadReading(id: string) {
    const res = await fetch(`/api/reading/${id}`);
    const payload = await res.json();
    setReading(payload);
    setView('reading');
  }

  function openSourceManagement(tab: SourceManagementTab = 'documents') {
    setSourceManagementTab(tab);
    setView('source-management');
  }

  function navigateWorkspace(nextView: string) {
    if (nextView === 'documents' || nextView === 'profiles' || nextView === 'sources') {
      openSourceManagement(nextView);
      return;
    }

    setView(nextView);
  }

  function touchRecentWorkspace(record: ResearchRecord, subtitle?: string) {
    const now = new Date().toISOString();
    const issuer = recordIssuer(record);
    const item: RecentWorkspaceItem = {
      id: profileKey(issuer),
      issuer,
      title: record.title,
      subtitle: subtitle || record.researchModeLabel || record.topic || record.source,
      recordId: record.id,
      lastOpenedAt: now,
    };

    setRecentWorkspaces((items) => [
      item,
      ...items.filter((existing) => existing.id !== item.id && existing.recordId !== item.recordId),
    ].slice(0, 10));
  }

  function autosaveRecord(
    record: ResearchRecord,
    report: GeneratedReport | null | undefined = record.generatedReport,
    reason = 'Autosaved',
    remote = false
  ) {
    const now = new Date().toISOString();

    setSavedRecords((records) => {
      const existing = records.find((item) => item.id === record.id);
      const nextReport = report ?? record.generatedReport ?? existing?.generatedReport ?? null;
      const nextRecord = {
        ...existing,
        ...record,
        generatedReport: nextReport,
        workflowStatus: runStatuses[record.id] ?? record.workflowStatus ?? existing?.workflowStatus ?? defaultRunStatus(record),
        reportVersions: reportVersions[record.id] ?? existing?.reportVersions ?? [],
        annotations: readingAnnotations[record.id] ?? existing?.annotations ?? [],
        savedAt: now,
      };
      const next = [
        nextRecord,
        ...records.filter((item) => item.id !== record.id),
      ].slice(0, 16);

      window.localStorage.setItem(STORAGE_KEYS.savedRecords, JSON.stringify(next));
      return next;
    });

    touchRecentWorkspace(record, report?.templateLabel || record.researchModeLabel || record.topic);
    setAutosaveStatus(`${reason} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);

    if (remote) {
      fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record, report }),
      }).catch((error) => {
        console.warn('[library] remote autosave failed, kept local copy:', error);
      });
    }
  }

  function toggleFavorite(item: Omit<FavoriteItem, 'id' | 'createdAt'>) {
    const id = favoriteIdFor(item.type, item.title, item.recordId);

    setFavorites((items) => {
      const exists = items.some((favorite) => favorite.id === id);
      if (exists) return items.filter((favorite) => favorite.id !== id);
      return [{ ...item, id, createdAt: new Date().toISOString() }, ...items].slice(0, 16);
    });
  }

  function isFavorite(type: FavoriteItem['type'], title: string, recordId?: string) {
    const id = favoriteIdFor(type, title, recordId);
    return favorites.some((item) => item.id === id);
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
    const existingProfile = issuerProfiles[profileKey(runQuery)];

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
            issuerProfile: existingProfile ?? null,
            issuerProfileContext: profilePromptContext(existingProfile),
          }),
        }),
        fetch(`/api/search?${new URLSearchParams({ q: runQuery, topic: runTopic, source: runSource, sort: runSort }).toString()}`),
      ]);

      const searchPayload = await searchRes.json().catch(() => ({ items: [] }));
      const searchItems = (searchPayload.items ?? []).map(normalizeRecord);

      if (!researchRes.ok) {
        const errorPayload = await researchRes.json().catch(() => ({}));
        throw new Error(researchErrorMessage(errorPayload));
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
      setIssuerProfiles((profiles) => ({
        ...profiles,
        [profileKey(researchRecord.title)]: buildIssuerProfileFromRecord(
          researchRecord,
          profiles[profileKey(researchRecord.title)],
          'Auto-updated from live research'
        ),
      }));
      setRunStatuses((statuses) => ({ ...statuses, [researchRecord.id]: researchRecord.workflowStatus }));
      setTab('results');
      autosaveRecord(researchRecord, null, 'Research autosaved', true);
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
      const nextDetail = { ...detail, generatedReport: report, workflowStatus: 'Ready for Review' };
      setGeneratedReport(report);
      setRunStatuses((statuses) => ({ ...statuses, [detail.id]: 'Ready for Review' }));
      setDetail((current) => current ? { ...current, generatedReport: report, workflowStatus: 'Ready for Review' } : current);
      setResults((items) =>
        items.map((item) => item.id === detail.id ? { ...item, generatedReport: report, workflowStatus: 'Ready for Review' } : item)
      );
      autosaveRecord(nextDetail, report, 'Report autosaved', true);
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
      window.localStorage.setItem(STORAGE_KEYS.savedRecords, JSON.stringify(next));
      return next;
    });
    setAutosaveStatus(`Status autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }

  function updateSourceStatus(key: string, status: string) {
    if (!key) return;
    setSourceStatuses((statuses) => ({ ...statuses, [key]: status }));
  }

  function saveIssuerProfile(profile: IssuerProfile) {
    if (!profile?.issuer) return;
    setIssuerProfiles((profiles) => ({
      ...profiles,
      [profileKey(profile.issuer)]: {
        ...profile,
        rating: profile.rating || profile.ratings,
        ratings: profile.ratings || profile.rating,
      },
    }));
  }

  function updateReportContent(content: string) {
    if (!generatedReport) return;

    const nextReport = { ...generatedReport, content, editedAt: new Date().toISOString() };
    setGeneratedReport(nextReport);
    setDetail((current) => current ? { ...current, generatedReport: nextReport } : current);
    setResults((items) => items.map((item) => item.id === detail?.id ? { ...item, generatedReport: nextReport } : item));

    if (detail) {
      autosaveRecord({ ...detail, generatedReport: nextReport }, nextReport, 'Report edit autosaved');
    }
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
      window.localStorage.setItem(STORAGE_KEYS.savedRecords, JSON.stringify(next));
      return next;
    });
    setAutosaveStatus(`Version saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
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
    } else {
      setAutosaveStatus(`Editor autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
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
      window.localStorage.setItem(STORAGE_KEYS.savedRecords, JSON.stringify(next));
      return next;
    });
    setAutosaveStatus(`Annotation autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
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
      window.localStorage.setItem(STORAGE_KEYS.savedRecords, JSON.stringify(next));
      return next;
    });
    setAutosaveStatus(`Annotation autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
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
    touchRecentWorkspace(normalized);
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
    touchRecentWorkspace(normalizeRecord(record), report?.templateLabel || 'Reading room');
    setView('reading');
  }

  function findWorkspaceRecord(recordId?: string, title?: string) {
    return [...savedRecords, ...results].find((record) =>
      (recordId && record.id === recordId) ||
      (title && (record.title === title || recordIssuer(record) === title))
    );
  }

  function openRecentWorkspace(item: RecentWorkspaceItem) {
    const record = findWorkspaceRecord(item.recordId, item.issuer || item.title);

    if (record) {
      openLibraryRecord(record);
      return;
    }

    setQuery(item.issuer || item.title);
    setView('search');
    void loadSearch(item.issuer || item.title);
  }

  function openFavorite(item: FavoriteItem) {
    const record = findWorkspaceRecord(item.recordId, item.title);

    if (item.type === 'document' && record) {
      openLibraryReading(record);
      return;
    }

    if (record) {
      openLibraryRecord(record);
      return;
    }

    setQuery(item.title);
    setView('search');
    void loadSearch(item.title);
  }

  function openParsedDocumentReading(item: ReadingDocument) {
    setReading(item);
    setAutosaveStatus(`Document opened ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
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
    setIssuerProfiles((profiles) => ({
      ...profiles,
      [profileKey(record.title)]: buildIssuerProfileFromRecord(
        record,
        profiles[profileKey(record.title)],
        'Auto-updated from document intake'
      ),
    }));
    setTab('results');
    setReportError(null);
    autosaveRecord({ ...record, generatedReport: workflow.report }, workflow.report, 'Document workflow autosaved', true);

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
      touchRecentWorkspace(detail, generatedReport.templateLabel || 'Reading room');
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
      touchRecentWorkspace(detail, 'Reading room');
      setView('reading');
      return;
    }

    if (selectedId) {
      loadReading(selectedId);
    }
  }

  function saveRecord() {
    if (!detail) return;

    autosaveRecord({ ...detail, generatedReport }, generatedReport, 'Workspace saved', true);
    setIssuerProfiles((profiles) => ({
      ...profiles,
      [profileKey(detail.title)]: buildIssuerProfileFromRecord(
        { ...detail, generatedReport },
        profiles[profileKey(detail.title)],
        'Auto-updated from saved research record'
      ),
    }));
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEYS.savedRecords);
    if (stored) {
      setSavedRecords(JSON.parse(stored));
    }
    const storedRunStatuses = window.localStorage.getItem(STORAGE_KEYS.runStatuses);
    if (storedRunStatuses) {
      setRunStatuses(JSON.parse(storedRunStatuses));
    }
    const storedSourceStatuses = window.localStorage.getItem(STORAGE_KEYS.sourceStatuses);
    if (storedSourceStatuses) {
      setSourceStatuses(JSON.parse(storedSourceStatuses));
    }
    const storedIssuerProfiles = window.localStorage.getItem(STORAGE_KEYS.issuerProfiles);
    if (storedIssuerProfiles) {
      setIssuerProfiles(JSON.parse(storedIssuerProfiles));
    }
    const storedVersions = window.localStorage.getItem(STORAGE_KEYS.reportVersions);
    if (storedVersions) {
      setReportVersions(JSON.parse(storedVersions));
    }
    const storedAnnotations = window.localStorage.getItem(STORAGE_KEYS.readingAnnotations);
    if (storedAnnotations) {
      setReadingAnnotations(JSON.parse(storedAnnotations));
    }
    const storedRecentWorkspaces = window.localStorage.getItem(STORAGE_KEYS.recentWorkspaces);
    if (storedRecentWorkspaces) {
      setRecentWorkspaces(JSON.parse(storedRecentWorkspaces));
    }
    const storedFavorites = window.localStorage.getItem(STORAGE_KEYS.favorites);
    if (storedFavorites) {
      setFavorites(JSON.parse(storedFavorites));
    }
    const storedTheme = window.localStorage.getItem('civic-ledger-theme');
    if (storedTheme === 'dark' || storedTheme === 'light') {
      setTheme(storedTheme);
    }
    setStorageReady(true);
    loadSources();
    loadSearch();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEYS.runStatuses, JSON.stringify(runStatuses));
  }, [runStatuses, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEYS.sourceStatuses, JSON.stringify(sourceStatuses));
  }, [sourceStatuses, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEYS.issuerProfiles, JSON.stringify(issuerProfiles));
  }, [issuerProfiles, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEYS.reportVersions, JSON.stringify(reportVersions));
  }, [reportVersions, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEYS.readingAnnotations, JSON.stringify(readingAnnotations));
  }, [readingAnnotations, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEYS.recentWorkspaces, JSON.stringify(recentWorkspaces));
  }, [recentWorkspaces, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
  }, [favorites, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('civic-ledger-theme', theme);
  }, [theme, storageReady]);

  useEffect(() => {
    function focusSearch(select = false) {
      setView('search');
      window.setTimeout(() => {
        const input = document.getElementById('issuer-search') as HTMLInputElement | null;
        input?.focus();
        if (select) input?.select();
      }, 0);
    }

    function handleShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if (event.key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.ctrlKey && key === 'k' && !isEditableTarget(event.target)) {
        event.preventDefault();
        focusSearch(true);
        return;
      }

      if (event.metaKey && event.key === 'Enter') {
        event.preventDefault();
        if (!isResearching) void runResearch();
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isResearching, query, topic, source, sort, promptMode, customAngle, reportTemplate, workflowOptions, issuerProfiles]);

  const activeRunStatus = detail ? runStatuses[detail.id] ?? detail.workflowStatus ?? defaultRunStatus(detail) : 'No active run';
  const activeSourceCount = detail
    ? (detail.documentInventory?.length ?? 0) + (detail.searchResults?.length ?? 0) + (detail.citations?.length ?? 0)
    : sources.length;
  const activeProfileCount = Object.keys(issuerProfiles).length;
  const activeIssuerTitle = detail ? recordIssuer(detail) : '';
  const activeReportTitle = detail ? reportTitleFor(detail, generatedReport) : '';
  const activeDocumentTitle = detail ? generatedReport?.title || `Reading: ${detail.title}` : '';
  const activeIssuerPinned = Boolean(detail && isFavorite('issuer', activeIssuerTitle, detail.id));
  const activeReportPinned = Boolean(detail && generatedReport && isFavorite('report', activeReportTitle, detail.id));
  const activeDocumentPinned = Boolean(detail && isFavorite('document', activeDocumentTitle, detail.id));
  const isBusy = isResearching || isGeneratingReport;
  const focus = screenFocus(view);
  const isSourceManagementView = view === 'source-management' || view === 'documents' || view === 'profiles' || view === 'sources';

  return (
    <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <a href="#main-workspace" className="skip-link">Skip to workspace</a>
      {isBusy && (
        <div className="global-loading" role="status" aria-live="polite">
          <span />
          <strong>{isResearching ? 'Running issuer research...' : 'Generating professional memo...'}</strong>
        </div>
      )}
      <Sidebar
        current={isSourceManagementView ? 'source-management' : view}
        onChange={navigateWorkspace}
        savedRecords={savedRecords}
        recentWorkspaces={recentWorkspaces}
        favorites={favorites}
        onOpenRecent={openRecentWorkspace}
        onOpenFavorite={openFavorite}
      />
      <main id="main-workspace" className="main" aria-busy={isBusy}>
        <header className="workspace-header">
          <div className="workspace-title">
            <p className="eyebrow">{focus.eyebrow}</p>
            <h1>{focus.title}</h1>
            <p className="workspace-subtitle">{focus.description}</p>
          </div>
          <div className="workspace-command">
            <div className="header-actions">
              <span className="status-pill ready" aria-live="polite">{autosaveStatus}</span>
              <button
                className="button-secondary theme-toggle"
                type="button"
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              {view !== 'search' && (
                <button className="button-secondary" onClick={() => setView('search')}>Search Issuer</button>
              )}
              {view === 'search' && (
                <button className="button-primary" onClick={() => void runResearch()} disabled={isResearching}>
                  {isResearching ? 'Researching...' : focus.primaryAction}
                </button>
              )}
              {view === 'search' && (
                <button className="button-secondary" onClick={() => openSourceManagement('documents')}>{focus.secondaryAction}</button>
              )}
              {view === 'reading' && (
                <button className="button-primary" onClick={() => setView('library')}>{focus.secondaryAction}</button>
              )}
            </div>
            <details className="workspace-status-drawer">
              <summary>
                <span>Workspace status</span>
                <strong>{activeRunStatus}</strong>
              </summary>
              <div className="workspace-kpis">
                <div>
                  <span>Active run</span>
                  <strong>{activeRunStatus}</strong>
                </div>
                <div>
                  <span>Evidence items</span>
                  <strong>{activeSourceCount}</strong>
                </div>
                <div>
                  <span>Issuer files</span>
                  <strong>{activeProfileCount}</strong>
                </div>
                <div>
                  <span>Saved</span>
                  <strong>{savedRecords.length}</strong>
                </div>
              </div>
            </details>
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
              isIssuerPinned={activeIssuerPinned}
              isReportPinned={activeReportPinned}
              isDocumentPinned={activeDocumentPinned}
              onToggleIssuerPin={() => {
                if (!detail) return;
                toggleFavorite({
                  type: 'issuer',
                  title: activeIssuerTitle,
                  subtitle: detail.researchModeLabel || detail.topic || detail.source,
                  recordId: detail.id,
                });
              }}
              onToggleReportPin={() => {
                if (!detail || !generatedReport) return;
                toggleFavorite({
                  type: 'report',
                  title: activeReportTitle,
                  subtitle: generatedReport.templateLabel || reportTemplate,
                  recordId: detail.id,
                });
              }}
              onToggleDocumentPin={() => {
                if (!detail) return;
                toggleFavorite({
                  type: 'document',
                  title: activeDocumentTitle,
                  subtitle: generatedReport ? 'Reading room report' : detail.source,
                  recordId: detail.id,
                });
              }}
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
        {isSourceManagementView && (
          <section className="source-management-page" aria-label="Source management">
            <div className="source-management-tabs" role="tablist" aria-label="Source management sections">
              {sourceManagementTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={sourceManagementTab === item.id}
                  className={sourceManagementTab === item.id ? 'active' : ''}
                  onClick={() => setSourceManagementTab(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>

            {sourceManagementTab === 'documents' && (
              <DocumentIntakePanel
                onOpenReading={openParsedDocumentReading}
                onWorkflowReady={(workflow) => applyDocumentWorkflow(workflow, false)}
                onOpenWorkflow={(workflow) => applyDocumentWorkflow(workflow, true)}
              />
            )}
            {sourceManagementTab === 'profiles' && (
              <IssuerProfilesPanel
                profiles={issuerProfiles}
                savedRecords={savedRecords}
                currentRecord={detail}
                onSaveProfile={saveIssuerProfile}
              />
            )}
            {sourceManagementTab === 'sources' && (
              <SourcesPanel
                items={sources}
                detail={detail}
                savedRecords={savedRecords}
                sourceStatuses={sourceStatuses}
                onSourceStatusChange={updateSourceStatus}
              />
            )}
          </section>
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
