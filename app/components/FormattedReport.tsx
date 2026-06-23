type Props = {
  content: string;
  compact?: boolean;
};

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; rows: string[][] };

function cleanInline(value: string) {
  return value.trim().replace(/^\*\*(.*)\*\*$/, '$1');
}

function inlineParts(value: string) {
  const parts: Array<{ text: string; strong?: boolean; href?: string }> = [];
  const pattern = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index) });
    }

    const token = match[0];

    if (token.startsWith('**')) {
      parts.push({ text: token.slice(2, -2), strong: true });
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (link) {
        parts.push({ text: link[1], href: link[2] });
      }
    } else {
      parts.push({ text: token, href: token });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex) });
  }

  return parts;
}

function renderInline(value: string) {
  return inlineParts(value).map((part, index) => {
    if (part.href) {
      return (
        <a key={`${part.href}-${index}`} href={part.href} target="_blank" rel="noreferrer">
          {part.text}
        </a>
      );
    }

    if (part.strong) {
      return <strong key={`${part.text}-${index}`}>{part.text}</strong>;
    }

    return <span key={`${part.text}-${index}`}>{part.text}</span>;
  });
}

function renderHeading(level: number, text: string, index: number) {
  const content = renderInline(text);
  const key = `${text}-${index}`;

  if (level <= 2) {
    return <h2 key={key}>{content}</h2>;
  }

  if (level === 3) {
    return <h3 key={key}>{content}</h3>;
  }

  return <h4 key={key}>{content}</h4>;
}

function parseTable(lines: string[]) {
  return lines
    .filter((line) => !/^\|\s*-+/.test(line))
    .map((line) =>
      line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cleanInline(cell))
    )
    .filter((row) => row.length > 1);
}

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let tableLines: string[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  }

  function flushList() {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  }

  function flushTable() {
    if (tableLines.length > 0) {
      const rows = parseTable(tableLines);
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
      flushList();
      flushTable();
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      flushParagraph();
      flushList();
      tableLines.push(line);
      continue;
    }

    flushTable();

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length, text: cleanInline(heading[2]) });
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);

    if (ordered || unordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const item = cleanInline((ordered || unordered)?.[1] ?? '');

      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }

      list.items.push(item);
      continue;
    }

    flushList();
    paragraph.push(cleanInline(line));
  }

  flushParagraph();
  flushList();
  flushTable();

  return blocks;
}

export function FormattedReport({ content, compact = false }: Props) {
  const blocks = parseBlocks(content || '');

  return (
    <div className={`formatted-report ${compact ? 'compact' : ''}`}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const level = Math.min(Math.max(block.level, 2), 4);
          return renderHeading(level, block.text, index);
        }

        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag key={`list-${index}`}>
              {block.items.map((item) => (
                <li key={item}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }

        if (block.type === 'table') {
          const [head, ...body] = block.rows;
          return (
            <div key={`table-${index}`} className="formatted-table-wrap">
              <table>
                <thead>
                  <tr>
                    {head.map((cell) => (
                      <th key={cell}>{renderInline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${cell}-${cellIndex}`}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={`${block.text}-${index}`}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}
