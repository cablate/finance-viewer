import { NextResponse } from 'next/server';
import { resolveReviewTask } from '@/lib/queries/finance/review-tasks';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';
export async function PATCH(request,{params}){try{const {key}=await params;return NextResponse.json({task:resolveReviewTask(key,await readFinanceJson(request),actorFromRequest(request))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
