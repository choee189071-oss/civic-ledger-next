# Civic Ledger — Next.js Public Finance Workbench

A California public finance AI research workspace built with Next.js App Router.

## Features
- Componentized frontend (Search, Detail, Reading, Sources)
- App Router route handlers for live research and source search
- Perplexity Sonar-backed research answers with citations
- Open FI$Cal search via the California CKAN API

## Mock endpoints
- `GET /api/search?q=&topic=&source=&sort=`
- `GET /api/sources`
- `GET /api/result/[id]`
- `GET /api/reading/[id]`
- `POST /api/research`

## Environment variables

Create `.env.local` for local development, or add these in Vercel Project Settings:

```bash
PUBFIN_API_KEY=your_perplexity_api_key
PUBFIN_MODEL=sonar-pro
```

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

## Data sources
- [Open FI$Cal](https://open.fiscal.ca.gov) — State expenditure transparency portal
- [California Budget](https://ebudget.ca.gov) — Official budget entry point
- [CDIAC](https://www.treasurer.ca.gov/cdiac) — Debt issuance and public finance guidance
- [Debt Line](https://www.treasurer.ca.gov/cdiac/debtpubs/debtline.asp) — Monthly debt issuance newsletter
