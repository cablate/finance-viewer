import { NextResponse } from 'next/server';
import { createHumanConfirmation, listHumanConfirmations } from '@/lib/queries/finance/human-confirmations';
import { readFinanceJson, financeErrorResponse } from '@/lib/finance/http';

export async function GET(request){try{return NextResponse.json({confirmations:listHumanConfirmations({status:request.nextUrl.searchParams.get('status')||'pending'})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({proposal:createHumanConfirmation(await readFinanceJson(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
