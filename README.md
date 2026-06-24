# Civic Ledger — Next.js Public Finance Workbench

A California public finance AI research workspace built with Next.js App Router.

## Features
- Componentized frontend (Search, Detail, Reading, Sources)
- App Router route handlers for live research and source search
- Perplexity Sonar-backed research answers with citations
- Perplexity Search API evidence expansion with ranked live web results
- Research prompt modes for issuer credit, document discovery, debt, financial performance, risk monitoring, and custom angles
- Source tiering for public-finance evidence quality, with document inventory and coverage dashboard
- OpenAI-powered report writer for credit memos, IC memos, rating committee memos, diligence reports, board briefings, and executive summaries
- LlamaParse-powered document intake for ACFRs, official statements/POS, and EMMA annual reports
- Four-step research workflow tabs: Input, Discovery, Generated Report, and Export
- Exportable Markdown, PDF, Word-compatible `.doc`, and evidence JSON files
- Optional Supabase-backed research library persistence with local fallback
- Open FI$Cal search via the California CKAN API

## Mock endpoints
- `GET /api/search?q=&topic=&source=&sort=`
- `GET /api/sources`
- `GET /api/result/[id]`
- `GET /api/reading/[id]`
- `POST /api/research`
- `POST /api/report`
- `POST /api/documents/parse`
- `POST /api/export/pdf`
- `POST /api/library`

## Environment variables

Create `.env.local` for local development, or add these in Vercel Project Settings:

```bash
PUBFIN_API_KEY=your_perplexity_api_key
# Optional aliases accepted by the server:
PERPLEXITY_API_KEY=your_perplexity_api_key
PPLX_API_KEY=your_perplexity_api_key
PUBFIN_MODEL=sonar-pro
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.5
LLAMA_CLOUD_API_KEY=your_llama_cloud_api_key
LLAMA_PARSE_TIER=agentic
LLAMA_PARSE_TIMEOUT_MS=75000
LLAMA_PARSE_MAX_BYTES=31457280
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

`PUBFIN_API_KEY` is used for both Sonar answers and broader Perplexity Search API evidence results. `PERPLEXITY_API_KEY` and `PPLX_API_KEY` are accepted as aliases.
`OPENAI_API_KEY` is used by the report writer to turn structured research packages into deliverable work products.
`LLAMA_CLOUD_API_KEY` is used by Document Intake to parse uploaded or linked PDFs through LlamaParse. Optional LlamaExtract agent IDs can be added later with `LLAMA_EXTRACT_AGENT_ID`, `LLAMA_EXTRACT_ACFR_AGENT_ID`, `LLAMA_EXTRACT_OS_AGENT_ID`, and `LLAMA_EXTRACT_DISCLOSURE_AGENT_ID`.
Supabase variables are optional. If omitted, saved records stay in the browser's local research library.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  page.tsx           # Main page with view/state management
  layout.tsx         # Root layout
  globals.css        # Global styles
  api/
    search/          # GET /api/search
    sources/         # GET /api/sources
    research/        # POST /api/research
    report/          # POST /api/report
    documents/parse/ # POST /api/documents/parse
    library/         # POST /api/library
    export/pdf/      # POST /api/export/pdf
    result/[id]/     # GET /api/result/:id
    reading/[id]/    # GET /api/reading/:id
  components/
    Sidebar.tsx
    SearchPanel.tsx
    DetailPanel.tsx
    ReadingPanel.tsx
    SourcesPanel.tsx
lib/
  mock-data.ts       # All mock data in one place
```

## Next steps
- Add `lib/types/`, `lib/repositories/`, `lib/services/`, `lib/hooks/`
- Connect Open FI$Cal and California Budget real data
- Add vector search (pgvector) for RAG
- Deploy to Vercel

## Optional Supabase tables

```sql
create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  issuer text not null,
  research_mode text,
  output_type text,
  status text default 'completed',
  search_timestamp timestamptz,
  created_at timestamptz default now()
);

create table if not exists research_outputs (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid references research_runs(id),
  output_format text,
  file_path text,
  content text,
  created_at timestamptz default now()
);

create table if not exists research_sources (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid references research_runs(id),
  title text,
  source_url text,
  source_tier text,
  document_type text,
  source_date text,
  confidence text,
  notes text,
  created_at timestamptz default now()
);
```

## Data sources
- [Open FI$Cal](https://open.fiscal.ca.gov) — State expenditure transparency portal
- [California Budget](https://ebudget.ca.gov) — Official budget entry point
- [CDIAC](https://www.treasurer.ca.gov/cdiac) — Debt issuance and public finance guidance
- [Debt Line](https://www.treasurer.ca.gov/cdiac/debtpubs/debtline.asp) — Monthly debt issuance newsletter
