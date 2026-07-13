import { NextResponse } from 'next/server';
import { listInstruments, createInstrument } from '@/lib/queries/finance/investments';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function GET(){try{return NextResponse.json({instruments:listInstruments()});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({instrument:createInstrument(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
