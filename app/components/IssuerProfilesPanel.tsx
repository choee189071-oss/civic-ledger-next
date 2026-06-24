"use client";

import { useMemo, useState } from 'react';
import type { IssuerProfile, ResearchRecord } from '../../lib/types/public-finance';
import {
  buildIssuerProfileFromRecord,
  missingProfileFields,
  profileHealthLabel,
  profileKey,
} from '../../lib/issuer-profile-database';

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
  ['ratings', 'Ratings', "Moody's / S&P / Fitch / KBRA"],
  ['outstandingDebt', 'Outstanding debt', 'Most recent known amount and source'],
  ['latestACFR', 'Latest ACFR', 'Audited financial statements / ACFR link'],
  ['latestOS', 'Latest OS / POS', 'Official statement or POS link'],
  ['latestEmmaFiling', 'Latest EMMA filing', 'Continuing disclosure / annual report link'],
  ['latestRatingReport', 'Latest rating report', "Moody's / S&P / Fitch / KBRA link"],
  ['latestBudget', 'Latest budget', 'Budget or financial plan link'],
  ['boardPage', 'Board page', 'Board agenda, minutes, packets'],
  ['emmaLink', 'EMMA link', 'MSRB / EMMA issuer or disclosure link'],
  ['advisorsCounsel', 'Known advisors / counsel', 'MA, bond counsel, disclosure counsel, UW'],
  ['lastCheckedDate', 'Last checked date', 'YYYY-MM-DD'],
  ['profileStatus', 'Profile status', 'Draft / Needs Sources / Ready for Review'],
];

function savedRecordForIssuer(records: ResearchRecord[], issuer: string) {
  const key = profileKey(issuer);
  return records.find((record) => profileKey(record.title || '').includes(key) || key.includes(profileKey(record.title || '')));
}

function sourceHref(value: unknown) {
  const text = String(value ?? '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

function downloadProfile(profile: IssuerProfile) {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${profile.issuer.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_issuer_profile.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
    existingProfile || buildIssuerProfileFromRecord({ ...fallbackRecord, title: selectedIssuer })
  );
  const missingFields = missingProfileFields(draft);
  const liveCoverageScore = Math.max(0, Math.round(((10 - Math.min(missingFields.length, 10)) / 10) * 100));
  const health = liveCoverageScore >= 80 ? 'Ready for Review' : liveCoverageScore >= 50 ? 'Needs Sources' : profileHealthLabel(draft);
  const sourceTrail = draft.sourceTrail ?? [];
  const updateHistory = draft.updateHistory ?? [];

  function selectIssuer(issuer: string) {
    setSelectedIssuer(issuer);
    const existing = profiles[profileKey(issuer)];
    const record = savedRecordForIssuer(savedRecords, issuer) || (currentRecord?.title === issuer ? currentRecord : null);
    setDraft(existing || buildIssuerProfileFromRecord({ ...record, title: issuer }));
  }

  function updateField(key: keyof IssuerProfile, value: string) {
    setDraft((profile) => ({ ...profile, [key]: value }));
  }

  function refreshFromCurrent() {
    if (!currentRecord) return;
    setSelectedIssuer(currentRecord.title);
    setDraft(buildIssuerProfileFromRecord(currentRecord, profiles[profileKey(currentRecord.title)], 'Updated from current research'));
  }

  function saveProfile() {
    onSaveProfile({
      ...draft,
      issuer: selectedIssuer,
      rating: draft.rating || draft.ratings,
      ratings: draft.ratings || draft.rating,
      profileStatus: draft.profileStatus || health,
      evidenceCoverageScore: liveCoverageScore,
      lastCheckedDate: draft.lastCheckedDate || new Date().toISOString().slice(0, 10),
    });
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
            <div className="profile-health-strip">
              <span className="status-pill ready">{health}</span>
              <span className="status-pill">{liveCoverageScore}% coverage</span>
              <span className={missingFields.length ? 'status-pill warning' : 'status-pill ready'}>
                {missingFields.length ? `${missingFields.length} missing fields` : 'Core profile complete'}
              </span>
            </div>
          </div>
          <div className="report-toolbar">
              <button className="button-secondary" onClick={refreshFromCurrent} disabled={!currentRecord}>Update from Current Research</button>
              <button className="button-secondary" onClick={() => downloadProfile(draft)}>Download JSON</button>
              <button className="button-primary" onClick={saveProfile}>Save Profile</button>
            </div>
          </div>

          <section className="development-section profile-summary-grid">
            <div>
              <span>Latest ACFR</span>
              {sourceHref(draft.latestACFR) ? <a href={sourceHref(draft.latestACFR)} target="_blank" rel="noreferrer">Open ACFR</a> : <strong>Not found</strong>}
            </div>
            <div>
              <span>Latest OS / POS</span>
              {sourceHref(draft.latestOS) ? <a href={sourceHref(draft.latestOS)} target="_blank" rel="noreferrer">Open OS</a> : <strong>Not found</strong>}
            </div>
            <div>
              <span>Latest EMMA filing</span>
              {sourceHref(draft.latestEmmaFiling || draft.emmaLink) ? <a href={sourceHref(draft.latestEmmaFiling || draft.emmaLink)} target="_blank" rel="noreferrer">Open EMMA</a> : <strong>Not found</strong>}
            </div>
            <div>
              <span>Board / governance page</span>
              {sourceHref(draft.boardPage) ? <a href={sourceHref(draft.boardPage)} target="_blank" rel="noreferrer">Open board page</a> : <strong>Not found</strong>}
            </div>
          </section>

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

          <section className="development-section">
            <div className="section-heading">
              <div>
                <h3>Missing profile fields</h3>
                <p className="muted small">These fields should be filled before treating the issuer file as review-ready.</p>
              </div>
            </div>
            <div className="stack">
              {missingFields.length === 0 && <div className="fact-line">No core profile gaps detected.</div>}
              {missingFields.map((field) => (
                <div key={field} className="fact-line">{field}</div>
              ))}
            </div>
          </section>

          <section className="development-section">
            <div className="section-heading">
              <div>
                <h3>Source trail</h3>
                <p className="muted small">Sources captured from saved research runs and document intake.</p>
              </div>
              <span className="status-pill">{sourceTrail.length} sources</span>
            </div>
            <div className="source-list">
              {sourceTrail.length === 0 && <p className="muted small">No source trail yet. Save or refresh from a research run.</p>}
              {sourceTrail.slice(0, 12).map((source: any) => (
                <article key={`${source.title}-${source.url}`} className="source-list-row">
                  <div>
                    <div className="record-meta">
                      <span>{source.sourceTier || 'Source'}</span>
                      <span>{source.documentType || 'Document'}</span>
                      <span>{source.date || 'Undated source'}</span>
                      <span>{source.status || 'Candidate'}</span>
                    </div>
                    {sourceHref(source.url) ? (
                      <a href={sourceHref(source.url)} target="_blank" rel="noreferrer"><h3>{source.title}</h3></a>
                    ) : (
                      <h3>{source.title}</h3>
                    )}
                    {source.notes && <p className="muted small">{source.notes}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="development-section">
            <div className="section-heading">
              <div>
                <h3>Update history</h3>
                <p className="muted small">Profile changes created from research runs, uploaded documents, or manual saves.</p>
              </div>
              <span className="status-pill">{updateHistory.length} updates</span>
            </div>
            <div className="mini-table">
              <div className="mini-table-row header">
                <span>Date</span>
                <span>Reason</span>
                <span>Source run</span>
              </div>
              {updateHistory.length === 0 && (
                <div className="mini-table-row">
                  <span>Not started</span>
                  <span>No update history yet</span>
                  <span>Save profile to begin</span>
                </div>
              )}
              {updateHistory.slice(0, 8).map((item: any, index) => (
                <div key={`${item.checkedAt}-${index}`} className="mini-table-row">
                  <span>{item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'Unknown date'}</span>
                  <span>{item.reason || 'Profile update'}</span>
                  <span>{item.sourceRecordTitle || item.sourceRecordId || 'Manual'}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </section>
  );
}
