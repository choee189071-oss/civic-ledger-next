/**
 * USAspending.gov public API
 * Docs: https://api.usaspending.gov/docs/endpoints
 *
 * No API key is currently required for these endpoints.
 */

const USASPENDING_BASE = 'https://api.usaspending.gov';

export type UsaSpendingAward = {
  id: string;
  title: string;
  recipientName: string;
  awardAmount: number;
  awardingAgency: string;
  awardingSubAgency: string;
  awardType: string;
  startDate: string;
  endDate: string;
  url: string;
  summary: string;
  source: 'USAspending';
};

type RawAward = Record<string, unknown>;
type RawRecipient = Record<string, unknown>;

function stringValue(record: RawAward, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function numberValue(record: RawAward, keys: string[]) {
  const value = stringValue(record, keys).replace(/[$,]/g, '');
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function awardUrl(id: string) {
  return id
    ? `https://www.usaspending.gov/award/${encodeURIComponent(id)}`
    : 'https://www.usaspending.gov/search';
}

function normalizeAward(record: RawAward): UsaSpendingAward {
  const id = stringValue(record, [
    'generated_internal_id',
    'Generated Internal Id',
    'Award ID',
    'Award Id',
    'Award Number',
    'award_id',
    'award_generated_internal_id',
  ]);
  const recipientName = stringValue(record, ['Recipient Name', 'recipient_name', 'recipientName']);
  const awardAmount = numberValue(record, ['Award Amount', 'award_amount', 'total_obligation']);
  const awardingAgency = stringValue(record, ['Awarding Agency', 'awarding_agency', 'awardingAgency']);
  const awardingSubAgency = stringValue(record, ['Awarding Sub Agency', 'awarding_sub_agency', 'awardingSubAgency']);
  const awardType = stringValue(record, ['Award Type', 'award_type', 'awardType']);
  const startDate = stringValue(record, ['Start Date', 'start_date', 'period_of_performance_start_date']);
  const endDate = stringValue(record, ['End Date', 'end_date', 'period_of_performance_current_end_date']);
  const title = stringValue(record, ['Description', 'description', 'Award Description', 'award_description'])
    || `Federal award to ${recipientName || 'recipient'}`;

  return {
    id,
    title,
    recipientName,
    awardAmount,
    awardingAgency,
    awardingSubAgency,
    awardType,
    startDate,
    endDate,
    url: awardUrl(id),
    summary: [
      recipientName && `Recipient: ${recipientName}`,
      awardAmount ? `Amount: $${awardAmount.toLocaleString()}` : null,
      awardingAgency && `Awarding agency: ${awardingAgency}`,
      startDate && `Start date: ${startDate}`,
      endDate && `End date: ${endDate}`,
    ].filter(Boolean).join(' | '),
    source: 'USAspending',
  };
}

async function postJson(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${USASPENDING_BASE}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`USAspending API error ${res.status} for ${path}`);
  }

  return res.json();
}

async function recipientNames(query: string) {
  try {
    const payload = await postJson('/api/v2/autocomplete/recipient/', {
      search_text: query,
      limit: 4,
    });
    const results = (payload.results ?? []) as RawRecipient[];

    return results
      .map((item) => stringValue(item, ['recipient_name', 'name', 'display_name']))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    next.push(cleaned);
  }

  return next;
}

export async function searchUsaSpending({
  query,
  startDate,
  endDate,
  limit = 6,
}: {
  query: string;
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<UsaSpendingAward[]> {
  const recipients = unique([query, ...(await recipientNames(query))]).slice(0, 5);

  const payload = await postJson('/api/v2/search/spending_by_award/', {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      recipient_search_text: recipients,
    },
    fields: [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Awarding Agency',
      'Awarding Sub Agency',
      'Award Type',
      'Start Date',
      'End Date',
      'Description',
    ],
    page: 1,
    limit,
    sort: 'Award Amount',
    order: 'desc',
    subawards: false,
  });

  return ((payload.results ?? []) as RawAward[]).map(normalizeAward);
}
