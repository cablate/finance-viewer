import { NextResponse } from 'next/server';
import { resolveSourceConflict } from '@/lib/queries/finance/source-conflicts';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function POST(request,{params}){try{const {key}=await params;return NextResponse.json({conflict:resolveSourceConflict(key,await readFinanceJson(request),actorFromRequest(request))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
