import { NextResponse } from 'next/server';
import { results } from '../../../../lib/mock-data';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = results.find((r) => r.id === id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}
