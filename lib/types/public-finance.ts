export type SourceCatalogItem = {
  id: string;
  name: string;
  topic: string;
  trust: string;
  freshness: string;
  url?: string;
  apiUrl?: string | null;
  description: string;
  keyFacts: string[];
  live?: boolean;
};

export type GeneratedReport = {
  id: string;
  template?: string;
  templateLabel?: string;
  title: string;
  content: string;
  generatedAt: string;
  model?: string;
  usage?: unknown;
  sectionTitle?: string | null;
  editedAt?: string;
};

export type ReportVersion = {
  id: string;
  label: string;
  content: string;
  templateLabel?: string;
  savedAt: string;
};

export type ReadingDocument = {
  id: string;
  recordId?: string;
  title: string;
  body: string[];
  editedAt?: string;
};

export type ReadingAnnotation = {
  id: string;
  type: string;
  anchor?: string;
  note: string;
  createdAt: string;
};

export type IssuerProfile = {
  issuer: string;
  legalName?: string;
  sector?: string;
  state?: string;
  rating?: string;
  ratings?: string;
  outstandingDebt?: string;
  latestOS?: string;
  latestACFR?: string;
  latestEmmaFiling?: string;
  latestRatingReport?: string;
  latestBudget?: string;
  boardPage?: string;
  emmaLink?: string;
  advisorsCounsel?: string;
  knownAdvisors?: string;
  lastCheckedDate?: string;
  profileStatus?: string;
  evidenceCoverageScore?: number;
  sourceTrail?: Array<Record<string, unknown>>;
  updateHistory?: Array<Record<string, unknown>>;
  notes?: string;
};

export type ResearchRecord = {
  id: string;
  kind?: string;
  title: string;
  topic: string;
  source: string;
  score?: number;
  freshnessRank?: number;
  summary: string;
  snippet?: string;
  facts?: string[];
  citations?: string[];
  generatedReport?: GeneratedReport | null;
  reportVersions?: ReportVersion[];
  annotations?: ReadingAnnotation[];
  workflowStatus?: string;
  savedAt?: string;
  financeFocused?: boolean;
  coreFinanceDocumentsFound?: boolean;
  researchModeLabel?: string;
  outputType?: string;
  promptMode?: string;
  customAngle?: string;
  workflowInput?: Record<string, unknown>;
  workflowOptions?: Record<string, boolean>;
  evidencePackage?: Record<string, unknown>;
  searchResults?: Array<Record<string, unknown>>;
  documentInventory?: Array<Record<string, unknown>>;
  coverageDashboard?: Array<Record<string, unknown>>;
  searchQueries?: string[];
  relatedQuestions?: string[];
  generatedAt?: string;
  recencyScope?: Record<string, unknown>;
  model?: string;
  usage?: unknown;
  program?: string;
  fund?: string;
  accountCategory?: string;
  amount?: number;
  fiscalYear?: string;
};

export type SourceStatusMap = Record<string, string>;
