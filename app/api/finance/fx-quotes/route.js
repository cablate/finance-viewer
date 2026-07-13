import { NextResponse } from 'next/server';
import { createFxQuote } from '@/lib/queries/finance/investments';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function POST(request){try{return NextResponse.json({fx_quote:createFxQuote(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
