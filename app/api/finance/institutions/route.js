import { NextResponse } from 'next/server';
import { listInstitutions, createInstitution } from '@/lib/queries/finance/institutions';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(){try{return NextResponse.json({institutions:listInstitutions()});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({institution:createInstitution(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
