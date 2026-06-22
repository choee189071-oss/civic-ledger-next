/**
 * Open FI$Cal – California Open Data Portal (CKAN API)
 * Spending Transactions dataset: all state expenditure transactions
 * Docs: https://github.com/opensacorg/open-fiscal-api
 *
 * Base URL: https://data.ca.gov/api/3/action/datastore_search
 * No API key required.
 */

const CKAN_BASE = 'https://data.ca.gov/api/3/action/datastore_search';

// Spending Transactions (no vendor name) – use this for broad search
const SPENDING_RESOURCE_ID = 'b2c0b24b-2804-4ab8-b449-8d8f1c1a4378';

export type FiscalRecord = {
  id: string;
  department: string;
  program: string;
  fund: string;
  amount: number;
  fiscalYear: string;
  accountCategory: string;
  source: 'Open FI$Cal';
};

type CKANRecord = Record<string, string | number | null>;

function normalize(raw: CKANRecord): FiscalRecord {
  return {
    id: String(raw['_id'] ?? raw['Transaction ID'] ?? Math.random()),
    department: String(raw['Department'] ?? raw['department_name'] ?? raw['Agency'] ?? ''),
    program: String(raw['Program'] ?? raw['program_name'] ?? ''),
    fund: String(raw['Fund'] ?? raw['fund_name'] ?? ''),
    amount: parseFloat(String(raw['Amount'] ?? raw['transaction_amount'] ?? raw['Net Amount'] ?? '0')),
    fiscalYear: String(raw['Fiscal Year'] ?? raw['fiscal_year'] ?? ''),
    accountCategory: String(raw['Account Category'] ?? raw['account_category'] ?? ''),
    source: 'Open FI$Cal',
  };
}

export async function searchFiscal({
  q = '',
  limit = 20,
  offset = 0,
}: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ records: FiscalRecord[]; total: number }> {
  const params = new URLSearchParams({
    resource_id: SPENDING_RESOURCE_ID,
    limit: String(limit),
    offset: String(offset),
  });

  if (q.trim()) {
    // CKAN full-text search
    params.set('q', q.trim());
  }

  const url = `${CKAN_BASE}?${params.toString()}`;

  const res = await fetch(url, {
    next: { revalidate: 3600 }, // cache 1 hour
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Open FI$Cal API error: ${res.status}`);
  }

  const json = await res.json();

  if (!json.success) {
    throw new Error(`Open FI$Cal API returned success=false`);
  }

  const records: FiscalRecord[] = (json.result?.records ?? []).map(normalize);
  const total: number = json.result?.total ?? records.length;

  return { records, total };
}

export async function getFiscalRecord(id: string): Promise<FiscalRecord | null> {
  const params = new URLSearchParams({
    resource_id: SPENDING_RESOURCE_ID,
    filters: JSON.stringify({ '_id': id }),
    limit: '1',
  });

  const url = `${CKAN_BASE}?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const json = await res.json();
  const raw = json.result?.records?.[0];
  if (!raw) return null;

  return normalize(raw);
}
