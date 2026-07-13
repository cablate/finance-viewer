import { NextResponse } from 'next/server';
import { getSourceExpectation, updateSourceExpectation } from '@/lib/queries/finance/scope';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(_request,{params}){try{const{key}=await params;return NextResponse.json({expectation:getSourceExpectation(key)});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function PATCH(request,{params}){try{const{key}=await params;return NextResponse.json({expectation:updateSourceExpectation(key,await readFinanceJson(request),actorFromRequest(request))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
