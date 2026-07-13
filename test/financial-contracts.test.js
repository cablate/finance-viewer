const test=require('node:test');const assert=require('node:assert/strict');
const {ENUMS,SCHEMAS,validateSchemaShape,FinanceError}=require('../lib/finance/contracts');
const {getFinanceCapabilities}=require('../lib/finance/capabilities');

test('capabilities and JSON Schemas share the runtime enum owner',()=>{const capabilities=getFinanceCapabilities();assert.strictEqual(capabilities.enums,ENUMS);assert.equal(capabilities.schemas.account,SCHEMAS.account.$id);assert.deepEqual(SCHEMAS.account.properties.account_kind.enum,ENUMS.account_kind);});
test('schema shape rejects unknown fields and unknown schema',()=>{assert.throws(()=>validateSchemaShape('account',{display_name:'A',account_kind:'bank',currency:'TWD',table:'transactions'}),error=>error instanceof FinanceError&&error.code==='VALIDATION_ERROR');assert.throws(()=>validateSchemaShape('anything',{}),error=>error.code==='UNKNOWN_SCHEMA');});
test('new money and decimal schemas forbid float canonical facts',()=>{assert.equal(SCHEMAS.account.properties.currency.type,'string');assert.equal(require('../lib/finance/contracts').SHARED_DEFINITIONS.money_minor.type,'string');assert.match(require('../lib/finance/contracts').SHARED_DEFINITIONS.decimal.pattern,/\\d/);});
