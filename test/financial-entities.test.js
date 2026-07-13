const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {openDatabase,initializeDatabase}=require('../lib/db');
const {createInstitution,addInstitutionAlias}=require('../lib/queries/finance/institutions');
const {createAccount,updateAccount}=require('../lib/queries/finance/accounts');
const {createSource,updateSource}=require('../lib/queries/finance/sources');
const {createSourceExpectation,updateSourceExpectation}=require('../lib/queries/finance/scope');

function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'last-say-entities-'));const db=openDatabase(path.join(dir,'test.sqlite'));initializeDatabase(db);try{return run(db);}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}

test('typed identity, source evidence, expectations, versions, and audit remain coherent',()=>fixture(db=>{
  const institution=createInstitution({display_name:'Example Community Bank',institution_type:'bank',country_code:'TW'},{type:'external_ai'},db);
  const alias=addInstitutionAlias(institution.institution_key,{source_system:'fixture',alias_value:'ECB',authority:'institution_export'},{type:'external_ai'},db);assert.equal(alias.alias_value_normalized,'ECB');
  assert.throws(()=>addInstitutionAlias(institution.institution_key,{source_system:'fixture',alias_value:' ecb ',authority:'institution_export'},{type:'external_ai'},db),error=>error.code==='IDENTITY_CONFLICT');
  const account=createAccount({display_name:'Daily account',entity_key:'personal',institution_key:institution.institution_key,account_kind:'bank',currency:'TWD',authority:'ai_inferred'},{type:'external_ai'},db);
  const updated=updateAccount(account.account_key,{display_name:'Daily account',entity_key:'personal',institution_key:institution.institution_key,account_kind:'bank',currency:'TWD',authority:'user_confirmed',review_state:'confirmed',expected_version:1},{type:'human_ui'},db);assert.equal(updated.version,2);assert.equal(updated.review_state,'confirmed');
  assert.throws(()=>updateAccount(account.account_key,{display_name:'Stale',account_kind:'bank',currency:'TWD',expected_version:1}, {},db),error=>error.code==='VERSION_CONFLICT');
  const source=createSource({source_kind:'bank_statement_csv',description:'Synthetic June statement',period_start:'2026-06-01',period_end:'2026-06-30',institution_key:institution.institution_key,account_key:account.account_key,authority:'institution_export',artifact_status:'external-only'},{type:'external_ai'},db);assert.equal(source.version,1);
  const sourceUpdated=updateSource(source.source_key,{source_kind:'bank_statement_csv',description:'Synthetic June statement reviewed',period_start:'2026-06-01',period_end:'2026-06-30',institution_key:institution.institution_key,account_key:account.account_key,authority:'institution_export',artifact_status:'external-only',expected_version:1},{type:'human_ui'},db);assert.equal(sourceUpdated.version,2);
  const expectation=createSourceExpectation({entity_key:'personal',account_key:account.account_key,target_context:'cash_activity',expected_source_kind:'bank_statement_csv',cadence:'monthly',grace_days:7,authority:'user_confirmed',review_state:'confirmed',goals:['spending_history','cash_flow_statement']},{type:'human_ui'},db);assert.deepEqual(expectation.goals,['cash_flow_statement','spending_history']);
  const expectationUpdated=updateSourceExpectation(expectation.expectation_key,{entity_key:'personal',account_key:account.account_key,target_context:'cash_activity',expected_source_kind:'bank_statement_csv',cadence:'monthly',grace_days:10,authority:'user_confirmed',review_state:'confirmed',goals:['spending_history'],expected_version:1},{type:'human_ui'},db);assert.equal(expectationUpdated.version,2);assert.deepEqual(expectationUpdated.goals,['spending_history']);
  assert.ok(db.prepare('SELECT COUNT(*) count FROM data_change_log').get().count>=7);
  assert.throws(()=>db.prepare('UPDATE data_change_log SET action=? WHERE id=1').run('tamper'),/append-only/);
}));

test('invalid source dates fail before persistence',()=>fixture(db=>{assert.throws(()=>createSource({source_kind:'manual_note',description:'Bad date',period_start:'2026-99-99',authority:'user_confirmed'}, {},db),error=>error.code==='VALIDATION_ERROR');assert.equal(db.prepare('SELECT COUNT(*) count FROM sources').get().count,0);}));

test('source file hints cannot escape ignored roots',()=>fixture(db=>{assert.throws(()=>createSource({source_kind:'manual_note',description:'Unsafe path',source_file:'../private.csv',authority:'user_confirmed'}, {},db),error=>error.code==='VALIDATION_ERROR');const source=createSource({source_kind:'manual_note',description:'Safe path',source_file:'uploads/synthetic.txt',authority:'user_confirmed'}, {},db);assert.equal(source.source_file,'uploads/synthetic.txt');}));
