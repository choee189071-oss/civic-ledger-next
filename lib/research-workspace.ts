import type { EvidenceCoverage, EvidenceCitation, EvidenceConfidence } from './evidence-engine';
import { sourceCandidatesFromRecord } from './research-diagnostics';

export type WorkspaceSummary = {
  strengths: string[];
  weaknesses: string[];
  keyMetrics: string[];
  creditDrivers: string[];
  risks: string[];
  outlook: string;
  evidence: string[];
};

export type CreditFactor = {
  key: string;
  label: string;
  status: 'Supported' | 'Needs Evidence' | 'Not Surfaced';
  confidence: EvidenceConfidence;
  summary: string;
  evidenceCount: number;
  evidence: string[];
  gaps: string[];
};

export type KeyRisk = {
  key: string;
  label: string;
  level: 'Elevated' | 'Watch' | 'No Current Signal' | 'Needs Evidence';
  confidence: EvidenceConfidence;
  summary: string;
  evidenceCount: number;
  evidence: string[];
  nextCheck: string;
};

export type ResearchWorkspace = {
  executiveSummary: WorkspaceSummary;
  creditFactors: CreditFactor[];
  keyRisks: KeyRisk[];
};

type SourceLike = Record<string, any>;

const CREDIT_FACTOR_DEFINITIONS = [
  {
    key: 'business_profile',
    label: 'Business Profile',
    patterns: [/service area/i, /customer/i, /enterprise/i, /system/i, /market position/i, /essential service/i],
    gap: 'Issuer profile, service-area description, customer base, enterprise/system overview.',
  },
  {
    key: 'financial_profile',
    label: 'Financial Profile',
    patterns: [/financial/i, /revenue/i, /expense/i, /margin/i, /net position/i, /acfr/i, /audited/i],
    gap: 'Latest ACFR/audited financial statements and financial trend table.',
  },
  {
    key: 'debt_profile',
    label: 'Debt Profile',
    patterns: [/debt/i, /bond/i, /official statement/i, /\bpos\b/i, /debt service/i, /cusip/i],
    gap: 'Latest OS/POS, debt schedule, outstanding debt, CUSIP, and EMMA filing detail.',
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
    patterns: [/liquidity/i, /cash/i, /reserve/i, /days cash/i, /unrestricted/i, /working capital/i],
    gap: 'Cash, unrestricted reserves, days cash, and reserve-policy evidence.',
  },
  {
    key: 'governance',
    label: 'Governance',
    patterns: [/governance/i, /board/i, /management/i, /policy/i, /covenant/i, /resolution/i],
    gap: 'Board actions, policies, rate covenant evidence, and management discussion.',
  },
  {
    key: 'operating_performance',
    label: 'Operating Performance',
    patterns: [/operating/i, /coverage/i, /dsc/i, /demand/i, /sales/i, /expense/i, /performance/i],
    gap: 'Operating revenue/expense trends, DSC, demand, and performance metrics.',
  },
  {
    key: 'capital_program',
    label: 'Capital Program',
    patterns: [/capital/i, /\bcip\b/i, /improvement/i, /infrastructure/i, /construction/i, /funding/i],
    gap: 'Capital improvement plan, budget, funding sources, and project schedule.',
  },
];

const RISK_DEFINITIONS = [
  {
    key: 'wildfire',
    label: 'Wildfire',
    patterns: [/wildfire/i, /fire risk/i, /vegetation/i, /liability/i, /mitigation/i],
    nextCheck: 'Check board packets, rating commentary, insurance disclosures, and recent event notices for wildfire exposure.',
  },
  {
    key: 'political',
    label: 'Political',
    patterns: [/political/i, /voter/i, /ballot/i, /ratepayer/i, /public opposition/i, /board approval/i],
    nextCheck: 'Review board minutes, rate-setting actions, election items, and public-comment records.',
  },
  {
    key: 'pension',
    label: 'Pension',
    patterns: [/pension/i, /opeb/i, /calpers/i, /retirement/i, /actuarial/i, /unfunded/i],
    nextCheck: 'Verify pension/OPEB notes in the latest ACFR and actuarial schedules.',
  },
  {
    key: 'cyber',
    label: 'Cyber',
    patterns: [/cyber/i, /ransomware/i, /security breach/i, /data breach/i, /information security/i],
    nextCheck: 'Check recent board agenda items, incident disclosures, audit findings, and IT security budget items.',
  },
  {
    key: 'water_supply',
    label: 'Water Supply',
    patterns: [/water supply/i, /drought/i, /groundwater/i, /snowpack/i, /allocation/i, /supply reliability/i],
    nextCheck: 'Review water supply assessments, drought updates, rate studies, and utility board materials.',
  },
  {
    key: 'demand',
    label: 'Demand',
    patterns: [/demand/i, /usage/i, /load/i, /enrollment/i, /ridership/i, /sales volume/i, /customer growth/i],
    nextCheck: 'Check demand metrics in operating reports, budgets, and management discussion.',
  },
  {
    key: 'rate_pressure',
    label: 'Rate Pressure',
    patterns: [/rate pressure/i, /rate increase/i, /affordability/i, /rate covenant/i, /tariff/i, /fee increase/i],
    nextCheck: 'Review rate studies, ordinances, board approvals, and affordability commentary.',
  },
  {
    key: 'climate',
    label: 'Climate',
    patterns: [/climate/i, /sea level/i, /flood/i, /heat/i, /resilience/i, /decarbonization/i, /sustainability/i],
    nextCheck: 'Check climate adaptation plans, capital plans, rating commentary, and recent board items.',
  },
];

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

function unique(items: string[], limit: number) {
  const seen = new Set<string>();

  return items
    .map(clean)
    .filter((item) => item.length > 0)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function splitLines(value: string) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line
      .replace(/^#+\s+/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim()
    )
    .filter((line) => line.length >= 18);
}

function recordLines(record: SourceLike | null | undefined, content: string) {
  const evidencePackage = record?.evidencePackage ?? {};
  const rawNotes = Array.isArray(evidencePackage.raw_evidence_notes)
    ? evidencePackage.raw_evidence_notes.map((item: any) => clean(item.claim || item.notes || item.source_title))
    : [];
  const missing = Array.isArray(evidencePackage.missing_items)
    ? evidencePackage.missing_items.map((item: any) => `${item}: not found`)
    : [];

  return unique([
    ...splitLines(content),
    ...splitLines(record?.snippet ?? ''),
    ...(Array.isArray(record?.facts) ? record.facts.map(clean) : []),
    ...rawNotes,
    ...missing,
  ], 180);
}

function matchPatterns(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function pickLines(lines: string[], patterns: RegExp[], limit: number) {
  return unique(lines.filter((line) => matchPatterns(line, patterns)), limit);
}

function evidenceForPatterns(evidenceEngine: EvidenceCoverage | null | undefined, patterns: RegExp[], limit = 5) {
  const citations = evidenceEngine?.citations ?? [];
  return citations
    .filter((citation) => matchPatterns([
      citation.statement,
      citation.source,
      citation.document,
      citation.section,
      citation.documentType,
      citation.sourceTier,
    ].map(clean).join(' '), patterns))
    .slice(0, limit);
}

function sourceEvidenceForPatterns(record: SourceLike | null | undefined, patterns: RegExp[], limit = 4) {
  return sourceCandidatesFromRecord(record ?? {})
    .filter((source) => matchPatterns(sourceText(source), patterns))
    .slice(0, limit)
    .map((source) => {
      const title = sourceTitle(source) || 'Source candidate';
      const url = sourceUrl(source);
      return url ? `${title} (${url})` : title;
    });
}

function citationLabels(citations: EvidenceCitation[], fallback: string[] = [], limit = 4) {
  const citationEvidence = citations.map((citation) => {
    const page = citation.page && citation.page !== 'N/A' ? `, page ${citation.page}` : '';
    return `${citation.document || citation.source}${page} (${citation.confidence})`;
  });

  return unique([...citationEvidence, ...fallback], limit);
}

function confidenceFromEvidence(citations: EvidenceCitation[], fallbackEvidence: string[], missing: boolean): EvidenceConfidence {
  if (missing) return 'Low';
  if (citations.some((citation) => citation.confidence === 'High')) return 'High';
  if (citations.length > 0 || fallbackEvidence.length > 0) return 'Medium';
  return 'Low';
}

function factorStatus(citations: EvidenceCitation[], fallbackEvidence: string[], signalLines: string[]) {
  if (citations.length > 0 || fallbackEvidence.length > 0) return 'Supported' as const;
  if (signalLines.length > 0) return 'Needs Evidence' as const;
  return 'Not Surfaced' as const;
}

function defaultSummary(label: string, status: CreditFactor['status'], gap: string) {
  if (status === 'Supported') return `${label} has source support in the current research package.`;
  if (status === 'Needs Evidence') return `${label} is discussed, but direct source support should be attached before relying on it.`;
  return `${label} was not surfaced in this run. Needed evidence: ${gap}`;
}

function riskLevel(lines: string[], citations: EvidenceCitation[], fallbackEvidence: string[]): KeyRisk['level'] {
  const combined = lines.join(' ').toLowerCase();
  if (lines.length === 0 && citations.length === 0 && fallbackEvidence.length === 0) return 'No Current Signal';
  if (/no recent|no current|not found|not surfaced|no issuer-specific/i.test(combined) && citations.length === 0) return 'Needs Evidence';
  if (/elevated|material|pressure|litigation|shortfall|breach|wildfire|drought|cyber|rate increase|unfunded/i.test(combined)) {
    return citations.length > 0 || fallbackEvidence.length > 0 ? 'Elevated' : 'Watch';
  }
  return citations.length > 0 || fallbackEvidence.length > 0 ? 'Watch' : 'Needs Evidence';
}

function evidenceBullets(evidenceEngine: EvidenceCoverage | null | undefined, record: SourceLike | null | undefined) {
  const citationEvidence = (evidenceEngine?.citations ?? []).slice(0, 5).map((citation) => {
    const page = citation.page && citation.page !== 'N/A' ? `, page ${citation.page}` : '';
    return `${citation.document || citation.source}${page}: ${citation.section} (${citation.confidence})`;
  });
  const sourceEvidence = sourceCandidatesFromRecord(record ?? {})
    .slice(0, 5)
    .map((source) => sourceTitle(source))
    .filter(Boolean);

  return unique([...citationEvidence, ...sourceEvidence], 7);
}

function executiveSummary(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): WorkspaceSummary {
  const lines = recordLines(record, content);
  const strengths = pickLines(lines, [/strength/i, /positive/i, /strong/i, /stable/i, /liquidity/i, /essential/i, /found/i, /tier\s*1/i], 4);
  const weaknesses = pickLines(lines, [/weakness/i, /missing/i, /not found/i, /preliminary/i, /manual verification/i, /limited/i, /gap/i], 4);
  const keyMetrics = pickLines(lines, [/\$[0-9]/, /\b\d+(?:\.\d+)?%/, /\b\d+(?:\.\d+)?x\b/i, /rating/i, /coverage/i, /debt service/i, /outstanding debt/i, /liquidity/i], 5);
  const creditDrivers = pickLines(lines, [/driver/i, /revenue/i, /rate/i, /coverage/i, /demand/i, /liquidity/i, /debt/i, /capital/i, /governance/i], 5);
  const risks = pickLines(lines, [/risk/i, /pressure/i, /wildfire/i, /pension/i, /cyber/i, /climate/i, /drought/i, /political/i, /missing/i], 5);
  const outlookCandidates = pickLines(lines, [/outlook/i, /monitor/i, /next step/i, /ready for review/i, /preliminary/i, /no recent/i], 3);

  return {
    strengths: strengths.length ? strengths : ['No issuer-specific strengths were isolated yet; attach Tier 1/2 evidence before finalizing.'],
    weaknesses: weaknesses.length ? weaknesses : ['No explicit weakness was surfaced; continue checking missing core documents and recent developments.'],
    keyMetrics: keyMetrics.length ? keyMetrics : ['No audited financial metric was extracted yet. ACFR, OS/POS, and continuing disclosure remain the priority.'],
    creditDrivers: creditDrivers.length ? creditDrivers : ['Credit drivers are pending source-backed extraction from financial, debt, liquidity, and governance evidence.'],
    risks: risks.length ? risks : ['No current risk signal was isolated; verify board materials, EMMA filings, and rating actions.'],
    outlook: outlookCandidates[0] || (evidenceEngine?.warning
      ? 'Preliminary. Missing evidence must be resolved before treating the output as review-ready.'
      : 'Review-ready only after analyst confirms source coverage, recency, and cited evidence.'),
    evidence: evidenceBullets(evidenceEngine, record),
  };
}

function creditFactors(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): CreditFactor[] {
  const lines = recordLines(record, content);

  return CREDIT_FACTOR_DEFINITIONS.map((definition) => {
    const signalLines = pickLines(lines, definition.patterns, 3);
    const citations = evidenceForPatterns(evidenceEngine, definition.patterns, 5);
    const fallbackEvidence = sourceEvidenceForPatterns(record, definition.patterns, 4);
    const status = factorStatus(citations, fallbackEvidence, signalLines);
    const evidence = citationLabels(citations, fallbackEvidence, 4);

    return {
      key: definition.key,
      label: definition.label,
      status,
      confidence: confidenceFromEvidence(citations, fallbackEvidence, status !== 'Supported'),
      summary: signalLines[0] || defaultSummary(definition.label, status, definition.gap),
      evidenceCount: citations.length + fallbackEvidence.length,
      evidence,
      gaps: status === 'Supported' ? [] : [definition.gap],
    };
  });
}

function keyRisks(record: SourceLike | null | undefined, content: string, evidenceEngine: EvidenceCoverage | null | undefined): KeyRisk[] {
  const lines = recordLines(record, content);

  return RISK_DEFINITIONS.map((definition) => {
    const signalLines = pickLines(lines, definition.patterns, 3);
    const citations = evidenceForPatterns(evidenceEngine, definition.patterns, 5);
    const fallbackEvidence = sourceEvidenceForPatterns(record, definition.patterns, 3);
    const level = riskLevel(signalLines, citations, fallbackEvidence);
    const evidence = citationLabels(citations, fallbackEvidence, 3);

    return {
      key: definition.key,
      label: definition.label,
      level,
      confidence: confidenceFromEvidence(citations, fallbackEvidence, level === 'Needs Evidence'),
      summary: signalLines[0] || (level === 'No Current Signal'
        ? `No current ${definition.label.toLowerCase()} signal was surfaced in this run.`
        : `${definition.label} needs source-backed verification before it is included as a risk conclusion.`),
      evidenceCount: citations.length + fallbackEvidence.length,
      evidence,
      nextCheck: definition.nextCheck,
    };
  });
}

export function buildResearchWorkspace(
  record: SourceLike | null | undefined,
  content: string,
  evidenceEngine?: EvidenceCoverage | null
): ResearchWorkspace {
  return {
    executiveSummary: executiveSummary(record, content, evidenceEngine),
    creditFactors: creditFactors(record, content, evidenceEngine),
    keyRisks: keyRisks(record, content, evidenceEngine),
  };
}
