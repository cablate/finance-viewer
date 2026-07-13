import { NextResponse } from 'next/server';
import { listEntities, createEntity } from '@/lib/queries/finance/entities';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(){try{return NextResponse.json({entities:listEntities()});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({entity:createEntity(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
