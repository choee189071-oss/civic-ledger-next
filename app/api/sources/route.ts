import { NextResponse } from 'next/server';
import { sources } from '../../../lib/mock-data';

export async function GET() {
  return NextResponse.json({ items: sources, meta: { total: sources.length } });
}
