import { NextResponse } from 'next/server';
import { reconciliationSummary } from '@/lib/queries/finance/reconciliation';
import { financeErrorResponse } from '@/lib/finance/http';
export async function GET(){try{return NextResponse.json({reconciliation:reconciliationSummary()});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
