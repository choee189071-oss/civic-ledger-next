import { sourceCandidatesFromRecord } from './research-diagnostics';

export type EvidenceConfidence = 'High' | 'Medium' | 'Low';

export type EvidenceCitation = {
  id: string;
  statement: string;
  source: string;
  document: string;
  page: string;
  section: string;
  confidence: EvidenceConfidence;
  url?: string;
  citationUrl?: string;
  highlightedText?: string;
  sourceTier?: string;
  documentType?: string;
  reason: string;
};

export type EvidenceCoverage = {
  coveragePercent: number;
  confidence: EvidenceConfidence;
  citationCount: number;
  totalStatements: number;
  missingStatements: number;
  warning: string | null;
  citations: EvidenceCitation[];
  missingEvidence: string[];
};

type SourceLike = Record<string, any>;

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'issuer',
  'source',
  'report',
  'found',
  'not',
  'are',
  'was',
  'were',
  'has',
  'have',
  'will',
  'should',
  'would',
  'could',
  'than',
  'then',
  'their',
  'there',
  'these',
  'those',
  'about',
  'when',
  'where',
  'which',
  'what',
]);

function clean(value: any) {
  return String(value ?? '').trim();
}

function cleanMarkdown(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value: string) {
  return cleanMarkdown(value).toLowerCase().replace(/[^a-z0-9$%.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function firstValue(source: SourceLike, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function sourceTitle(source: SourceLike) {
  return firstValue(source, ['title', 'document', 'document_title', 'source_title', 'name', 'url', 'source_url']) || 'Source candidate';
}

function sourceUrl(source: SourceLike) {
  return firstValue(source, ['url', 'source_url']);
}

function sourceTier(source: SourceLike) {
  return firstValue(source, ['sourceTier', 'source_tier', 'tier']);
}

function documentType(source: SourceLike) {
  return firstValue(source, ['documentType', 'document_type', 'type']) || 'Document';
}

function sourceNotes(source: SourceLike) {
  return [
    firstValue(source, ['snippet']),
    firstValue(source, ['notes']),
    firstValue(source, ['claim']),
    firstValue(source, ['reason']),
  ].filter(Boolean).join(' ');
}

function sourceText(source: SourceLike) {
  return [
    sourceTitle(source),
    documentType(source),
    sourceTier(source),
    sourceUrl(source),
    sourceNotes(source),
  ].filter(Boolean).join(' ');
}

function sourcePage(source: SourceLike) {
  const explicit = firstValue(source, ['page', 'pageNumber', 'page_number', 'page_start', 'start_page']);
  if (explicit) return explicit;

  const match = sourceText(source).match(/\b(?:p\.?|page)\s*(\d{1,4})\b/i);
  return match?.[1] ?? 'N/A';
}

function sourceSection(source: SourceLike, statement: string) {
  const explicit = firstValue(source, ['section', 'section_title', 'sectionTitle']);
  if (explicit) return explicit;

  const text = `${statement} ${sourceText(source)}`.toLowerCase();
  if (/rate covenant|additional bonds|debt service coverage|\bdsc\b/.test(text)) return 'Debt service coverage and covenants';
  if (/official statement|preliminary official statement|\bpos\b|security|pledge|revenue bond/.test(text)) return 'Official statement / security';
  if (/annual comprehensive financial report|\bacfr\b|audited financial|financial statements|mda|md&a/.test(text)) return 'ACFR / audited financials';
  if (/emma|msrb|continuing disclosure|annual report|event notice/.test(text)) return 'EMMA / continuing disclosure';
  if (/rating|outlook|moody|s&p|fitch|kbra|kroll/.test(text)) return 'Ratings';
  if (/board|agenda|minutes|packet|resolution|rfp/.test(text)) return 'Board materials';
  if (/budget|capital improvement|\bcip\b|capital plan/.test(text)) return 'Budget / capital plan';
  if (/risk|litigation|wildfire|regulatory|rate increase/.test(text)) return 'Risk monitoring';
  return documentType(source);
}

function hashId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function isPdfUrl(url: string) {
  return /\.pdf(?:[?#]|$)/i.test(url);
}

function citationUrl(url: string, page: string, highlightedText: string) {
  if (!url) return undefined;
  if (!isPdfUrl(url)) return url;

  const parts: string[] = [];
  if (page && page !== 'N/A') parts.push(`page=${encodeURIComponent(page)}`);
  if (highlightedText) parts.push(`search=${encodeURIComponent(highlightedText.slice(0, 80))}`);

  return parts.length > 0 ? `${url}#${parts.join('&')}` : url;
}

function evidenceConfidence(score: number, source: SourceLike, page: string): EvidenceConfidence {
  const tier = sourceTier(source).toLowerCase();
  if (score >= 12 && (/tier\s*1/.test(tier) || page !== 'N/A')) return 'High';
  if (score >= 8 || /tier\s*[12]/.test(tier)) return /tier\s*1/.test(tier) ? 'High' : 'Medium';
  return 'Low';
}

function statementSection(statement: string) {
  const text = statement.toLowerCase();
  if (/executive summary|bottom line|recommendation/.test(text)) return 'Executive summary';
  if (/strength|advantage|credit positive/.test(text)) return 'Credit strengths';
  if (/risk|weakness|negative|challenge/.test(text)) return 'Credit risks';
  if (/financial|revenue|expense|liquidity|coverage|cash/.test(text)) return 'Financial performance';
  if (/debt|bond|covenant|additional bonds|rate covenant/.test(text)) return 'Debt profile';
  if (/missing|not found|manual verification|insufficient/.test(text)) return 'Missing information';
  if (/source|citation|evidence/.test(text)) return 'Source coverage';
  return 'Analysis';
}

function isNonStatement(value: string) {
  const text = cleanMarkdown(value);
  if (text.length < 24) return true;
  if (/^\|?\s*-{3,}/.test(text)) return true;
  if (/^(field|value|source|document|type|date|status|notes)$/i.test(text)) return true;
  if (/^#+\s/.test(value.trim())) return true;
  return false;
}

export function extractEvidenceStatements(content: string, limit = 80) {
  const statements: string[] = [];
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('|') && line.endsWith('|')) {
      if (/^\|\s*-+/.test(line)) continue;
      const cells = line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cleanMarkdown(cell))
        .filter(Boolean);
      const tableStatement = cells.join(' - ');
      if (!isNonStatement(tableStatement)) statements.push(tableStatement);
      continue;
    }

    const item = cleanMarkdown(line.replace(/^\d+\.\s+/, '').replace(/^[-*]\s+/, ''));
    if (isNonStatement(item)) continue;

    if (item.length > 260) {
      const chunks = item.split(/;\s+|\. /).map((chunk) => cleanMarkdown(chunk)).filter((chunk) => chunk.length >= 36);
      statements.push(...(chunks.length > 1 ? chunks.slice(0, 3) : [item]));
    } else {
      statements.push(item);
    }
  }

  const seen = new Set<string>();
  return statements.filter((statement) => {
    const key = normalize(statement);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function syntheticDiagnosticSources(record: SourceLike) {
  const packageData = record?.evidencePackage ?? {};
  const missingItems = Array.isArray(packageData.missing_items) ? packageData.missing_items : [];
  const coverage = packageData.coverage_dashboard && typeof packageData.coverage_dashboard === 'object'
    ? Object.entries(packageData.coverage_dashboard).map(([key, value]: [string, any]) => `${key}: ${value?.status ?? value}`)
    : [];
  const diagnostics = [
    ...(Array.isArray(record?.facts) ? record.facts : []),
    ...missingItems,
    ...coverage,
  ].filter(Boolean);

  if (diagnostics.length === 0) return [];

  return [{
    title: 'Research diagnostics and coverage dashboard',
    document: 'Research diagnostics and coverage dashboard',
    documentType: 'Diagnostic record',
    sourceTier: 'Tier 2',
    status: 'Used in Report',
    confidenceTier: 'Medium',
    notes: diagnostics.join(' '),
  }];
}

function uniqueSources(record: SourceLike) {
  const packageData = record?.evidencePackage ?? {};
  const rawEvidence = Array.isArray(packageData.raw_evidence_notes)
    ? packageData.raw_evidence_notes.map((item: any) => ({
      title: item.source_title,
      url: item.source_url,
      sourceTier: item.source_tier,
      documentType: item.document_type,
      confidenceTier: item.confidence,
      notes: item.claim,
    }))
    : [];
  const citationUrls = Array.isArray(record?.citations)
    ? record.citations.map((url: string) => ({ title: url, url, documentType: 'Citation URL', sourceTier: 'Unclassified' }))
    : [];
  const candidates = [
    ...sourceCandidatesFromRecord(record),
    ...rawEvidence,
    ...citationUrls,
    ...syntheticDiagnosticSources(record),
  ];
  const seen = new Set<string>();

  return candidates.filter((source) => {
    const key = `${sourceUrl(source)}|${sourceTitle(source)}`.toLowerCase();
    if (!key || key === '|' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreSource(statement: string, source: SourceLike) {
  const statementTokens = new Set(tokens(statement));
  const sourceTokens = new Set(tokens(sourceText(source)));
  let overlap = 0;

  statementTokens.forEach((token) => {
    if (sourceTokens.has(token)) overlap += 1;
  });

  const text = `${statement} ${sourceText(source)}`.toLowerCase();
  const tier = sourceTier(source).toLowerCase();
  let score = overlap;

  if (/tier\s*1/.test(tier)) score += 4;
  else if (/tier\s*2/.test(tier)) score += 2;

  if (/missing|not found|manual verification|insufficient/.test(statement.toLowerCase()) &&
      /diagnostic|missing|not found|manual|coverage/.test(sourceText(source).toLowerCase())) {
    score += 8;
  }
  if (/acfr|audited financial|financial statement/.test(text)) score += 3;
  if (/official statement|pos|bond|debt|covenant/.test(text)) score += 3;
  if (/emma|msrb|continuing disclosure/.test(text)) score += 3;
  if (/rating|moody|fitch|kbra|s&p/.test(text)) score += 2;

  return score;
}

function bestSourceFor(statement: string, sources: SourceLike[]) {
  const ranked = sources
    .map((source) => ({ source, score: scoreSource(statement, source) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];

  if (!best || best.score < 5) return null;
  return best;
}

export function buildEvidenceEngine(record: SourceLike | null | undefined, content: string): EvidenceCoverage {
  const statements = extractEvidenceStatements(content);
  const sources = uniqueSources(record ?? {});
  const citations: EvidenceCitation[] = [];
  const missingEvidence: string[] = [];

  statements.forEach((statement, index) => {
    const best = bestSourceFor(statement, sources);

    if (!best) {
      missingEvidence.push(statement);
      return;
    }

    const page = sourcePage(best.source);
    const highlightedText = cleanMarkdown(statement).slice(0, 180);
    const url = sourceUrl(best.source);
    const confidence = evidenceConfidence(best.score, best.source, page);
    const source = sourceTitle(best.source);
    const document = firstValue(best.source, ['document', 'document_title', 'title', 'source_title']) || source;

    citations.push({
      id: `ev-${index + 1}-${hashId(statement)}`,
      statement,
      source,
      document,
      page,
      section: sourceSection(best.source, statement) || statementSection(statement),
      confidence,
      url,
      citationUrl: citationUrl(url, page, highlightedText),
      highlightedText,
      sourceTier: sourceTier(best.source) || 'Unclassified',
      documentType: documentType(best.source),
      reason: best.score >= 10
        ? 'Matched to source metadata, document type, and evidence text.'
        : 'Matched to the best available source candidate; analyst review recommended.',
    });
  });

  const totalStatements = Math.max(statements.length, citations.length + missingEvidence.length);
  const coveragePercent = totalStatements > 0 ? Math.round((citations.length / totalStatements) * 100) : 0;
  const highCount = citations.filter((citation) => citation.confidence === 'High').length;
  const mediumCount = citations.filter((citation) => citation.confidence === 'Medium').length;
  const confidence: EvidenceConfidence = coveragePercent >= 85 && highCount >= Math.ceil(citations.length * 0.45)
    ? 'High'
    : coveragePercent >= 60 && (highCount + mediumCount) >= Math.ceil(citations.length * 0.6)
      ? 'Medium'
      : 'Low';

  return {
    coveragePercent,
    confidence,
    citationCount: citations.length,
    totalStatements,
    missingStatements: missingEvidence.length,
    warning: missingEvidence.length > 0
      ? `${missingEvidence.length} AI statement${missingEvidence.length === 1 ? '' : 's'} lack direct evidence mapping. Treat them as draft language until a source, page, or reviewer note is attached.`
      : null,
    citations,
    missingEvidence,
  };
}
