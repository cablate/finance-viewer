import { NextResponse } from 'next/server';
import { getAccount, updateAccount } from '@/lib/queries/finance/accounts';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(_request,{params}){try{const{key}=await params;return NextResponse.json({account:getAccount(key)});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function PATCH(request,{params}){try{const{key}=await params;return NextResponse.json({account:updateAccount(key,await readFinanceJson(request),actorFromRequest(request))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
