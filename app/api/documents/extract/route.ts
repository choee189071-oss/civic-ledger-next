import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function extractionFocus(documentType: string) {
  const text = documentType.toLowerCase();

  if (/acfr|audited|financial statements/.test(text)) {
    return [
      'MD&A highlights',
      'Statement of Net Position key figures',
      'cash and investments',
      'unrestricted reserves',
      'operating revenue and expense',
      'debt service coverage when available',
    ];
  }

  if (/official statement|preliminary official statement|\bpos\b/.test(text)) {
    return [
      'security and pledge',
      'flow of funds',
      'debt service schedule',
      'rate covenant',
      'additional bonds test',
      'continuing disclosure undertaking',
      'risk factors',
    ];
  }

  if (/continuing disclosure|emma|annual disclosure/.test(text)) {
    return [
      'filing date',
      'CUSIP or bond series',
      'updated financial metrics',
      'covenant compliance',
      'event notices',
    ];
  }

  if (/budget|cip|capital improvement/.test(text)) {
    return [
      'adopted budget figures',
      'major revenue assumptions',
      'major expense assumptions',
      'capital plan',
      'funding sources',
    ];
  }

  if (/rate study|rate ordinance|covenant/.test(text)) {
    return [
      'approved rate path',
      'coverage targets',
      'rate covenant support',
      'affordability constraints',
      'implementation risks',
    ];
  }

  if (/board|agenda|minutes|packet/.test(text)) {
    return [
      'bond authorization',
      'bond resolution',
      'municipal advisor or bond counsel engagement',
      'RFP approvals',
      'RFP award results',
      'material financial actions',
    ];
  }

  if (/single audit|sefa|federal award/.test(text)) {
    return [
      'major federal programs',
      'SEFA totals',
      'audit findings',
      'questioned costs',
      'material weaknesses or significant deficiencies',
    ];
  }

  return ['summary', 'key figures', 'dates', 'source references', 'items requiring manual verification'];
}

function responseText(payload: any) {
  if (typeof payload === 'string') return payload;
  return payload?.markdown || payload?.text || payload?.content || payload?.result?.markdown || payload?.result?.text || '';
}

export async function POST(request: Request) {
  const workerUrl = process.env.DOCLING_WORKER_URL;
  const workerToken = process.env.DOCLING_WORKER_TOKEN;
  const timeoutMs = Number(process.env.DOCLING_WORKER_TIMEOUT_MS || '45000');

  if (!workerUrl) {
    return NextResponse.json(
      {
        error: 'DOCLING_WORKER_URL is not configured. Add it before using PDF/document extraction.',
      },
      { status: 501 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const url = String(body.url ?? '').trim();
  const documentType = String(body.documentType ?? 'Public finance document').trim();
  const title = String(body.title ?? 'Document extraction').trim();

  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'A public http(s) document URL is required.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = windowlessTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
      },
      body: JSON.stringify({
        url,
        title,
        document_type: documentType,
        extraction_focus: extractionFocus(documentType),
        output_format: 'markdown',
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => '');

    if (!res.ok) {
      return NextResponse.json(
        { error: responseText(payload) || `Document extraction worker failed with ${res.status}.` },
        { status: res.status }
      );
    }

    const markdown = responseText(payload) || JSON.stringify(payload, null, 2);

    return NextResponse.json({
      extraction: {
        title,
        documentType,
        url,
        extractedAt: new Date().toISOString(),
        focus: extractionFocus(documentType),
        markdown,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document extraction failed.' },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function windowlessTimeout(callback: () => void, ms: number) {
  return setTimeout(callback, ms);
}
