import { NextResponse } from 'next/server';
import { resolveIdentityRedirect } from '@/lib/queries/finance/identity-merges';
import { financeErrorResponse } from '@/lib/finance/http';
export async function GET(request){try{const p=request.nextUrl.searchParams;return NextResponse.json({redirect:resolveIdentityRedirect(p.get('type'),p.get('key'))});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
