import { NextResponse } from 'next/server';
import { previewIdentityMerge } from '@/lib/queries/finance/identity-merges';
import { readFinanceJson, financeErrorResponse } from '@/lib/finance/http';
export async function POST(request){try{return NextResponse.json({preview:previewIdentityMerge(await readFinanceJson(request))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
