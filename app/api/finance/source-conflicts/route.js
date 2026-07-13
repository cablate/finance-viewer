import { NextResponse } from 'next/server';
import { listSourceConflicts, createSourceConflict } from '@/lib/queries/finance/source-conflicts';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function GET(request){try{return NextResponse.json({conflicts:listSourceConflicts({status:request.nextUrl.searchParams.get('status')||'open'})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({conflict:createSourceConflict(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
