import { NextResponse } from 'next/server';
import { getFinanceCapabilities } from '@/lib/finance/capabilities';
import { financeErrorResponse } from '@/lib/finance/http';

export async function GET() {
  try { return NextResponse.json(getFinanceCapabilities()); }
  catch (error) { const result=financeErrorResponse(error); return NextResponse.json(result.body,{status:result.status}); }
}
