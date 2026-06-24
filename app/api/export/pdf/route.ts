import { NextResponse } from 'next/server';
import { cleanExportInline, normalizeExportText, normalizePdfText } from '@/lib/export-formatting';

export const runtime = 'nodejs';

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string; ordered?: boolean }
  | { type: 'table'; rows: string[][] }
  | { type: 'rule' };

type PageElement =
  | { type: 'text'; text: string; x: number; y: number; size: number; font: 'regular' | 'bold' | 'italic' }
  | { type: 'rect'; x: number; y: number; width: number; height: number; fill?: string; stroke?: string }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number };

type FontStyle = Extract<PageElement, { type: 'text' }>['font'];

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const TOP_Y = 714;
const BOTTOM_Y = 58;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function escapePdfText(value: string) {
  return normalizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function stripMarkdownInline(value: string) {
  return cleanExportInline(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLongToken(token: string, maxChars: number) {
  if (token.length <= maxChars) return [token];

  const pieces: string[] = [];
  for (let index = 0; index < token.length; index += maxChars) {
    pieces.push(token.slice(index, index + maxChars));
  }
  return pieces;
}

function wrapText(text: string, maxWidth: number, fontSize: number) {
  const averageCharWidth = fontSize * 0.52;
  const maxChars = Math.max(22, Math.floor(maxWidth / averageCharWidth));
  const words = stripMarkdownInline(text)
    .split(/\s+/)
    .flatMap((word) => splitLongToken(word, maxChars));
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;

    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function isTableSeparator(line: string) {
  const cells = line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).filter(Boolean);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableLines(lines: string[]) {
  return lines
    .filter((line) => !isTableSeparator(line))
    .map((line) =>
      line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => stripMarkdownInline(cell))
    )
    .filter((row) => row.length > 1);
}

function parseMarkdown(content: string, title: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = normalizeExportText(content).replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let tableLines: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  }

  function flushTable() {
    if (tableLines.length === 0) return;

    const rows = parseTableLines(tableLines);
    if (rows.length > 0) {
      blocks.push({ type: 'table', rows });
    }

    tableLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushTable();
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      flushParagraph();
      tableLines.push(line);
      continue;
    }

    flushTable();

    if (/^-{3,}$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const text = stripMarkdownInline(heading[2]);
      const isDuplicateTitle = blocks.length === 0 && text.toLowerCase() === title.toLowerCase();
      flushParagraph();
      if (!isDuplicateTitle) {
        blocks.push({ type: 'heading', level: heading[1].length, text });
      }
      continue;
    }

    const ordered = line.match(/^(\d+)\.\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (ordered || unordered) {
      flushParagraph();
      blocks.push({
        type: 'bullet',
        ordered: Boolean(ordered),
        text: ordered ? `${ordered[1]}. ${ordered[2]}` : unordered?.[1] ?? '',
      });
      continue;
    }

    if (/^(Generated|Coverage|Scope|Status|Update|Source|Note|Selected conditions|Monitoring conditions):/i.test(line)) {
      flushParagraph();
      if (blocks.length === 0 && /^Generated:/i.test(line)) {
        continue;
      }
      blocks.push({ type: 'paragraph', text: line });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushTable();
  return blocks;
}

function shortText(value: string, max = 78) {
  const clean = stripMarkdownInline(value);
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function layoutDocument(title: string, content: string) {
  const pages: PageElement[][] = [[]];
  let y = TOP_Y;

  function currentPage() {
    return pages[pages.length - 1];
  }

  function newPage() {
    pages.push([]);
    y = TOP_Y;
  }

  function ensureSpace(height: number) {
    if (y - height < BOTTOM_Y) newPage();
  }

  function addText(text: string, options: { size: number; font?: 'regular' | 'bold' | 'italic'; x?: number; leading?: number; width?: number }) {
    const font = options.font ?? 'regular';
    const x = options.x ?? MARGIN_X;
    const width = options.width ?? (CONTENT_WIDTH - (x - MARGIN_X));
    const leading = options.leading ?? options.size * 1.35;
    const lines = wrapText(text, width, options.size);

    for (const line of lines) {
      ensureSpace(leading);
      currentPage().push({ type: 'text', text: line, x, y, size: options.size, font });
      y -= leading;
    }
  }

  function addRule() {
    ensureSpace(18);
    y -= 4;
    currentPage().push({ type: 'line', x1: MARGIN_X, y1: y, x2: PAGE_WIDTH - MARGIN_X, y2: y });
    y -= 14;
  }

  function tableColumnWidths(columnCount: number) {
    if (columnCount <= 1) return [CONTENT_WIDTH];
    if (columnCount === 2) return [CONTENT_WIDTH * 0.34, CONTENT_WIDTH * 0.66];
    if (columnCount === 3) return [CONTENT_WIDTH * 0.26, CONTENT_WIDTH * 0.24, CONTENT_WIDTH * 0.5];
    if (columnCount === 4) return [CONTENT_WIDTH * 0.25, CONTENT_WIDTH * 0.19, CONTENT_WIDTH * 0.19, CONTENT_WIDTH * 0.37];
    if (columnCount === 5) {
      return [
        CONTENT_WIDTH * 0.28,
        CONTENT_WIDTH * 0.16,
        CONTENT_WIDTH * 0.14,
        CONTENT_WIDTH * 0.24,
        CONTENT_WIDTH * 0.18,
      ];
    }

    const base = CONTENT_WIDTH / columnCount;
    return Array.from({ length: columnCount }, () => base);
  }

  function addTable(rows: string[][]) {
    if (rows.length === 0) return;

    const columnCount = Math.max(...rows.map((row) => row.length));
    const widths = tableColumnWidths(columnCount);
    const tableFontSize = columnCount >= 5 ? 7.8 : columnCount >= 4 ? 8.4 : 9.1;
    const tableLeading = tableFontSize * 1.3;
    const paddingX = 5;
    const paddingY = 7;

    y -= 4;

    rows.forEach((row, rowIndex) => {
      const normalizedRow = Array.from({ length: columnCount }, (_, index) => row[index] ?? '');
      const wrappedCells = normalizedRow.map((cell, index) =>
        wrapText(cell, Math.max(28, widths[index] - paddingX * 2), tableFontSize)
      );
      const maxLines = Math.max(...wrappedCells.map((lines) => lines.length), 1);
      const rowHeight = Math.max(24, maxLines * tableLeading + paddingY * 2);

      ensureSpace(rowHeight + 8);

      const rowTop = y;
      let x = MARGIN_X;
      const isHeader = rowIndex === 0;

      normalizedRow.forEach((_, columnIndex) => {
        const width = widths[columnIndex];
        currentPage().push({
          type: 'rect',
          x,
          y: rowTop - rowHeight,
          width,
          height: rowHeight,
          fill: isHeader ? '0.94 0.97 1.00' : undefined,
          stroke: '0.82 0.86 0.91',
        });

        const lines = wrappedCells[columnIndex];
        lines.forEach((line, lineIndex) => {
          currentPage().push({
            type: 'text',
            text: line,
            x: x + paddingX,
            y: rowTop - paddingY - tableFontSize - lineIndex * tableLeading,
            size: tableFontSize,
            font: isHeader ? 'bold' : 'regular',
          });
        });

        x += width;
      });

      y -= rowHeight;
    });

    y -= 12;
  }

  addText(title || 'Research Report', { size: 22, font: 'bold', leading: 28 });
  addText(`Generated ${new Date().toISOString().slice(0, 10)}`, { size: 9.5, font: 'italic', leading: 15 });
  addRule();

  const blocks = parseMarkdown(content || 'No report content supplied.', title || 'Research Report');

  for (const block of blocks) {
    if (block.type === 'rule') {
      addRule();
      continue;
    }

    if (block.type === 'heading') {
      const size = block.level <= 1 ? 17 : block.level === 2 ? 14 : 12;
      const before = block.level <= 2 ? 18 : 13;
      ensureSpace(before + size * 1.7);
      y -= before;
      addText(block.text, { size, font: 'bold', leading: size * 1.45 });
      y -= block.level <= 2 ? 4 : 2;
      continue;
    }

    if (block.type === 'bullet') {
      const bulletWidth = 18;
      addText(`- ${block.text}`, {
        size: 10.2,
        leading: 14.5,
        x: MARGIN_X + bulletWidth,
        width: CONTENT_WIDTH - bulletWidth,
      });
      y -= 2;
      continue;
    }

    if (block.type === 'table') {
      addTable(block.rows);
      continue;
    }

    const isPrimaryMetadata = /^(Generated|Coverage|Scope|Status|Note|Selected conditions|Monitoring conditions):/i.test(block.text);
    const isSecondaryMetadata = /^(Update|Source):/i.test(block.text);
    addText(block.text, {
      size: isPrimaryMetadata || isSecondaryMetadata ? 10 : 10.4,
      font: isPrimaryMetadata ? 'bold' : 'regular',
      leading: isPrimaryMetadata || isSecondaryMetadata ? 14 : 15.2,
    });
    y -= isPrimaryMetadata || isSecondaryMetadata ? 4 : 8;
  }

  return pages;
}

function fontName(font: FontStyle) {
  if (font === 'bold') return 'F2';
  if (font === 'italic') return 'F3';
  return 'F1';
}

function buildPdf(title: string, content: string) {
  const pages = layoutDocument(title, content);
  const objects: string[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>');

  const pageRefs: string[] = [];

  pages.forEach((pageElements, pageIndex) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(`${pageObjectNumber} 0 R`);

    const header = shortText(title || 'Research Report');
    const footer = `Page ${pageIndex + 1} of ${pages.length}`;
    const stream = [
      '0.07 0.10 0.17 rg',
      `BT /F2 8 Tf ${MARGIN_X} 760 Td (${escapePdfText(header)}) Tj ET`,
      '0.56 0.61 0.69 rg',
      `BT /F1 8 Tf ${PAGE_WIDTH - MARGIN_X - 48} 30 Td (${escapePdfText(footer)}) Tj ET`,
      '0.82 0.86 0.91 RG 0.5 w',
      `${MARGIN_X} 744 m ${PAGE_WIDTH - MARGIN_X} 744 l S`,
      ...pageElements.map((element) => {
        if (element.type === 'line') {
          return `0.82 0.86 0.91 RG 0.7 w ${element.x1} ${element.y1} m ${element.x2} ${element.y2} l S`;
        }

        if (element.type === 'rect') {
          const fill = element.fill
            ? `${element.fill} rg ${element.x} ${element.y} ${element.width} ${element.height} re f`
            : '';
          const stroke = `${element.stroke ?? '0.82 0.86 0.91'} RG 0.45 w ${element.x} ${element.y} ${element.width} ${element.height} re S`;
          return [fill, stroke].filter(Boolean).join('\n');
        }

        return [
          element.font === 'bold' ? '0.07 0.10 0.17 rg' : '0.13 0.17 0.24 rg',
          `BT /${fontName(element.font)} ${element.size} Tf ${element.x} ${element.y} Td (${escapePdfText(element.text)}) Tj ET`,
        ].join('\n');
      }),
    ].join('\n');

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? 'Research Report');
  const content = String(body.content ?? '');
  const filename = String(body.filename ?? 'research_report.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const pdf = buildPdf(title, content || 'No report content supplied.');

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
