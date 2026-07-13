import { NextResponse } from 'next/server';
import { listScopeAttestations, createScopeAttestation } from '@/lib/queries/finance/scope';
import { consumeHumanConfirmation } from '@/lib/queries/finance/human-confirmations';
import { getDb } from '@/lib/db';
import { readFinanceJson, actorFromRequest, financeErrorResponse } from '@/lib/finance/http';

export async function GET(request){try{const p=request.nextUrl.searchParams;return NextResponse.json({attestations:listScopeAttestations({entity_key:p.get('entity')||undefined,scope_kind:p.get('scope')||undefined})});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
export async function POST(request){try{const body=await readFinanceJson(request);const actor=actorFromRequest(request);let attestation;if(body.coverage_state==='declared_complete'){const payload={...body};delete payload.proposal_key;delete payload.confirmation_receipt;const db=getDb();attestation=consumeHumanConfirmation({action_kind:'declare_scope_complete',resource_type:'scope_attestation',resource_key:null,payload,expected_version:null,proposal_key:body.proposal_key,confirmation_receipt:body.confirmation_receipt},authorization=>createScopeAttestation(payload,actor,db,authorization),db);}else{attestation=createScopeAttestation(body,actor);}return NextResponse.json({attestation},{status:201});}catch(error){const r=financeErrorResponse(error);return NextResponse.json(r.body,{status:r.status});}}
