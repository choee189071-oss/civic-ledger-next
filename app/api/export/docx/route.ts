import { NextResponse } from 'next/server';
import { cleanExportInline, normalizeExportText } from '@/lib/export-formatting';

export const runtime = 'nodejs';

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'rule' };

function normalizeText(value: string) {
  return normalizeExportText(value);
}

function escapeXml(value: string) {
  return normalizeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanInline(value: string) {
  return cleanExportInline(value)
    .replace(/\s+/g, ' ')
    .trim();
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
        .map((cell) => cleanInline(cell))
    )
    .filter((row) => row.length > 1);
}

function parseMarkdown(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = normalizeText(content).split('\n');
  let paragraph: string[] = [];
  let tableLines: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  }

  function flushTable() {
    if (tableLines.length > 0) {
      const rows = parseTableLines(tableLines);
      if (rows.length > 0) {
        blocks.push({ type: 'table', rows });
      }
      tableLines = [];
    }
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
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: cleanInline(heading[2]) });
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      blocks.push({ type: 'bullet', text: cleanInline(listItem[1]) });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushTable();
  return blocks;
}

function paragraphXml(text: string, style = 'Normal') {
  return [
    '<w:p>',
    `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`,
    '<w:r>',
    '<w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr>',
    `<w:t xml:space="preserve">${escapeXml(cleanInline(text))}</w:t>`,
    '</w:r>',
    '</w:p>',
  ].join('');
}

function headingXml(text: string, level: number) {
  const style = level <= 1 ? 'Title' : level === 2 ? 'Heading1' : 'Heading2';
  return paragraphXml(text, style);
}

function bulletXml(text: string) {
  return [
    '<w:p>',
    '<w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="720" w:hanging="360"/></w:pPr>',
    '<w:r><w:t>- </w:t></w:r>',
    '<w:r>',
    '<w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr>',
    `<w:t xml:space="preserve">${escapeXml(cleanInline(text))}</w:t>`,
    '</w:r>',
    '</w:p>',
  ].join('');
}

function tableCellXml(text: string, width: number, header = false) {
  const runStyle = header
    ? '<w:rPr><w:b/><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/><w:color w:val="344054"/></w:rPr>'
    : '<w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="19"/></w:rPr>';

  return [
    '<w:tc>',
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>`,
    '<w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>',
    header ? '<w:shd w:fill="EEF6FF"/>' : '',
    '</w:tcPr>',
    '<w:p>',
    '<w:r>',
    runStyle,
    `<w:t xml:space="preserve">${escapeXml(cleanInline(text))}</w:t>`,
    '</w:r>',
    '</w:p>',
    '</w:tc>',
  ].join('');
}

function tableColumnWidths(columnCount: number) {
  const usableWidth = 9360;

  if (columnCount <= 1) return [usableWidth];
  if (columnCount === 2) return [3200, usableWidth - 3200];
  if (columnCount === 3) return [2500, 2100, usableWidth - 4600];
  if (columnCount === 4) return [2300, 1700, 1700, usableWidth - 5700];
  if (columnCount === 5) return [2700, 1350, 1250, 2400, usableWidth - 7700];

  const width = Math.floor(usableWidth / columnCount);
  return Array.from({ length: columnCount }, () => width);
}

function tableXml(rows: string[][]) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths = tableColumnWidths(columnCount);
  const body = rows.map((row, rowIndex) => [
    '<w:tr>',
    ...Array.from({ length: columnCount }, (_, index) => tableCellXml(row[index] ?? '', widths[index], rowIndex === 0)),
    '</w:tr>',
  ].join('')).join('');

  return [
    '<w:tbl>',
    '<w:tblPr>',
    '<w:tblW w:w="9360" w:type="dxa"/>',
    '<w:tblLayout w:type="fixed"/>',
    '<w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>',
    '<w:tblBorders>',
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/>',
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/>',
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/>',
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/>',
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/>',
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/>',
    '</w:tblBorders>',
    '</w:tblPr>',
    '<w:tblGrid>',
    ...widths.map((width) => `<w:gridCol w:w="${width}"/>`),
    '</w:tblGrid>',
    body,
    '</w:tbl>',
  ].join('');
}

function ruleXml() {
  return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="D0D7E2"/></w:pBdr></w:pPr></w:p>';
}

function documentXml(title: string, content: string) {
  const blocks = parseMarkdown(content || 'No report content supplied.');
  const body = [
    headingXml(title || 'Research Report', 1),
    paragraphXml(`Generated ${new Date().toISOString().slice(0, 10)}`, 'Subtitle'),
    ruleXml(),
    ...blocks.map((block) => {
      if (block.type === 'heading') return headingXml(block.text, block.level + 1);
      if (block.type === 'bullet') return bulletXml(block.text);
      if (block.type === 'table') return tableXml(block.rows);
      if (block.type === 'rule') return ruleXml();
      return paragraphXml(block.text);
    }),
  ].join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:body>',
    body,
    '<w:sectPr>',
    '<w:pgSz w:w="12240" w:h="15840"/>',
    '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>',
    '</w:sectPr>',
    '</w:body>',
    '</w:document>',
  ].join('');
}

function stylesXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="101828"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="667085"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="101828"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="1F2937"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>',
    '</w:styles>',
  ].join('');
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, dosDate };
}

function localHeader(name: string, data: Buffer) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(30);
  const { time, dosDate } = dosDateTime();
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer, data]);
}

function centralHeader(name: string, data: Buffer, offset: number) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(46);
  const { time, dosDate } = dosDateTime();
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(dosDate, 14);
  header.writeUInt32LE(crc32(data), 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function zip(files: Array<{ name: string; content: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const data = Buffer.from(file.content, 'utf8');
    const local = localHeader(file.name, data);
    localParts.push(local);
    centralParts.push(centralHeader(file.name, data, offset));
    offset += local.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, end]);
}

function buildDocx(title: string, content: string) {
  return zip([
    {
      name: '[Content_Types].xml',
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
        '</Types>',
      ].join(''),
    },
    {
      name: '_rels/.rels',
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
        '</Relationships>',
      ].join(''),
    },
    { name: 'word/document.xml', content: documentXml(title, content) },
    { name: 'word/styles.xml', content: stylesXml() },
  ]);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? 'Research Report');
  const content = String(body.content ?? '');
  const filename = String(body.filename ?? 'research_report.docx').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const docx = buildDocx(title, content || 'No report content supplied.');

  return new NextResponse(docx, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
