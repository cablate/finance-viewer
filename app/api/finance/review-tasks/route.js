import { NextResponse } from 'next/server';
import { listReviewTasks } from '@/lib/queries/finance/review-tasks';
import { financeErrorResponse } from '@/lib/finance/http';
export async function GET(request){try{return NextResponse.json({tasks:listReviewTasks({status:request.nextUrl.searchParams.get('status')||'open'})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
