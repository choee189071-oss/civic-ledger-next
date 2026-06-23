function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInline(value: string) {
  const links: string[] = [];
  const withLinkPlaceholders = value.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_match, label, href) => {
    const index = links.push(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`) - 1;
    return `__LINK_${index}__`;
  });

  return escapeHtml(withLinkPlaceholders)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/__LINK_(\d+)__/g, (_match, index) => links[Number(index)] ?? '');
}

function closeList(html: string[], listType: 'ul' | 'ol' | null) {
  if (listType) html.push(`</${listType}>`);
  return null;
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${formatInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      listType = closeList(html, listType);
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      flushParagraph();
      listType = closeList(html, listType);
      html.push('<hr>');
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      listType = closeList(html, listType);
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (ordered || unordered) {
      flushParagraph();
      const nextListType = ordered ? 'ol' : 'ul';
      if (listType !== nextListType) {
        listType = closeList(html, listType);
        html.push(`<${nextListType}>`);
        listType = nextListType;
      }
      html.push(`<li>${formatInline((ordered || unordered)?.[1] ?? '')}</li>`);
      continue;
    }

    listType = closeList(html, listType);
    paragraph.push(line);
  }

  flushParagraph();
  closeList(html, listType);
  return html.join('\n');
}

export function htmlDocumentFromMarkdown(markdown: string, title: string) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'body{font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.55;max-width:820px;margin:36px auto;padding:0 28px;}',
    'h1{font-size:28px;line-height:1.15;margin:0 0 18px;color:#101828;}',
    'h2{font-size:20px;margin:28px 0 10px;color:#101828;border-bottom:1px solid #dbe3ef;padding-bottom:7px;}',
    'h3{font-size:16px;margin:22px 0 8px;color:#1f2937;}',
    'p{font-size:11.5pt;margin:0 0 12px;}',
    'ul,ol{margin:0 0 14px 22px;padding:0;}',
    'li{margin:0 0 6px;font-size:11.5pt;}',
    'a{color:#0b65a3;text-decoration:none;}',
    'strong{color:#111827;}',
    'code{font-family:Consolas,monospace;background:#f2f5f9;padding:1px 4px;border-radius:4px;}',
    'hr{border:0;border-top:1px solid #dbe3ef;margin:22px 0;}',
    '</style>',
    '</head>',
    '<body>',
    markdownToHtml(markdown),
    '</body>',
    '</html>',
  ].join('');
}
