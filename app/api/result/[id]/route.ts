import { NextResponse } from 'next/server';
import { results } from '../../../../lib/mock-data';

export async function GET(
  _: Request,
  { params }: { params: { id: string } }
) {
  const item = results.find((r) => r.id === params.id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}
