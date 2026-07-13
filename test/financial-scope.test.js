const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {openDatabase,initializeDatabase}=require('../lib/db');
const {createAccount,addAccountAlias}=require('../lib/queries/finance/accounts');
const {createScopeAttestation,coarseScopeStatus}=require('../lib/queries/finance/scope');
const {createHumanConfirmation,confirmHumanConfirmation,consumeHumanConfirmation}=require('../lib/queries/finance/human-confirmations');

function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'last-say-scope-'));const db=openDatabase(path.join(dir,'test.sqlite'));initializeDatabase(db);try{return run(db);}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}

test('rows do not imply complete scope and new accounts invalidate prior attestations',()=>fixture(db=>{
  const first=createAccount({display_name:'Synthetic checking',account_kind:'bank',currency:'TWD'}, {type:'external_ai'},db);
  assert.deepEqual(coarseScopeStatus({scopeKind:'cash_accounts'},db),{status:'partial',gap:'missing_scope_attestation'});
  const scopePayload={entity_key:'personal',scope_kind:'cash_accounts',as_of_date:'2026-07-14',coverage_state:'declared_complete',authority:'user_confirmed'};
  const proposal=createHumanConfirmation({action_kind:'declare_scope_complete',resource_type:'scope_attestation',payload:scopePayload},db);
  const receipt=confirmHumanConfirmation(proposal.proposal_key,{browserConfirmed:true},db);
  const attestation=consumeHumanConfirmation({action_kind:'declare_scope_complete',resource_type:'scope_attestation',resource_key:null,payload:scopePayload,expected_version:null,proposal_key:proposal.proposal_key,confirmation_receipt:receipt.confirmation_receipt},authorization=>createScopeAttestation(scopePayload,{type:'human_ui'},db,authorization),db);
  assert.equal(coarseScopeStatus({scopeKind:'cash_accounts'},db).status,'complete');
  const second=createAccount({display_name:'Synthetic checking',account_kind:'bank',currency:'TWD'}, {type:'external_ai'},db);
  assert.notEqual(first.account_key,second.account_key);assert.equal(second.display_name,first.display_name);assert.equal(second.review_state,'needs_review');
  const stored=db.prepare('SELECT invalidated_at,invalidation_reason FROM scope_attestations WHERE attestation_key=?').get(attestation.attestation_key);assert.ok(stored.invalidated_at);assert.match(stored.invalidation_reason,/New bank account/);
  assert.equal(coarseScopeStatus({scopeKind:'cash_accounts'},db).status,'partial');
}));

test('account alias conflicts remain visible instead of silently rebinding',()=>fixture(db=>{
  const a=createAccount({display_name:'Account A',account_kind:'bank',currency:'TWD'}, {},db);const b=createAccount({display_name:'Account B',account_kind:'bank',currency:'TWD'}, {},db);
  addAccountAlias(a.account_key,{source_system:'fixture',alias_type:'source_account_id',alias_value:'same-alias'}, {},db);
  assert.throws(()=>addAccountAlias(b.account_key,{source_system:'fixture',alias_type:'source_account_id',alias_value:'same-alias'}, {},db),error=>error.code==='IDENTITY_CONFLICT');
  assert.equal(db.prepare('SELECT account_id FROM account_aliases').get().account_id,a.id);
}));
