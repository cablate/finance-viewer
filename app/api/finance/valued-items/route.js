import { NextResponse } from 'next/server';
import { listValuedItems, createValuedItem } from '@/lib/queries/finance/valued-items';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function GET(request){try{const p=request.nextUrl.searchParams;return NextResponse.json({items:listValuedItems({entityKey:p.get('entity')||'personal',asOfDate:p.get('as_of')||new Date().toLocaleDateString('en-CA')})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({item:createValuedItem(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
