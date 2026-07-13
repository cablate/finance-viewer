import { NextResponse } from 'next/server';
import { getEntity, updateEntity } from '@/lib/queries/finance/entities';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(_request,{params}){try{const{key}=await params;return NextResponse.json({entity:getEntity(key)});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function PATCH(request,{params}){try{const{key}=await params;return NextResponse.json({entity:updateEntity(key,await readFinanceJson(request),actorFromRequest(request))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
