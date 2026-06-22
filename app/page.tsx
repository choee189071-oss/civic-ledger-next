"use client";

import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SearchPanel } from './components/SearchPanel';
import { DetailPanel } from './components/DetailPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { ReadingPanel } from './components/ReadingPanel';

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

  useEffect(() => {
    loadSources();
    loadSearch();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar current={view} onChange={setView} />
      <main className="main">
        <section className="hero">
          <div className="card">
            <h1>California public finance workbench.</h1>
            <p className="muted">Search, read, and cite Open FI$Cal, California Budget, CDIAC, and Debt Line from one place.</p>
          </div>
          <div className="panel">
            <strong>Mock API active</strong>
            <p className="muted" style={{ marginTop: 12 }}>Route handlers simulate /api/search, /api/sources, /api/result/:id, and /api/reading/:id.</p>
          </div>
        </section>

        {view === 'search' && (
          <section className="search-layout">
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
            />
          </section>
        )}

        {view === 'reading' && <ReadingPanel item={reading} />}
        {view === 'sources' && <SourcesPanel items={sources} />}
      </main>
      <aside className="rail">
        <div className="panel">
          <strong>Live sources</strong>
          <p className="muted" style={{ marginTop: 12 }}>Open FI$Cal for expenditure lookup, California Budget for fiscal-year framing, CDIAC for debt reporting and data workflows.</p>
        </div>
      </aside>
    </div>
  );
}
