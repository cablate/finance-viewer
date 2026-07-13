import { NextResponse } from 'next/server';
import { addInstitutionAlias } from '@/lib/queries/finance/institutions';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function POST(request,{params}){try{const{key}=await params;return NextResponse.json({alias:addInstitutionAlias(key,await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
