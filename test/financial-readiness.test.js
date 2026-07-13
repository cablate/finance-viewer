const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { openDatabase, initializeDatabase } = require('../lib/db'); const { createAccount } = require('../lib/queries/finance/accounts'); const { createSource } = require('../lib/queries/finance/sources');
const { createInstrument, createHolding, createMarketQuote } = require('../lib/queries/finance/investments'); const { readinessForGoal } = require('../lib/queries/finance/inventory');

test('investment readiness distinguishes missing and stale quotes',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'last-say-ready-'));const db=openDatabase(path.join(dir,'test.sqlite'));initializeDatabase(db);try{
  const account=createAccount({display_name:'Broker',account_kind:'investment',currency:'TWD',authority:'user_confirmed',review_state:'confirmed'}, {},db); const statement=createSource({source_kind:'brokerage_statement',description:'Holdings',account_key:account.account_key,authority:'official'}, {},db); const quoteSource=createSource({source_kind:'market_quote_evidence',description:'Quote evidence',authority:'ai_researched'}, {},db);
  const missing=createInstrument({instrument_type:'etf',name:'Missing Quote ETF',symbol:'MISS',exchange:'TEST',quote_currency:'TWD',authority:'official'}, {},db); createHolding({account_key:account.account_key,instrument_key:missing.instrument_key,source_key:statement.source_key,as_of_date:'2026-06-30',quantity_decimal:'1',currency:'TWD',authority:'official'}, {},db);
  let readiness=readinessForGoal('investment_value',{asOfDate:'2026-07-14'},db); assert.ok(readiness.gaps.some(gap=>gap.gap==='investment_missing_quote'));
  createMarketQuote({instrument_key:missing.instrument_key,source_key:quoteSource.source_key,price_decimal:'100',quote_currency:'TWD',as_of_date:'2026-03-31',quote_type:'close',provider:'Old',authority:'ai_researched'}, {},db);
  readiness=readinessForGoal('investment_value',{asOfDate:'2026-07-14'},db); assert.equal(readiness.status,'stale'); assert.ok(readiness.gaps.some(gap=>gap.gap==='investment_stale'));
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}});
