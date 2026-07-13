const { validateSchemaShape, requiredString, optionalString, enumValue, isoDate, booleanInt, expectedVersion, FinanceError } = require('../../finance/contracts');
const { getDb, stableKey, logChange, requireRow, assertVersion, withTransaction } = require('./common');
const { isConfirmationAuthorization } = require('./authorization');

function entityByKey(db,key){return requireRow(db.prepare('SELECT * FROM reporting_entities WHERE entity_key=?').get(key),'Entity');}
function accountByKey(db,key){return key?requireRow(db.prepare('SELECT * FROM accounts WHERE account_key=?').get(key),'Account'):null;}
function sourceByKey(db,key){return key?requireRow(db.prepare('SELECT * FROM sources WHERE source_key=?').get(key),'Source'):null;}

function listScopeAttestations(filters={},db=getDb()){
  const where=[];const params=[];
  if(filters.entity_key){where.push('e.entity_key=?');params.push(filters.entity_key);}
  if(filters.scope_kind){where.push('s.scope_kind=?');params.push(filters.scope_kind);}
  return db.prepare(`SELECT s.*,e.entity_key,src.source_key FROM scope_attestations s JOIN reporting_entities e ON e.id=s.entity_id LEFT JOIN sources src ON src.id=s.source_id ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY s.as_of_date DESC,s.id DESC`).all(...params);
}

function getScopeAttestation(key,db=getDb()){return requireRow(db.prepare(`SELECT s.*,e.entity_key,src.source_key FROM scope_attestations s JOIN reporting_entities e ON e.id=s.entity_id LEFT JOIN sources src ON src.id=s.source_id WHERE s.attestation_key=?`).get(key),'Scope attestation');}

function normalizedAttestation(input,db){
  validateSchemaShape('scope_attestation',input);const entity=entityByKey(db,input.entity_key);const source=sourceByKey(db,input.source_key);
  const coverage=enumValue(input.coverage_state,'coverage_state','coverage_state');const authority=enumValue(input.authority,'authority','authority');
  if(coverage==='declared_complete'&&authority!=='user_confirmed'&&authority!=='official')throw new FinanceError('HUMAN_CONFIRMATION_REQUIRED','declared_complete requires user-confirmed or official inventory evidence',{status:403});
  return{entity_id:entity.id,scope_kind:enumValue(input.scope_kind,'scope_kind','scope_kind'),as_of_date:isoDate(input.as_of_date,'as_of_date'),coverage_state:coverage,included_note:optionalString(input.included_note,'included_note',1000),excluded_note:optionalString(input.excluded_note,'excluded_note',1000),valid_until:input.valid_until?isoDate(input.valid_until,'valid_until'):null,source_id:source?.id||null,authority,review_state:enumValue(input.review_state,'review_state','review_state',coverage==='declared_complete'?'confirmed':'needs_review')};
}

function createScopeAttestation(input,actor={},db=getDb(),authorization=null){
  const value=normalizedAttestation(input,db);if(value.coverage_state==='declared_complete'&&!isConfirmationAuthorization(authorization,'declare_scope_complete'))throw new FinanceError('HUMAN_CONFIRMATION_REQUIRED','A confirmed one-time receipt is required',{status:403});
  const key=stableKey();return withTransaction(db,()=>{db.prepare(`INSERT INTO scope_attestations(attestation_key,entity_id,scope_kind,as_of_date,coverage_state,included_note,excluded_note,valid_until,source_id,authority,review_state)VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(key,value.entity_id,value.scope_kind,value.as_of_date,value.coverage_state,value.included_note,value.excluded_note,value.valid_until,value.source_id,value.authority,value.review_state);const row=getScopeAttestation(key,db);logChange(db,{resourceType:'scope_attestation',resourceKey:key,action:'create',after:row,actorType:actor.type,actorNote:actor.note});return row;});
}

function listSourceExpectations(filters={},db=getDb()){
  const where=[];const params=[];if(filters.entity_key){where.push('e.entity_key=?');params.push(filters.entity_key);}
  const rows=db.prepare(`SELECT x.*,e.entity_key,a.account_key FROM source_expectations x JOIN reporting_entities e ON e.id=x.entity_id LEFT JOIN accounts a ON a.id=x.account_id ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY x.active DESC,x.id`).all(...params);
  const goals=db.prepare('SELECT goal_key FROM source_expectation_goals WHERE expectation_id=? ORDER BY goal_key');return rows.map(row=>({...row,goals:goals.all(row.id).map(item=>item.goal_key)}));
}

function getSourceExpectation(key,db=getDb()){const row=requireRow(db.prepare(`SELECT x.*,e.entity_key,a.account_key FROM source_expectations x JOIN reporting_entities e ON e.id=x.entity_id LEFT JOIN accounts a ON a.id=x.account_id WHERE x.expectation_key=?`).get(key),'Source expectation');return{...row,goals:db.prepare('SELECT goal_key FROM source_expectation_goals WHERE expectation_id=? ORDER BY goal_key').all(row.id).map(item=>item.goal_key)};}

function normalizedExpectation(input,db){validateSchemaShape('source_expectation',input);const entity=entityByKey(db,input.entity_key);const account=accountByKey(db,input.account_key);if(!Array.isArray(input.goals)||!input.goals.length)throw new FinanceError('VALIDATION_ERROR','goals must be a non-empty array',{field:'goals'});const goals=[...new Set(input.goals.map(goal=>enumValue(goal,'analysis_goal','goals')))];return{entity_id:entity.id,account_id:account?.id||null,target_context:enumValue(input.target_context,'target_context','target_context'),expected_source_kind:enumValue(input.expected_source_kind,'source_kind','expected_source_kind'),cadence:enumValue(input.cadence,'cadence','cadence'),grace_days:Math.min(366,Math.max(0,Number(input.grace_days||0))),period_anchor:optionalString(input.period_anchor,'period_anchor',40),active:booleanInt(input.active,true),authority:enumValue(input.authority,'authority','authority'),review_state:enumValue(input.review_state,'review_state','review_state','needs_review'),goals};}

function createSourceExpectation(input,actor={},db=getDb()){const value=normalizedExpectation(input,db);const key=stableKey();return withTransaction(db,()=>{const result=db.prepare(`INSERT INTO source_expectations(expectation_key,entity_id,account_id,target_context,expected_source_kind,cadence,grace_days,period_anchor,active,authority,review_state)VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(key,value.entity_id,value.account_id,value.target_context,value.expected_source_kind,value.cadence,value.grace_days,value.period_anchor,value.active,value.authority,value.review_state);const insertGoal=db.prepare('INSERT INTO source_expectation_goals(expectation_id,goal_key)VALUES(?,?)');for(const goal of value.goals)insertGoal.run(result.lastInsertRowid,goal);const row=getSourceExpectation(key,db);logChange(db,{resourceType:'source_expectation',resourceKey:key,action:'create',after:row,actorType:actor.type,actorNote:actor.note});return row;});}

function updateSourceExpectation(key,input,actor={},db=getDb()){const version=expectedVersion(input.expected_version);return withTransaction(db,()=>{const before=getSourceExpectation(key,db);assertVersion(before,version);const value=normalizedExpectation(input,db);db.prepare(`UPDATE source_expectations SET entity_id=?,account_id=?,target_context=?,expected_source_kind=?,cadence=?,grace_days=?,period_anchor=?,active=?,authority=?,review_state=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE expectation_key=?`).run(value.entity_id,value.account_id,value.target_context,value.expected_source_kind,value.cadence,value.grace_days,value.period_anchor,value.active,value.authority,value.review_state,key);db.prepare('DELETE FROM source_expectation_goals WHERE expectation_id=?').run(before.id);const insertGoal=db.prepare('INSERT INTO source_expectation_goals(expectation_id,goal_key)VALUES(?,?)');for(const goal of value.goals)insertGoal.run(before.id,goal);const after=getSourceExpectation(key,db);logChange(db,{resourceType:'source_expectation',resourceKey:key,action:'update',before,after,actorType:actor.type,actorNote:actor.note});return after;});}

function coarseScopeStatus({entityKey='personal',scopeKind},db=getDb()){
  const entity=entityByKey(db,entityKey);const row=db.prepare(`SELECT * FROM scope_attestations WHERE entity_id=? AND scope_kind=? AND invalidated_at IS NULL ORDER BY as_of_date DESC,id DESC LIMIT 1`).get(entity.id,scopeKind);
  if(!row)return{status:'partial',gap:'missing_scope_attestation'};if(row.valid_until&&row.valid_until<new Date().toISOString().slice(0,10))return{status:'partial',gap:'expired_scope_attestation',attestation_key:row.attestation_key};if(row.coverage_state!=='declared_complete')return{status:'partial',gap:'scope_not_complete',attestation_key:row.attestation_key};return{status:'complete',attestation_key:row.attestation_key};
}

module.exports={listScopeAttestations,getScopeAttestation,createScopeAttestation,listSourceExpectations,getSourceExpectation,createSourceExpectation,updateSourceExpectation,coarseScopeStatus};
