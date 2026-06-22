import { NextResponse } from 'next/server';
import { results } from '../../../../lib/mock-data';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = results.find((item) => item.id === id);

  if (!result) {
    return NextResponse.json(
      { error: 'Result not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
