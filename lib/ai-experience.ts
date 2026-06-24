import type { EvidenceCoverage, EvidenceConfidence } from './evidence-engine';
import type { ResearchWorkspace } from './research-workspace';
import type { IssuerDashboard } from './issuer-dashboard';

export type StructuredAnswer = {
  summary: string[];
  analysis: string[];
  evidence: string[];
  recommendations: string[];
  confidence: {
    level: EvidenceConfidence;
    explanation: string;
  };
  suggestedFollowUps: string[];
};

type SourceLike = Record<string, any>;

function clean(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripMarkdown(value: string) {
  return clean(value)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

function unique(items: string[], limit: number) {
  const seen = new Set<string>();

  return items
    .map(stripMarkdown)
    .filter((item) => item.length > 0)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function splitAnswerLines(content: string) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => {
      const stripped = stripMarkdown(line);
      if (!stripped) return [];
      if (stripped.length > 240) {
        return stripped
          .split(/;\s+|\. (?=[A-Z])/)
          .map(stripMarkdown)
          .filter((item) => item.length >= 28)
          .slice(0, 3);
      }
      return [stripped];
    })
    .filter((line) => line.length >= 18 && !/^\|?\s*-{3,}/.test(line));
}

function evidenceLines(evidenceEngine: EvidenceCoverage | null | undefined, record: SourceLike | null | undefined) {
  const citations = (evidenceEngine?.citations ?? []).slice(0, 6).map((citation) => {
    const page = citation.page && citation.page !== 'N/A' ? `, page ${citation.page}` : '';
    return `${citation.document || citation.source}${page}: ${citation.section} (${citation.confidence})`;
  });
  const sourceCandidates = [
    ...(Array.isArray(record?.documentInventory) ? record.documentInventory : []),
    ...(Array.isArray(record?.searchResults) ? record.searchResults : []),
    ...(Array.isArray(record?.citations) ? record.citations.map((url: string) => ({ title: url, url })) : []),
  ].slice(0, 6).map((source: any) => clean(source.document || source.title || source.url || source.source_url));

  return unique([...citations, ...sourceCandidates], 6);
}

function confidenceLevel(record: SourceLike | null | undefined, evidenceEngine: EvidenceCoverage | null | undefined): EvidenceConfidence {
  if (record?.failureClassification || record?.coreFinanceDocumentsFound === false) return 'Low';
  if (!evidenceEngine) return 'Low';
  if (evidenceEngine.confidence === 'High' && evidenceEngine.missingStatements <= 2) return 'High';
  if (evidenceEngine.confidence === 'Low') return 'Low';
  return 'Medium';
}

function confidenceExplanation(record: SourceLike | null | undefined, evidenceEngine: EvidenceCoverage | null | undefined, level: EvidenceConfidence) {
  if (record?.coreFinanceDocumentsFound === false) {
    return 'Low because core finance documents were not found; treat the answer as a preliminary issuer overview.';
  }
  if (record?.failureClassification?.title) {
    return `Low because retrieval diagnostics flagged: ${record.failureClassification.title}`;
  }
  if (!evidenceEngine) {
    return 'Low because statement-level evidence coverage has not been calculated.';
  }

  return `${level} because ${evidenceEngine.citationCount} of ${evidenceEngine.totalStatements} statements are mapped to evidence (${evidenceEngine.coveragePercent}% coverage), with ${evidenceEngine.missingStatements} unsupported statements.`;
}

function recommendationsFromRecord(
  record: SourceLike | null | undefined,
  researchWorkspace: ResearchWorkspace | null | undefined,
  issuerDashboard: IssuerDashboard | null | undefined,
  evidenceEngine: EvidenceCoverage | null | undefined
) {
  const packageData = record?.evidencePackage ?? {};
  const missingItems = Array.isArray(packageData.missing_items) ? packageData.missing_items.map((item: any) => `Find or verify: ${item}`) : [];
  const diagnosticRetries = [
    ...(Array.isArray(record?.documentDiagnostics?.documents) ? record.documentDiagnostics.documents : []),
    ...(Array.isArray(packageData.document_diagnostics?.documents) ? packageData.document_diagnostics.documents : []),
  ]
    .filter((item: any) => item.status === 'missing' && item.retryQuery)
    .map((item: any) => `Retry source search: ${item.retryQuery}`);
  const factorGaps = (researchWorkspace?.creditFactors ?? [])
    .filter((factor) => factor.status !== 'Supported')
    .flatMap((factor) => factor.gaps.map((gap) => `${factor.label}: ${gap}`));
  const dashboardChecks = [
    ...(issuerDashboard?.financialTrends ?? []).filter((metric) => metric.trend === 'Needs Source').map((metric) => `${metric.label}: ${metric.nextCheck}`),
    ...(issuerDashboard ? Object.values(issuerDashboard.debtDashboard).filter((metric) => metric.status !== 'Available').map((metric) => `${metric.label}: ${metric.nextCheck}`) : []),
  ];
  const evidenceGaps = (evidenceEngine?.missingEvidence ?? []).slice(0, 3).map((item) => `Attach evidence for: ${item}`);

  return unique([
    ...missingItems,
    ...diagnosticRetries,
    ...factorGaps,
    ...dashboardChecks,
    ...evidenceGaps,
    'Generate a draft report only after the key missing source gaps are reviewed.',
  ], 6);
}

function followUpsFromRecord(
  record: SourceLike | null | undefined,
  researchWorkspace: ResearchWorkspace | null | undefined,
  issuerDashboard: IssuerDashboard | null | undefined
) {
  const related = Array.isArray(record?.relatedQuestions) ? record.relatedQuestions : [];
  const missingDocs = [
    ...(Array.isArray(record?.documentDiagnostics?.missingDocuments) ? record.documentDiagnostics.missingDocuments : []),
    ...(Array.isArray(record?.evidencePackage?.document_diagnostics?.missingDocuments) ? record.evidencePackage.document_diagnostics.missingDocuments : []),
  ].map((document: string) => `Can you find the latest ${document} for this issuer?`);
  const risks = (researchWorkspace?.keyRisks ?? [])
    .filter((risk) => risk.level === 'Elevated' || risk.level === 'Watch' || risk.level === 'Needs Evidence')
    .slice(0, 3)
    .map((risk) => `What is the latest evidence for ${risk.label.toLowerCase()} risk?`);
  const marketQuestions = issuerDashboard
    ? [
      'Can you compare this issuer against similar credits and benchmark spreads?',
      'Can you find recent trades and calculate relative value?',
    ]
    : [];

  return unique([
    ...related,
    ...missingDocs,
    ...risks,
    ...marketQuestions,
    'What documents are still missing before this can become a credit memo?',
    'Can you turn this into a source-backed executive summary?',
  ], 7);
}

export function buildStructuredAnswer({
  record,
  content,
  evidenceEngine,
  researchWorkspace,
  issuerDashboard,
}: {
  record?: SourceLike | null;
  content: string;
  evidenceEngine?: EvidenceCoverage | null;
  researchWorkspace?: ResearchWorkspace | null;
  issuerDashboard?: IssuerDashboard | null;
}): StructuredAnswer {
  const lines = splitAnswerLines(content);
  const summary = unique([
    ...(researchWorkspace?.executiveSummary?.strengths ?? []).slice(0, 2),
    ...(researchWorkspace?.executiveSummary?.weaknesses ?? []).slice(0, 1),
    record?.summary,
    ...lines.slice(0, 3),
  ], 4);
  const analysis = unique([
    ...(researchWorkspace?.executiveSummary?.creditDrivers ?? []).slice(0, 4),
    ...(researchWorkspace?.creditFactors ?? []).slice(0, 4).map((factor) => `${factor.label}: ${factor.summary}`),
    ...lines.filter((line) => /because|therefore|indicat|support|risk|driver|financial|debt|liquidity|rating/i.test(line)),
  ], 6);
  const evidence = evidenceLines(evidenceEngine, record);
  const recommendations = recommendationsFromRecord(record, researchWorkspace, issuerDashboard, evidenceEngine);
  const level = confidenceLevel(record, evidenceEngine);

  return {
    summary: summary.length ? summary : ['No concise summary is available yet. Run research or attach evidence to populate this section.'],
    analysis: analysis.length ? analysis : ['Analysis is pending source-backed evidence. Use the recommendations below to improve coverage.'],
    evidence: evidence.length ? evidence : ['No evidence citations were available. Add official sources, parsed PDFs, or live search results.'],
    recommendations,
    confidence: {
      level,
      explanation: confidenceExplanation(record, evidenceEngine, level),
    },
    suggestedFollowUps: followUpsFromRecord(record, researchWorkspace, issuerDashboard),
  };
}
