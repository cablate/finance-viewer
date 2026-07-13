import { NextResponse } from 'next/server';
import { listSourceExpectations, createSourceExpectation } from '@/lib/queries/finance/scope';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(request){try{return NextResponse.json({expectations:listSourceExpectations({entity_key:request.nextUrl.searchParams.get('entity')||undefined})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{return NextResponse.json({expectation:createSourceExpectation(await readFinanceJson(request),actorFromRequest(request))},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
