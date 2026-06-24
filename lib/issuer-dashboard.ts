import type { EvidenceCoverage, EvidenceConfidence } from './evidence-engine';
import { sourceCandidatesFromRecord } from './research-diagnostics';

export type TrendPoint = {
  year: string;
  value: number | null;
  label: string;
};

export type FinancialTrendMetric = {
  key: string;
  label: string;
  currentValue: string;
  trend: 'Improving' | 'Stable' | 'Pressured' | 'Needs Source';
  confidence: EvidenceConfidence;
  evidence: string[];
  dataPoints: TrendPoint[];
  nextCheck: string;
};

export type RatingTimelineItem = {
  date: string;
  agency: string;
  rating: string;
  outlook: string;
  action: string;
  confidence: EvidenceConfidence;
  evidence: string[];
};

export type DebtDashboard = {
  outstandingDebt: DashboardMetric;
  callableBonds: DashboardMetric;
  upcomingMaturities: DashboardMetric;
  averageCoupon: DashboardMetric;
  spread: DashboardMetric;
};

export type DashboardMetric = {
  label: string;
  value: string;
  status: 'Available' | 'Needs Source' | 'Not Found';
  confidence: EvidenceConfidence;
  evidence: string[];
  nextCheck: string;
};

export type MarketComparable = {
  issuer: string;
  rating: string;
  spread: string;
  recentTrade: string;
  relativeValue: 'Cheap' | 'Fair' | 'Rich' | 'Needs Data';
  evidence: string[];
};

export type MarketDashboard = {
  comparableIssuers: MarketComparable[];
  benchmarkSpreads: DashboardMetric;
  recentTrades: DashboardMetric;
  relativeValue: DashboardMetric;
};

export type IssuerDashboard = {
  financialTrends: FinancialTrendMetric[];
  ratingTimeline: RatingTimelineItem[];
  debtDashboard: DebtDashboard;
  marketDashboard: MarketDashboard;
};

type SourceLike = Record<string, any>;

const FINANCIAL_DEFINITIONS = [
  {
    key: 'revenue',
    label: 'Revenue',
    patterns: [/revenue/i, /operating income/i, /sales/i],
    nextCheck: 'Extract audited operating revenue from the latest ACFR and compare against prior years.',
  },
  {
    key: 'expenses',
    label: 'Expenses',
    patterns: [/expense/i, /expenditure/i, /operating cost/i],
    nextCheck: 'Extract operating expenses/expenditures from ACFR statements and budget updates.',
  },
  {
    key: 'cash',
    label: 'Cash',
    patterns: [/cash/i, /cash and investments/i, /unrestricted cash/i],
    nextCheck: 'Verify cash and investments from audited statements and notes.',
  },
  {
    key: 'debt',
    label: 'Debt',
    patterns: [/debt/i, /bonds outstanding/i, /outstanding debt/i],
    nextCheck: 'Extract outstanding debt and debt service schedules from OS/POS and continuing disclosure.',
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
    patterns: [/liquidity/i, /reserve/i, /days cash/i, /working capital/i],
    nextCheck: 'Calculate reserve days / liquidity from unrestricted reserves and operating expenses.',
  },
  {
    key: 'capital_spending',
    label: 'Capital Spending',
    patterns: [/capital spending/i, /capital improvement/i, /\bcip\b/i, /capital plan/i, /capex/i],
    nextCheck: 'Extract capital spending and funding sources from the CIP, budget, and OS/POS.',
  },
];

const DEBT_DEFINITIONS = {
  outstandingDebt: {
    label: 'Outstanding Debt',
    patterns: [/outstanding debt/i, /debt outstanding/i, /bonds outstanding/i, /principal amount/i],
    nextCheck: 'Verify outstanding par in the latest OS/POS, EMMA annual report, or audited notes.',
  },
  callableBonds: {
    label: 'Callable Bonds',
    patterns: [/callable/i, /optional redemption/i, /call date/i, /redemption/i],
    nextCheck: 'Check OS/POS redemption provisions and bond schedules for callable maturities.',
  },
  upcomingMaturities: {
    label: 'Upcoming Maturities',
    patterns: [/maturity/i, /maturities/i, /debt service schedule/i, /principal payment/i],
    nextCheck: 'Extract the next five years of maturities from the debt service schedule.',
  },
  averageCoupon: {
    label: 'Average Coupon',
    patterns: [/coupon/i, /interest rate/i, /average coupon/i, /yield/i],
    nextCheck: 'Calculate weighted average coupon from bond maturity schedule or trade data.',
  },
  spread: {
    label: 'Spread',
    patterns: [/spread/i, /mmd/i, /benchmark/i, /basis point/i, /\bbps\b/i],
    nextCheck: 'Pull benchmark spread from market data, trade prints, or comparable bond table.',
  },
};

function clean(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sourceTitle(source: SourceLike) {
  return clean(source.title || source.document || source.document_title || source.source_title || source.url || source.source_url);
}

function sourceUrl(source: SourceLike) {
  return clean(source.url || source.source_url);
}

function sourceText(source: SourceLike) {
  return [
    sourceTitle(source),
    source.documentType,
    source.document_type,
    source.type,
    source.snippet,
    source.notes,
    source.claim,
    source.sourceTier,
    source.source_tier,
  ].map(clean).filter(Boolean).join(' ');
}

function lineText(record: SourceLike | null | undefined, content: string) {
  const evidencePackage = record?.evidencePackage ?? {};
  const rawNotes = Array.isArray(evidencePackage.raw_evidence_notes)
    ? evidencePackage.raw_evidence_notes.map((item: any) => clean(item.claim || item.notes || item.source_title))
    : [];
  const sourceLines = sourceCandidatesFromRecord(record ?? {}).map(sourceText);

  return [
    content,
    record?.snippet,
    ...(Array.isArray(record?.facts) ? record.facts : []),
    ...rawNotes,
    ...sourceLines,
  ]
    .map(clean)
    .join('\n');
}

function splitLines(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\*\*/g, '').replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter((line) => line.length >= 12);
}

function matchPatterns(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function unique(items: string[], limit: number) {
  const seen = new Set<string>();

  return items
    .map(clean)
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function evidenceFor(record: SourceLike | null | undefined, evidenceEngine: EvidenceCoverage | null | undefined, patterns: RegExp[], limit = 4) {
  const citationEvidence = (evidenceEngine?.citations ?? [])
    .filter((citation) => matchPatterns([
      citation.statement,
      citation.document,
      citation.section,
      citation.source,
    ].map(clean).join(' '), patterns))
    .map((citation) => {
      const page = citation.page && citation.page !== 'N/A' ? `, page ${citation.page}` : '';
      return `${citation.document || citation.source}${page} (${citation.confidence})`;
    });
  const sourceEvidence = sourceCandidatesFromRecord(record ?? {})
    .filter((source) => matchPatterns(sourceText(source), patterns))
    .map((source) => {
      const title = sourceTitle(source);
      const url = sourceUrl(source);
      return url ? `${title} (${url})` : title;
    });

  return unique([...citationEvidence, ...sourceEvidence], limit);
}

function confidenceFromEvidence(evidence: string[], lineMatches: string[]): EvidenceConfidence {
  if (evidence.some((item) => /\(High\)|Tier 1|emma|msrb|audited|official statement|rating/i.test(item))) return 'High';
  if (evidence.length > 0 || lineMatches.length > 0) return 'Medium';
  return 'Low';
}

function moneyValue(raw: string) {
  const match = raw.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(billion|million|bn|mm|m)?/i);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'billion' || unit === 'bn') return base * 1_000_000_000;
  if (unit === 'million' || unit === 'mm' || unit === 'm') return base * 1_000_000;
  return base;
}

function formatValue(value: number | null) {
  if (value === null) return 'Not found';
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

function yearFromLine(line: string) {
  return line.match(/\b(20\d{2}|19\d{2})\b/)?.[1] || 'Current';
}

function trendFromPoints(points: TrendPoint[], evidence: string[]) {
  const numeric = points.filter((point) => point.value !== null) as Array<TrendPoint & { value: number }>;
  if (numeric.length < 2) return evidence.length > 0 ? 'Stable' as const : 'Needs Source' as const;
  const first = numeric[0].value;
  const last = numeric[numeric.length - 1].value;
  if (last > first * 1.05) return 'Improving' as const;
  if (last < first * 0.95) return 'Pressured' as const;
  return 'Stable' as const;
}

function financialTrends(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): FinancialTrendMetric[] {
  const lines = splitLines(lineText(record, content));

  return FINANCIAL_DEFINITIONS.map((definition) => {
    const matchedLines = lines.filter((line) => matchPatterns(line, definition.patterns)).slice(0, 8);
    const dataPoints = matchedLines
      .map((line) => ({
        year: yearFromLine(line),
        value: moneyValue(line),
        label: line,
      }))
      .filter((point) => point.value !== null || /\d/.test(point.label))
      .slice(0, 5);
    const evidence = evidenceFor(record, evidenceEngine, definition.patterns, 4);
    const latest = [...dataPoints].reverse().find((point) => point.value !== null) ?? dataPoints[0];

    return {
      key: definition.key,
      label: definition.label,
      currentValue: latest ? formatValue(latest.value) : 'Not found',
      trend: trendFromPoints(dataPoints, evidence),
      confidence: confidenceFromEvidence(evidence, matchedLines),
      evidence,
      dataPoints: dataPoints.length > 0 ? dataPoints : [{ year: 'Needs source', value: null, label: definition.nextCheck }],
      nextCheck: definition.nextCheck,
    };
  });
}

function extractRating(line: string) {
  return line.match(/\b(Aaa|Aa[1-3]?|A[1-3]?|Baa[1-3]?|BBB[+-]?|BB[+-]?|AAA|AA[+-]?|A[+-]?)\b/)?.[1] || 'Rating not found';
}

function ratingAgency(line: string) {
  if (/moody/i.test(line)) return "Moody's";
  if (/s&p|standard\s*&\s*poor/i.test(line)) return 'S&P';
  if (/fitch/i.test(line)) return 'Fitch';
  if (/kbra|kroll/i.test(line)) return 'KBRA';
  return 'Agency not found';
}

function ratingOutlook(line: string) {
  return line.match(/\b(stable|positive|negative|developing|watch|outlook)\b/i)?.[0] || 'Outlook not found';
}

function ratingTimeline(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): RatingTimelineItem[] {
  const patterns = [/rating/i, /outlook/i, /moody/i, /s&p/i, /fitch/i, /kbra/i, /upgrade/i, /downgrade/i];
  const lines = splitLines(lineText(record, content)).filter((line) => matchPatterns(line, patterns));

  const items = lines.slice(0, 6).map((line) => {
    const evidence = evidenceFor(record, evidenceEngine, patterns, 3);

    return {
      date: yearFromLine(line),
      agency: ratingAgency(line),
      rating: extractRating(line),
      outlook: ratingOutlook(line),
      action: /upgrade/i.test(line) ? 'Upgrade' : /downgrade/i.test(line) ? 'Downgrade' : /affirm/i.test(line) ? 'Affirmed' : 'Rating / outlook reference',
      confidence: confidenceFromEvidence(evidence, [line]),
      evidence,
    };
  });

  return items.length > 0 ? items : [{
    date: 'Not found',
    agency: 'Not found',
    rating: 'Not found',
    outlook: 'Not found',
    action: 'No rating action surfaced in this run.',
    confidence: 'Low',
    evidence: [],
  }];
}

function dashboardMetric(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined, definition: { label: string; patterns: RegExp[]; nextCheck: string }): DashboardMetric {
  const lines = splitLines(lineText(record, content)).filter((line) => matchPatterns(line, definition.patterns));
  const evidence = evidenceFor(record, evidenceEngine, definition.patterns, 4);
  const valueLine = lines.find((line) => /\$|\d/.test(line));
  const value = valueLine ? (formatValue(moneyValue(valueLine)) !== 'Not found' ? formatValue(moneyValue(valueLine)) : valueLine.slice(0, 96)) : 'Not found';

  return {
    label: definition.label,
    value,
    status: evidence.length > 0 || valueLine ? 'Available' : 'Needs Source',
    confidence: confidenceFromEvidence(evidence, lines),
    evidence,
    nextCheck: definition.nextCheck,
  };
}

function debtDashboard(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): DebtDashboard {
  return {
    outstandingDebt: dashboardMetric(record, content, evidenceEngine, DEBT_DEFINITIONS.outstandingDebt),
    callableBonds: dashboardMetric(record, content, evidenceEngine, DEBT_DEFINITIONS.callableBonds),
    upcomingMaturities: dashboardMetric(record, content, evidenceEngine, DEBT_DEFINITIONS.upcomingMaturities),
    averageCoupon: dashboardMetric(record, content, evidenceEngine, DEBT_DEFINITIONS.averageCoupon),
    spread: dashboardMetric(record, content, evidenceEngine, DEBT_DEFINITIONS.spread),
  };
}

function comparableIssuers(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): MarketComparable[] {
  const patterns = [/comparable/i, /peer/i, /benchmark/i, /mmd/i, /spread/i, /trade/i, /relative value/i];
  const lines = splitLines(lineText(record, content)).filter((line) => matchPatterns(line, patterns));
  const evidence = evidenceFor(record, evidenceEngine, patterns, 4);
  const issuerMatches = lines
    .flatMap((line) => line.match(/\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4}\s+(?:CCD|USD|Water|Power|Authority|District|City|County)\b/g) ?? [])
    .slice(0, 5);
  const issuers = unique(issuerMatches, 5);

  if (issuers.length === 0) {
    return [{
      issuer: 'Comparable issuers not found',
      rating: 'Not found',
      spread: 'Not found',
      recentTrade: 'Not found',
      relativeValue: 'Needs Data',
      evidence,
    }];
  }

  return issuers.map((issuer) => ({
    issuer,
    rating: lines.find((line) => line.includes(issuer)) ? extractRating(lines.find((line) => line.includes(issuer)) || '') : 'Not found',
    spread: lines.find((line) => /spread|mmd|bps/i.test(line))?.slice(0, 80) || 'Not found',
    recentTrade: lines.find((line) => /trade|recent/i.test(line))?.slice(0, 80) || 'Not found',
    relativeValue: /cheap|wide/i.test(lines.join(' ')) ? 'Cheap' : /rich|tight/i.test(lines.join(' ')) ? 'Rich' : /fair|inline/i.test(lines.join(' ')) ? 'Fair' : 'Needs Data',
    evidence,
  }));
}

function marketDashboard(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): MarketDashboard {
  return {
    comparableIssuers: comparableIssuers(record, content, evidenceEngine),
    benchmarkSpreads: dashboardMetric(record, content, evidenceEngine, {
      label: 'Benchmark Spreads',
      patterns: [/benchmark/i, /mmd/i, /spread/i, /\bbps\b/i],
      nextCheck: 'Pull MMD/benchmark spread data and match by rating, sector, maturity, and security type.',
    }),
    recentTrades: dashboardMetric(record, content, evidenceEngine, {
      label: 'Recent Trades',
      patterns: [/recent trade/i, /trade/i, /tradeweb/i, /emma trade/i],
      nextCheck: 'Pull recent EMMA trade prints or market data for comparable maturities.',
    }),
    relativeValue: dashboardMetric(record, content, evidenceEngine, {
      label: 'Relative Value',
      patterns: [/relative value/i, /cheap/i, /rich/i, /fair value/i, /wide/i, /tight/i],
      nextCheck: 'Compare issuer spread against rating/sector peers and benchmark curves.',
    }),
  };
}

export function buildIssuerDashboard(
  record: SourceLike | null | undefined,
  content: string,
  evidenceEngine?: EvidenceCoverage | null
): IssuerDashboard {
  return {
    financialTrends: financialTrends(record, content, evidenceEngine),
    ratingTimeline: ratingTimeline(record, content, evidenceEngine),
    debtDashboard: debtDashboard(record, content, evidenceEngine),
    marketDashboard: marketDashboard(record, content, evidenceEngine),
  };
}
