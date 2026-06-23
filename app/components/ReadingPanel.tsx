"use client";

import { useState } from 'react';
import { htmlDocumentFromMarkdown } from './exportDocument';
import { FormattedReport } from './FormattedReport';

type Props = {
  item: any;
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

export function ReadingPanel({ item, annotations, onUpdateContent, onAddAnnotation, onDeleteAnnotation }: Props) {
  const [mode, setMode] = useState<'preview' | 'edit' | 'annotate'>('preview');
  const [annotationType, setAnnotationType] = useState('Comment');
  const [annotationAnchor, setAnnotationAnchor] = useState('');
  const [annotationNote, setAnnotationNote] = useState('');
  const content = (item?.body || ['Select a result and open reading mode.']).join('\n\n');
  const title = item?.title || 'Reading room';

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
      annotatedMarkdown(title, content, annotations),
      `${slug(title)}_annotated.md`,
      'text/markdown;charset=utf-8'
    );
  }

  function downloadWord() {
    downloadBlob(
      htmlDocumentFromMarkdown(annotatedMarkdown(title, content, annotations), title),
      `${slug(title)}_annotated.doc`,
      'application/msword;charset=utf-8'
    );
  }

  async function downloadPdf() {
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content: annotatedMarkdown(title, content, annotations),
        filename: `${slug(title)}_annotated.pdf`,
      }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug(title)}_annotated.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="full-page-panel reading-desk">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Reading</p>
          <h2>{title}</h2>
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

      <div className="reading-workspace">
        <div className="reading-document">
          {mode === 'edit' ? (
            <textarea
              className="reading-editor"
              value={content}
              onChange={(event) => onUpdateContent(event.target.value)}
            />
          ) : (
            <div className="reading-body">
              <FormattedReport content={content} />
            </div>
          )}
        </div>

        <aside className={`annotation-panel ${mode === 'annotate' ? 'active' : ''}`}>
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
            <button className="button-secondary" onClick={downloadWord}>Export Word</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
