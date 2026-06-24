"use client";

import { useMemo, useState } from 'react';
import type { IssuerProfile, ResearchRecord } from '../../lib/types/public-finance';

type SourceLike = {
  title?: string;
  document?: string;
  documentType?: string;
  type?: string;
  document_type?: string;
  url?: string;
  source_url?: string;
};

type Props = {
  profiles: Record<string, IssuerProfile>;
  savedRecords: ResearchRecord[];
  currentRecord: ResearchRecord | null;
  onSaveProfile: (profile: IssuerProfile) => void;
};

const profileFields: Array<[keyof IssuerProfile, string, string]> = [
  ['legalName', 'Legal name', 'Official issuer / obligor legal name'],
  ['sector', 'Sector', 'Education, utility, city/county, healthcare...'],
  ['state', 'State', 'CA'],
  ['rating', 'Rating', "Moody's / S&P / Fitch / KBRA"],
  ['outstandingDebt', 'Outstanding debt', 'Most recent known amount and source'],
  ['latestOS', 'Latest OS', 'Official statement or POS link'],
  ['latestACFR', 'Latest ACFR', 'Audited financial statements / ACFR link'],
  ['latestBudget', 'Latest budget', 'Budget or financial plan link'],
  ['boardPage', 'Board page', 'Board agenda, minutes, packets'],
  ['emmaLink', 'EMMA link', 'MSRB / EMMA issuer or disclosure link'],
  ['advisorsCounsel', 'Known advisors / counsel', 'MA, bond counsel, disclosure counsel, UW'],
  ['lastCheckedDate', 'Last checked date', 'YYYY-MM-DD'],
];

function profileKey(value: string) {
  return value.trim().toLowerCase();
}

function sourceUrl(record: Partial<ResearchRecord> | null | undefined, pattern: RegExp) {
  const sources = [
    ...(record?.documentInventory ?? []),
    ...(record?.searchResults ?? []),
    ...((record?.evidencePackage?.document_inventory as SourceLike[] | undefined) ?? []),
  ] as SourceLike[];

  const match = sources.find((source) =>
    pattern.test(`${source.title ?? source.document ?? ''} ${source.documentType ?? source.type ?? source.document_type ?? ''} ${source.url ?? source.source_url ?? ''}`.toLowerCase())
  );

  return match?.url ?? match?.source_url ?? '';
}

function firstRating(record: Partial<ResearchRecord> | null | undefined) {
  const text = [
    record?.snippet,
    record?.summary,
    ...(record?.facts ?? []),
  ].join(' ');
  const match = text.match(/\b(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|AAA|AA[+-]?|A[+-]?|BBB[+-]?)\b/);
  return match?.[0] ?? '';
}

function buildProfileFromRecord(record: Partial<ResearchRecord> | null | undefined, existing?: IssuerProfile): IssuerProfile {
  const title = record?.title || existing?.issuer || 'New issuer';
  return {
    issuer: existing?.issuer || title,
    legalName: existing?.legalName || title,
    sector: existing?.sector || record?.researchModeLabel || record?.topic || '',
    state: existing?.state || (/california| ca\b/i.test(`${title} ${record?.snippet ?? ''}`) ? 'CA' : ''),
    rating: existing?.rating || firstRating(record),
    outstandingDebt: existing?.outstandingDebt || '',
    latestOS: existing?.latestOS || sourceUrl(record, /official statement|preliminary official statement|\bpos\b/),
    latestACFR: existing?.latestACFR || sourceUrl(record, /annual comprehensive financial report|\bacfr\b|audited financial|financial statements/),
    latestBudget: existing?.latestBudget || sourceUrl(record, /budget|financial plan/),
    boardPage: existing?.boardPage || sourceUrl(record, /board|agenda|minutes|packet/),
    emmaLink: existing?.emmaLink || sourceUrl(record, /emma|msrb|continuing disclosure/),
    advisorsCounsel: existing?.advisorsCounsel || existing?.knownAdvisors || '',
    lastCheckedDate: new Date().toISOString().slice(0, 10),
    notes: existing?.notes || record?.summary || '',
  };
}

function savedRecordForIssuer(records: ResearchRecord[], issuer: string) {
  const key = profileKey(issuer);
  return records.find((record) => profileKey(record.title || '').includes(key) || key.includes(profileKey(record.title || '')));
}

export function IssuerProfilesPanel({ profiles, savedRecords, currentRecord, onSaveProfile }: Props) {
  const issuerOptions = useMemo(() => {
    const names = new Set<string>();
    Object.values(profiles).forEach((profile) => names.add(profile.issuer));
    savedRecords.forEach((record) => record?.title && names.add(record.title));
    if (currentRecord?.title) names.add(currentRecord.title);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [profiles, savedRecords, currentRecord]);

  const [selectedIssuer, setSelectedIssuer] = useState(issuerOptions[0] || currentRecord?.title || 'LADWP');
  const existingProfile = profiles[profileKey(selectedIssuer)];
  const fallbackRecord = savedRecordForIssuer(savedRecords, selectedIssuer) || currentRecord;
  const [draft, setDraft] = useState<IssuerProfile>(
    existingProfile || buildProfileFromRecord({ ...fallbackRecord, title: selectedIssuer })
  );

  function selectIssuer(issuer: string) {
    setSelectedIssuer(issuer);
    const existing = profiles[profileKey(issuer)];
    const record = savedRecordForIssuer(savedRecords, issuer) || (currentRecord?.title === issuer ? currentRecord : null);
    setDraft(existing || buildProfileFromRecord({ ...record, title: issuer }));
  }

  function updateField(key: keyof IssuerProfile, value: string) {
    setDraft((profile) => ({ ...profile, [key]: value }));
  }

  function refreshFromCurrent() {
    if (!currentRecord) return;
    setSelectedIssuer(currentRecord.title);
    setDraft(buildProfileFromRecord(currentRecord, profiles[profileKey(currentRecord.title)]));
  }

  function saveProfile() {
    onSaveProfile({ ...draft, issuer: selectedIssuer, lastCheckedDate: draft.lastCheckedDate || new Date().toISOString().slice(0, 10) });
  }

  return (
    <section className="full-page-panel issuer-profile-page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Issuer File</p>
          <h2>Issuer Profile Database</h2>
          <p className="muted small">Reusable issuer facts so research updates start from an existing file instead of a blank search.</p>
        </div>
        <span className="count">{Object.keys(profiles).length}</span>
      </div>

      <div className="profile-layout">
        <aside className="issuer-browser">
          <div className="section-heading">
            <div>
              <h3>Issuers</h3>
              <p className="muted small">Saved profiles and saved research records.</p>
            </div>
          </div>
          <div className="issuer-list">
            {issuerOptions.length === 0 && <p className="muted small">Save a profile or research record to start.</p>}
            {issuerOptions.map((issuer) => (
              <button
                key={issuer}
                className={selectedIssuer === issuer ? 'active' : ''}
                onClick={() => selectIssuer(issuer)}
              >
                <span>{issuer}</span>
                <strong>{profiles[profileKey(issuer)] ? 'Profile' : 'Draft'}</strong>
              </button>
            ))}
          </div>
        </aside>

        <main className="issuer-development-detail">
          <div className="issuer-detail-head">
            <div>
              <p className="eyebrow">Profile</p>
              <h2>{selectedIssuer}</h2>
              <p className="muted">Legal identity, source links, ratings, debt notes, and monitoring metadata.</p>
            </div>
            <div className="report-toolbar">
              <button className="button-secondary" onClick={refreshFromCurrent} disabled={!currentRecord}>Update from Current Research</button>
              <button className="button-primary" onClick={saveProfile}>Save Profile</button>
            </div>
          </div>

          <section className="development-section profile-form">
            <div className="profile-form-grid">
              {profileFields.map(([key, label, placeholder]) => (
                <label key={key}>
                  {label}
                  <input
                    value={String(draft[key] ?? '')}
                    onChange={(event) => updateField(key, event.target.value)}
                    placeholder={placeholder}
                  />
                </label>
              ))}
            </div>
            <label className="profile-notes">
              Notes
              <textarea
                value={draft.notes ?? ''}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Internal research notes, known caveats, relationship history, or monitoring instructions."
                rows={5}
              />
            </label>
          </section>
        </main>
      </div>
    </section>
  );
}
