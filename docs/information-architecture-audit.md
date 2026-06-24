# Civic Ledger Information Architecture Audit

Purpose: reduce information overload before adding new capabilities. Every screen should answer one primary user question. The top 20% of each screen should communicate 80% of the value.

## Visibility Levels

- Primary: always visible. The single most important content for the current task.
- Secondary: available in tabs, cards, or collapsed sections. Useful supporting context.
- Tertiary: hidden behind Show more, drawers, accordions, or developer panels. Diagnostics, metadata, raw model output, raw JSON, and advanced settings.

## Screen Map

| Screen | Primary question | Primary content | Secondary content | Tertiary content |
|---|---|---|---|---|
| Search | Which issuer or question should I research? | Universal search input, run action, selected issuer answer | Search interpretation, quick starts, result tabs | Advanced settings, source filters, sort controls, raw citations |
| Dashboard | What changed recently for monitored issuers? | Current monitor run and newest issuer developments | Sector tabs, single issuer vs general update modes, export buttons | Batch configuration, retry queue, raw generated update text |
| Source Management | Which sources can support this analysis? | Document intake, issuer file coverage, source verification tabs | Parsed evidence packages, editable profile fields, current run source list | Raw markdown, raw JSON, parser metadata, connector notes, diagnostic source metadata |
| Reports | Which saved work product should I continue? | Saved issuer/report list and open actions | Grouping by issuer, reading-room handoff | Saved timestamps, model/source metadata |
| Editor | What report text am I editing now? | Reading document body | Comments, reviewer notes, export controls | Annotation history, raw markdown structure |
| Templates | Which repeatable workflow should I run? | Workflow selection and run action | Watchlist run result summary | Per-issuer logs, retry details, raw report export |
| Research Detail | What should I conclude from this research run? | Structured answer and confidence | Analyst workspace, credit factors, risks, evidence command panel | Retrieval diagnostics, document diagnostics, research setup, raw answer, raw evidence notes |

## Applied Rules

- The global header is view-aware and should describe the current page's single task.
- Workspace status, KPI counts, and environment signals are secondary and stay collapsed.
- Research Detail keeps the Structured Answer as the primary focus.
- Credit factors, risks, and evidence panels are secondary progressive disclosures.
- Diagnostics, setup payloads, raw answer text, search queries, and raw notes are tertiary progressive disclosures.
- No new features should be added until an existing screen has a clear primary focus.
