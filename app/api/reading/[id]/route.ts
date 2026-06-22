import { NextResponse } from 'next/server';
import { readings } from '../../../../lib/mock-data';

export async function GET(
  _: Request,
  { params }: { params: { id: string } }
) {
  const item = readings[params.id];
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}
