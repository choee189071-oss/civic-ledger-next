"use client";

import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SearchPanel } from './components/SearchPanel';
import { DetailPanel } from './components/DetailPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { ReadingPanel } from './components/ReadingPanel';
import { EvidencePanel } from './components/EvidencePanel';

export default function HomePage() {
  const [view, setView] = useState('search');
  const [query, setQuery] = useState('budget expenditures');
  const [topic, setTopic] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('score');
  const [tab, setTab] = useState('results');
  const [results, setResults] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [reading, setReading] = useState<any | null>(null);
  const [savedRecords, setSavedRecords] = useState<any[]>([]);

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
    setResults(payload.items);
    const first = payload.items[0];
    if (first) {
      setSelectedId(first.id);
      await loadDetail(first.id);
    } else {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function loadSources() {
    const res = await fetch('/api/sources');
    const payload = await res.json();
    setSources(payload.items);
  }

  async function loadDetail(id: string) {
    const res = await fetch(`/api/result/${id}`);
    const payload = await res.json();
    setDetail(payload);
  }

  async function loadReading(id: string) {
    const res = await fetch(`/api/reading/${id}`);
    const payload = await res.json();
    setReading(payload);
    setView('reading');
  }

  function saveRecord() {
    if (!detail) return;

    setSavedRecords((records) => {
      const nextRecord = {
        ...detail,
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
            <span className="status-pill">Mock data</span>
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
              items={results}
              selectedId={selectedId}
              tab={tab}
              onQuery={setQuery}
              onTopic={(v) => { setTopic(v); loadSearch(query, v, source, sort); }}
              onSource={(v) => { setSource(v); loadSearch(query, topic, v, sort); }}
              onSort={(v) => { setSort(v); loadSearch(query, topic, source, v); }}
              onSearch={() => loadSearch()}
              onSelect={(id) => { setSelectedId(id); loadDetail(id); }}
              onTab={setTab}
            />
            <DetailPanel
              detail={detail}
              onOpenReading={() => selectedId && loadReading(selectedId)}
              onSave={saveRecord}
              isSaved={Boolean(detail && savedRecords.some((record) => record.id === detail.id))}
            />
            <EvidencePanel detail={detail} sources={sources} />
          </section>
        )}

        {view === 'reading' && <ReadingPanel item={reading} />}
        {view === 'sources' && <SourcesPanel items={sources} />}
      </main>
    </div>
  );
}
