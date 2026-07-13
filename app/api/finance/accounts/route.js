import { NextResponse } from 'next/server';
import { listAccounts, createAccount } from '@/lib/queries/finance/accounts';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(request){try{const p=request.nextUrl.searchParams;return NextResponse.json({accounts:listAccounts({entity_key:p.get('entity')||undefined,active:p.has('active')?p.get('active')!=='0':undefined})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({account:createAccount(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
