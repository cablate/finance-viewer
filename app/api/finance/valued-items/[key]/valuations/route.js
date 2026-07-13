import { NextResponse } from 'next/server';
import { createValuation } from '@/lib/queries/finance/valued-items';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function POST(request,{params}){try{const {key}=await params;return NextResponse.json({valuation:createValuation(key,await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
