import { NextResponse } from 'next/server';
import { getInstitution, updateInstitution } from '@/lib/queries/finance/institutions';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(_request,{params}){try{const{key}=await params;return NextResponse.json({institution:getInstitution(key)});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function PATCH(request,{params}){try{const{key}=await params;return NextResponse.json({institution:updateInstitution(key,await readFinanceJson(request),actorFromRequest(request))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
