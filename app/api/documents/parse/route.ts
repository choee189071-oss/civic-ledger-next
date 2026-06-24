import { NextResponse } from 'next/server';
import {
  buildDocumentEvidencePackage,
  extractionFocus,
} from '../../../../lib/public-finance-document-intelligence';
import { getLlamaCloudApiKey, llamaCloudApiKeyErrorMessage } from '../../../../lib/server-env';

export const runtime = 'nodejs';
export const maxDuration = 120;

const LLAMA_FILES_URL = 'https://api.cloud.llamaindex.ai/api/v1/beta/files';
const LLAMA_PARSE_URL = 'https://api.cloud.llamaindex.ai/api/v2/parse';
const LLAMA_EXTRACT_JOBS_URL = 'https://api.cloud.llamaindex.ai/api/v1/extraction/jobs';

type UploadedDocument = {
  bytes: Buffer;
  filename: string;
  contentType: string;
  sourceUrl?: string;
};

type ParseRequestInput = {
  document: UploadedDocument;
  title: string;
  issuer: string;
  documentType: string;
  tier: string;
};

function jsonError(error: string, status = 500) {
  return NextResponse.json({ error }, { status });
}

function safeFilename(value: string) {
  return value.replace(/[^\w. -]+/g, '_').slice(0, 120) || 'public-finance-document.pdf';
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const item = payload as Record<string, any>;
    return item?.detail || item?.message || item?.error?.message || item?.error || fallback;
  }
  return fallback;
}

function statusFromPayload(payload: any) {
  return String(payload?.job?.status ?? payload?.status ?? '').toUpperCase();
}

function markdownFromPayload(payload: any) {
  const pages = payload?.markdown?.pages;
  if (Array.isArray(pages)) {
    return pages
      .map((page: any, index: number) => {
        const pageNumber = page?.page ?? page?.page_number ?? index + 1;
        const markdown = page?.markdown ?? page?.text ?? '';
        return markdown ? `\n\n<!-- Page ${pageNumber} -->\n\n${markdown}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof payload?.markdown === 'string') return payload.markdown;
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.result?.markdown === 'string') return payload.result.markdown;
  return '';
}

function pageSummaries(payload: any) {
  const pages = payload?.markdown?.pages;
  if (!Array.isArray(pages)) return [];

  return pages.map((page: any, index: number) => ({
    page: page?.page ?? page?.page_number ?? index + 1,
    chars: String(page?.markdown ?? page?.text ?? '').length,
  }));
}

async function parseRequestInput(request: Request): Promise<ParseRequestInput | { error: string; status: number }> {
  const formData = await request.formData();
  const file = formData.get('file');
  const rawUrl = String(formData.get('url') ?? '').trim();
  const documentType = String(formData.get('documentType') ?? 'Public finance PDF').trim();
  const issuer = String(formData.get('issuer') ?? '').trim();
  const tier = String(formData.get('tier') ?? process.env.LLAMA_PARSE_TIER ?? 'agentic').trim() || 'agentic';

  if (file instanceof File && file.size > 0) {
    const maxBytes = Number(process.env.LLAMA_PARSE_MAX_BYTES || 30 * 1024 * 1024);
    if (file.size > maxBytes) {
      return {
        error: `File is too large for this serverless upload path. Limit is ${Math.round(maxBytes / 1024 / 1024)}MB. Use a public PDF URL for larger ACFRs or official statements.`,
        status: 413,
      };
    }

    const document = {
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: safeFilename(file.name || 'uploaded-public-finance-document.pdf'),
      contentType: file.type || 'application/pdf',
    };

    return {
      document,
      title: String(formData.get('title') ?? document.filename).trim() || document.filename,
      issuer,
      documentType,
      tier,
    };
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (!res.ok) {
      return { error: `Could not download PDF URL. Source returned ${res.status}.`, status: 400 };
    }

    const contentType = res.headers.get('content-type') || 'application/pdf';
    const bytes = Buffer.from(await res.arrayBuffer());
    const maxBytes = Number(process.env.LLAMA_PARSE_MAX_BYTES || 30 * 1024 * 1024);
    if (bytes.length > maxBytes) {
      return {
        error: `Downloaded file is too large for this parser route. Limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`,
        status: 413,
      };
    }

    const url = new URL(rawUrl);
    const filename = safeFilename(decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'public-finance-document.pdf'));

    const document = {
      bytes,
      filename,
      contentType,
      sourceUrl: rawUrl,
    };

    return {
      document,
      title: String(formData.get('title') ?? filename).trim() || filename,
      issuer,
      documentType,
      tier,
    };
  }

  return { error: 'Upload a PDF file or provide a public PDF URL.', status: 400 };
}

async function uploadToLlamaCloud(apiKey: string, document: UploadedDocument, purpose: 'parse' | 'extract') {
  const body = new FormData();
  body.append('purpose', purpose);
  body.append('file', new Blob([document.bytes], { type: document.contentType }), document.filename);

  const res = await fetch(LLAMA_FILES_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.id) {
    throw new Error(apiErrorMessage(payload, `LlamaCloud file upload failed with ${res.status}.`));
  }

  return String(payload.id);
}

async function pollJson(url: string, apiKey: string, completeStatuses: string[], failedStatuses: string[], timeoutMs: number) {
  const started = Date.now();
  let lastPayload: any = null;

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const payload = await res.json().catch(() => ({}));
    lastPayload = payload;

    if (!res.ok) {
      throw new Error(apiErrorMessage(payload, `Polling failed with ${res.status}.`));
    }

    const status = statusFromPayload(payload);
    if (completeStatuses.includes(status)) return payload;
    if (failedStatuses.includes(status)) {
      throw new Error(apiErrorMessage(payload, `LlamaCloud job failed with status ${status}.`));
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  throw new Error(`Timed out waiting for LlamaCloud job. Last status: ${statusFromPayload(lastPayload) || 'unknown'}.`);
}

async function runLlamaParse(apiKey: string, document: UploadedDocument, tier: string, timeoutMs: number) {
  const fileId = await uploadToLlamaCloud(apiKey, document, 'parse');
  const res = await fetch(LLAMA_PARSE_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      file_id: fileId,
      tier,
      version: 'latest',
      output_options: {
        markdown: {
          tables: {
            output_tables_as_markdown: true,
          },
        },
      },
      processing_options: {
        ocr_parameters: {
          languages: ['en'],
        },
      },
    }),
  });

  const started = await res.json().catch(() => ({}));
  if (!res.ok || !started?.id) {
    throw new Error(apiErrorMessage(started, `LlamaParse job could not be started with ${res.status}.`));
  }

  const result = await pollJson(
    `${LLAMA_PARSE_URL}/${started.id}?expand=markdown&expand=text&expand=items`,
    apiKey,
    ['COMPLETED'],
    ['FAILED', 'CANCELED', 'CANCELLED'],
    timeoutMs
  );

  return {
    fileId,
    jobId: String(started.id),
    result,
  };
}

async function runOptionalLlamaExtract(apiKey: string, document: UploadedDocument, documentType: string, timeoutMs: number) {
  const type = documentType.toLowerCase();
  const agentId = (
    (/acfr|audit|financial statements/.test(type) && process.env.LLAMA_EXTRACT_ACFR_AGENT_ID) ||
    (/official statement|\bos\b|\bpos\b/.test(type) && process.env.LLAMA_EXTRACT_OS_AGENT_ID) ||
    (/continuing disclosure|emma|annual/.test(type) && process.env.LLAMA_EXTRACT_DISCLOSURE_AGENT_ID) ||
    process.env.LLAMA_EXTRACT_AGENT_ID ||
    ''
  ).trim();

  if (!agentId) return null;

  const fileId = await uploadToLlamaCloud(apiKey, document, 'extract');
  const res = await fetch(LLAMA_EXTRACT_JOBS_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      extraction_agent_id: agentId,
      file_id: fileId,
    }),
  });

  const started = await res.json().catch(() => ({}));
  if (!res.ok || !started?.id) {
    throw new Error(apiErrorMessage(started, `LlamaExtract job could not be started with ${res.status}.`));
  }

  const job = await pollJson(
    `${LLAMA_EXTRACT_JOBS_URL}/${started.id}`,
    apiKey,
    ['SUCCESS', 'COMPLETED'],
    ['FAILED', 'CANCELED', 'CANCELLED'],
    timeoutMs
  );

  const resultRes = await fetch(`${LLAMA_EXTRACT_JOBS_URL}/${started.id}/result`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const result = await resultRes.json().catch(() => ({}));
  if (!resultRes.ok) {
    throw new Error(apiErrorMessage(result, `LlamaExtract result fetch failed with ${resultRes.status}.`));
  }

  return {
    fileId,
    jobId: String(started.id),
    job,
    result,
  };
}

export async function POST(request: Request) {
  const apiKey = getLlamaCloudApiKey();
  if (!apiKey) return jsonError(llamaCloudApiKeyErrorMessage(), 501);

  const input = await parseRequestInput(request);
  if ('error' in input) return jsonError(input.error, input.status);

  const { document, title, issuer, documentType, tier } = input;
  const timeoutMs = Number(process.env.LLAMA_PARSE_TIMEOUT_MS || '75000');

  try {
    const parsed = await runLlamaParse(apiKey, document, tier, timeoutMs);
    const markdown = markdownFromPayload(parsed.result);
    const evidencePackage = buildDocumentEvidencePackage(documentType, markdown);
    const extract = await runOptionalLlamaExtract(apiKey, document, documentType, Math.max(15000, timeoutMs - 10000)).catch((error) => ({
      error: error instanceof Error ? error.message : 'LlamaExtract failed.',
    }));

    return NextResponse.json({
      extraction: {
        title,
        issuer,
        documentType,
        sourceUrl: document.sourceUrl ?? null,
        filename: document.filename,
        parsedAt: new Date().toISOString(),
        parser: {
          provider: 'LlamaParse',
          tier,
          fileId: parsed.fileId,
          jobId: parsed.jobId,
          pageCount: pageSummaries(parsed.result).length || null,
          pages: pageSummaries(parsed.result),
        },
        focus: extractionFocus(documentType),
        markdown,
        evidencePackage,
        llamaExtract: extract,
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'LlamaParse document extraction failed.');
  }
}
