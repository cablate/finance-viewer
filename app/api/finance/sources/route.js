import { NextResponse } from 'next/server';
import { listSources, createSource } from '@/lib/queries/finance/sources';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(request){try{const p=request.nextUrl.searchParams;return NextResponse.json({sources:listSources({account_key:p.get('account')||undefined,source_kind:p.get('kind')||undefined})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({source:createSource(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
