import { NextResponse } from 'next/server';
import { analysisContext } from '@/lib/queries/finance/analysis-context';
import { readFinanceJson, financeErrorResponse } from '@/lib/finance/http';

const MAX_REQUEST_BYTES = 64 * 1024;

export async function POST(request) {
  try {
    return NextResponse.json(analysisContext(await readFinanceJson(request, { maxBytes: MAX_REQUEST_BYTES })));
  } catch (error) {
    const result = financeErrorResponse(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
