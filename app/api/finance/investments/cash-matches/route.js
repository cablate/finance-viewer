import { NextResponse } from 'next/server';
import { createInvestmentCashMatch } from '@/lib/queries/finance/investments';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function POST(request){try{return NextResponse.json({cash_match:createInvestmentCashMatch(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
