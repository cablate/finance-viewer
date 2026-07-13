import { NextResponse } from 'next/server';
import { createHolding, investmentPositions } from '@/lib/queries/finance/investments';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function GET(request){try{const p=request.nextUrl.searchParams;return NextResponse.json({positions:investmentPositions({entityKey:p.get('entity')||'personal',asOfDate:p.get('as_of')||new Date().toLocaleDateString('en-CA'),baseCurrency:p.get('base')||'TWD'})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({holding:createHolding(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
