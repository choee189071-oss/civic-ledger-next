import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ''),
    key,
  };
}

async function supabaseInsert(config: { url: string; key: string }, table: string, payload: any) {
  const res = await fetch(`${config.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body?.message || `Supabase insert failed for ${table}: ${res.status}`);
  }

  return Array.isArray(body) ? body[0] : body;
}

export async function POST(request: Request) {
  const config = supabaseConfig();
  const body = await request.json().catch(() => ({}));
  const record = body.record;
  const report = body.report;

  if (!record) {
    return NextResponse.json({ error: 'Research record is required.' }, { status: 400 });
  }

  if (!config) {
    return NextResponse.json(
      {
        saved: false,
        storage: 'local',
        message: 'Supabase is not configured. The client can keep this run in local research library storage.',
      },
      { status: 202 }
    );
  }

  try {
    const run = await supabaseInsert(config, 'research_runs', {
      issuer: record.title,
      research_mode: record.researchModeLabel ?? record.topic,
      output_type: report?.templateLabel ?? record.outputType,
      status: 'completed',
      search_timestamp: record.generatedAt,
    });

    if (report) {
      await supabaseInsert(config, 'research_outputs', {
        research_run_id: run.id,
        output_format: 'markdown',
        file_path: null,
        content: report.content,
      });
    }

    const sources = (record.evidencePackage?.document_inventory ?? record.documentInventory ?? [])
      .slice(0, 50)
      .map((source: any) => ({
        research_run_id: run.id,
        title: source.title ?? source.document,
        source_url: source.source_url ?? source.url,
        source_tier: source.source_tier ?? source.sourceTier,
        document_type: source.document_type ?? source.type,
        source_date: source.date,
        confidence: source.confidence,
        notes: source.notes,
      }));

    if (sources.length > 0) {
      await supabaseInsert(config, 'research_sources', sources);
    }

    return NextResponse.json({ saved: true, storage: 'supabase', run });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research library save failed.';

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
