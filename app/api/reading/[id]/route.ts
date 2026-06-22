import { NextResponse } from 'next/server';
import { readings } from '../../../../lib/mock-data';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const reading = readings[id];

  if (!reading) {
    return NextResponse.json(
      { error: 'Reading not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(reading);
}
