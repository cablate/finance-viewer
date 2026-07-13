import { NextResponse } from 'next/server';
import { addAccountAlias } from '@/lib/queries/finance/accounts';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function POST(request,{params}){try{const{key}=await params;return NextResponse.json({alias:addAccountAlias(key,await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
