"use client";

import { useState } from 'react';
import { FormattedReport } from './FormattedReport';

type Props = {
  item: any;
  experienceMode?: 'reader' | 'supervisor';
  annotations: any[];
  onUpdateContent: (content: string) => void;
  onAddAnnotation: (annotation: any) => void;
  onDeleteAnnotation: (id: string) => void;
};

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'reading_room';
}

function annotatedMarkdown(title: string, content: string, annotations: any[]) {
  const notes = annotations.length
    ? annotations.map((annotation, index) => [
      `${index + 1}. **${annotation.type}** — ${annotation.anchor || 'General note'}`,
      `   - ${annotation.note}`,
      `   - ${new Date(annotation.createdAt).toLocaleString()}`,
    ].join('\n')).join('\n\n')
    : 'No annotations.';

  return [
    `# ${title}`,
    '',
    content,
    '',
    '## Reviewer Notes and Annotations',
    '',
    notes,
  ].join('\n');
}

function resultMarkdown(title: string, content: string) {
  return [
    `# ${title}`,
    '',
    content,
  ].join('\n');
}

function documentOutline(content: string) {
  const headings = content
    .split('\n')
    .map((line) => {
      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (!match) return null;
      return {
        level: match[1].length,
        text: match[2].replace(/\*\*/g, '').trim(),
      };
    })
    .filter(Boolean) as Array<{ level: number; text: string }>;

  return headings.length > 0 ? headings.slice(0, 18) : [{ level: 2, text: 'Document body' }];
}

const readerHiddenSections = [
  /^evidence$/i,
  /^source appendix$/i,
  /^sources?$/i,
  /^citations?$/i,
  /^gaps?$/i,
  /^confidence$/i,
  /^suggested follow-up questions?$/i,
  /^recency discipline$/i,
  /^research mode$/i,
  /^document discovery summary$/i,
  /^document inventory$/i,
  /^document extraction targets$/i,
  /^coverage dashboard$/i,
  /^missing data\s*\/\s*limits$/i,
  /^missing information$/i,
  /^next search queries$/i,
  /^upload\s*\/\s*llamaparse queue$/i,
  /^evidence appendix$/i,
  /^how to use this output$/i,
  /^recommended next steps$/i,
  /^reviewer notes and annotations$/i,
];

function normalizedHeading(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/[:.]$/, '')
    .trim();
}

function readerHeading(value: string) {
  const heading = normalizedHeading(value);

  if (/^current answer$/i.test(heading)) return 'Summary';
  if (/^working conclusion$/i.test(heading)) return 'Conclusion';
  if (/^key credit considerations$/i.test(heading)) return 'Key considerations';

  return heading;
}

function shouldHideReaderHeading(value: string) {
  const heading = normalizedHeading(value);
  return readerHiddenSections.some((pattern) => pattern.test(heading));
}

function isReaderPlainSectionHeading(value: string) {
  const heading = normalizedHeading(value.replace(/:$/, ''));

  return (
    shouldHideReaderHeading(heading) ||
    /^(summary|analysis|recommendations?|current answer|working conclusion|key credit considerations|issuer identification)$/i.test(heading)
  );
}

function shouldHideReaderLine(value: string) {
  const line = value.trim();

  return (
    /evidence candidates?|live sources?|total live sources?|candidate sources?|source coverage|coverage score/i.test(line) ||
    /^(source|source url|filename|generated|coverage|status|update|model|usage):/i.test(line) ||
    /^(canonical query|expanded query|expanded search|recommended mode|recommended source|recommended workflow|search type|search provider|universal source route|preferred source filter):/i.test(line) ||
    /^(finance focused|core finance documents found|core finance documents not found|source count|citations?):/i.test(line) ||
    /^Universal Search can start/i.test(line) ||
    /^This report includes preliminary or incomplete-evidence language/i.test(line)
  );
}

function cleanReaderLine(value: string) {
  return value.replace(/^Understood as issuer search:\s*/i, '').trimEnd();
}

function isRedundantReaderLine(value: string, existingLines: string[]) {
  const field = value.match(/^(Issuer|Alias|Sector|State):\s*(.+)$/i);
  if (!field) return false;

  const currentText = existingLines.join(' ').toLowerCase();
  const fact = field[2].trim().toLowerCase();

  return fact.length > 2 && currentText.includes(fact);
}

function readerResultContent(content: string) {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
  const nextLines: string[] = [];
  let hiddenLevel: number | null = null;
  let hiddenPlainSection = false;

  for (const rawLine of lines) {
    const heading = rawLine.match(/^(#{1,4})\s+(.+)$/);

    if (heading) {
      hiddenPlainSection = false;
      const level = heading[1].length;
      if (hiddenLevel && level > hiddenLevel) continue;

      hiddenLevel = shouldHideReaderHeading(heading[2]) ? level : null;
      if (hiddenLevel) continue;

      nextLines.push(`${heading[1]} ${readerHeading(heading[2])}`);
      continue;
    }

    const plainSection = rawLine.trim().match(/^(?:\d+\.\s*)?([A-Z][A-Za-z /-]{2,70})[:.]?$/);
    if (plainSection && isReaderPlainSectionHeading(rawLine.trim())) {
      hiddenLevel = null;
      hiddenPlainSection = shouldHideReaderHeading(rawLine.trim());
      if (hiddenPlainSection) continue;

      nextLines.push(`## ${readerHeading(rawLine.trim())}`);
      continue;
    }

    if (hiddenLevel) continue;
    if (hiddenPlainSection) continue;
    if (shouldHideReaderLine(rawLine)) continue;

    const cleanedLine = cleanReaderLine(rawLine);
    if (isRedundantReaderLine(cleanedLine, nextLines)) continue;

    nextLines.push(cleanedLine);
  }

  const cleaned = nextLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned) return cleaned;

  return (content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !shouldHideReaderLine(line))
    .slice(0, 8)
    .join('\n\n') || 'No final result is available yet.';
}

export function ReadingPanel({ item, experienceMode = 'reader', annotations, onUpdateContent, onAddAnnotation, onDeleteAnnotation }: Props) {
  const [mode, setMode] = useState<'preview' | 'edit' | 'annotate'>('preview');
  const [annotationType, setAnnotationType] = useState('Comment');
  const [annotationAnchor, setAnnotationAnchor] = useState('');
  const [annotationNote, setAnnotationNote] = useState('');
  const content = (item?.body || ['Select a result and open reading mode.']).join('\n\n');
  const title = item?.title || 'Reading room';
  const displayTitle = title.replace(/^Reading:\s*/i, '');
  const isReaderMode = experienceMode === 'reader';
  const displayContent = isReaderMode ? readerResultContent(content) : content;
  const outline = documentOutline(displayContent);
  const exportTitle = isReaderMode ? displayTitle : title;
  const exportContent = isReaderMode
    ? resultMarkdown(displayTitle, displayContent)
    : annotatedMarkdown(title, content, annotations);
  const exportSuffix = isReaderMode ? 'result' : 'annotated';

  function addAnnotation() {
    if (!annotationNote.trim()) return;

    onAddAnnotation({
      id: `annotation-${Date.now()}`,
      type: annotationType,
      anchor: annotationAnchor.trim(),
      note: annotationNote.trim(),
      createdAt: new Date().toISOString(),
    });

    setAnnotationAnchor('');
    setAnnotationNote('');
  }

  function downloadMarkdown() {
    downloadBlob(
      exportContent,
      `${slug(exportTitle)}_${exportSuffix}.md`,
      'text/markdown;charset=utf-8'
    );
  }

  async function downloadPdf() {
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: exportTitle,
        content: exportContent,
        filename: `${slug(exportTitle)}_${exportSuffix}.pdf`,
      }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug(exportTitle)}_${exportSuffix}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadDocx() {
    const res = await fetch('/api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: exportTitle,
        content: exportContent,
        filename: `${slug(exportTitle)}_${exportSuffix}.docx`,
      }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug(exportTitle)}_${exportSuffix}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const reviewPanel = (
    <aside className={`annotation-panel ${isReaderMode ? 'reader-review-panel' : ''} ${mode === 'annotate' ? 'active' : ''}`}>
      <div className="section-heading">
        <div>
          <h3>Review notes</h3>
          <p className="muted small">{annotations.length} annotations</p>
        </div>
      </div>

      {mode === 'annotate' && (
        <div className="annotation-composer">
          <label>
            Type
            <select value={annotationType} onChange={(event) => setAnnotationType(event.target.value)}>
              <option>Comment</option>
              <option>Suggested edit</option>
              <option>Question</option>
              <option>To verify</option>
            </select>
          </label>
          <label>
            Text or section
            <input
              value={annotationAnchor}
              onChange={(event) => setAnnotationAnchor(event.target.value)}
              placeholder="Example: Debt Profile, $56.2 million, paragraph 3"
            />
          </label>
          <label>
            Note
            <textarea
              value={annotationNote}
              onChange={(event) => setAnnotationNote(event.target.value)}
              placeholder="Add a reviewer note, edit idea, verification question, or drafting instruction."
              rows={4}
            />
          </label>
          <button className="button-primary" onClick={addAnnotation}>Add Annotation</button>
        </div>
      )}

      <div className="annotation-list">
        {annotations.length === 0 && <p className="muted small">No annotations yet.</p>}
        {annotations.map((annotation) => (
          <article key={annotation.id} className="annotation-card">
            <div className="record-meta">
              <span>{annotation.type}</span>
              <span>{new Date(annotation.createdAt).toLocaleDateString()}</span>
            </div>
            <strong>{annotation.anchor || 'General note'}</strong>
            <p>{annotation.note}</p>
            <button className="button-secondary" onClick={() => onDeleteAnnotation(annotation.id)}>Resolve</button>
          </article>
        ))}
      </div>

      <div className="export-grid">
        <button className="button-secondary" onClick={downloadMarkdown}>Export MD</button>
        <button className="button-secondary" onClick={downloadPdf}>Export PDF</button>
        <button className="button-secondary" onClick={downloadDocx}>Export DOCX</button>
      </div>
    </aside>
  );

  const documentPanel = (
    <div className="reading-document">
      {mode === 'edit' ? (
        <textarea
          className="reading-editor"
          value={displayContent}
          onChange={(event) => onUpdateContent(event.target.value)}
        />
      ) : (
        <div className="reading-body">
          <div className="document-page-label">
            <span>{isReaderMode ? 'Final result' : 'Working draft'}</span>
            <strong>{displayTitle}</strong>
          </div>
          <FormattedReport content={displayContent} compact={isReaderMode} />
        </div>
      )}
    </div>
  );

  return (
    <section className={`full-page-panel reading-desk ${isReaderMode ? 'reader-reading-desk' : ''}`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Reading Room</p>
          <h2>{displayTitle}</h2>
          <p className="muted small">{isReaderMode ? 'Read, review, and export the final result.' : 'Read, edit, annotate, and export the current report.'}</p>
        </div>
        <div className="reading-toolbar">
          {[
            ['preview', 'Preview'],
            ['edit', 'Edit'],
            ['annotate', 'Annotate'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={mode === id ? 'active' : ''}
              onClick={() => setMode(id as 'preview' | 'edit' | 'annotate')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={isReaderMode ? 'reader-reading-workspace' : 'reading-workspace'}>
        {isReaderMode ? (
          <>
            {reviewPanel}
            {documentPanel}
          </>
        ) : (
          <>
            <aside className="document-outline">
              <div>
                <p className="eyebrow">Outline</p>
                <h3>Document sections</h3>
              </div>
              <div className="outline-list">
                {outline.map((entry, index) => (
                  <button
                    key={`${entry.text}-${index}`}
                    className={`outline-level-${Math.min(entry.level, 4)}`}
                    type="button"
                  >
                    {entry.text}
                  </button>
                ))}
              </div>
            </aside>

            {documentPanel}
            {reviewPanel}
          </>
        )}
      </div>
    </section>
  );
}
