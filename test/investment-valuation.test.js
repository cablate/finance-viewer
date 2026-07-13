const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { openDatabase, initializeDatabase } = require('../lib/db'); const { createAccount } = require('../lib/queries/finance/accounts'); const { createSource } = require('../lib/queries/finance/sources');
const { createInstrument, createHolding, createMarketQuote, createFxQuote, investmentPositions } = require('../lib/queries/finance/investments');

test('USD holding valuation produces reproducible TWD value and full watermark',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'last-say-value-'));const db=openDatabase(path.join(dir,'test.sqlite'));initializeDatabase(db);try{
  const account=createAccount({display_name:'USD broker',account_kind:'investment',currency:'USD',authority:'user_confirmed',review_state:'confirmed'}, {},db);
  const statement=createSource({source_kind:'brokerage_statement',description:'Synthetic holdings',account_key:account.account_key,authority:'official'}, {},db);
  const quoteSource=createSource({source_kind:'market_quote_evidence',description:'Synthetic market quote URL evidence',authority:'ai_researched'}, {},db);
  const fxSource=createSource({source_kind:'fx_quote_evidence',description:'Synthetic FX URL evidence',authority:'ai_researched'}, {},db);
  const instrument=createInstrument({instrument_type:'etf',name:'Example Global Fund',symbol:'EXGF',exchange:'TEST',quote_currency:'USD',authority:'official',review_state:'confirmed'}, {},db);
  const holding=createHolding({account_key:account.account_key,instrument_key:instrument.instrument_key,source_key:statement.source_key,as_of_date:'2026-06-30',quantity_decimal:'10.25',currency:'USD',authority:'official',review_state:'confirmed'}, {},db);
  const quote=createMarketQuote({instrument_key:instrument.instrument_key,source_key:quoteSource.source_key,price_decimal:'101.23',quote_currency:'USD',as_of_date:'2026-07-14',quote_type:'close',provider:'Provider A',authority:'ai_researched',review_state:'reviewed'}, {},db);
  createMarketQuote({instrument_key:instrument.instrument_key,source_key:createSource({source_kind:'market_quote_evidence',description:'Second provider',authority:'ai_researched'}, {},db).source_key,price_decimal:'101.20',quote_currency:'USD',as_of_date:'2026-07-14',quote_type:'close',provider:'Provider B',authority:'ai_researched'}, {},db);
  const fx=createFxQuote({source_key:fxSource.source_key,base_currency:'USD',quote_currency:'TWD',rate_decimal:'32.5',as_of_date:'2026-07-14',provider:'FX Provider',authority:'ai_researched',review_state:'reviewed'}, {},db);
  const result=investmentPositions({entityKey:'personal',asOfDate:'2026-07-14',baseCurrency:'TWD'},db)[0];
  assert.equal(result.derived_value_minor,'103761'); assert.equal(result.base_value_minor,'3372232'); assert.deepEqual(result.watermark,{holding_key:holding.holding_key,quote_key:quote.quote_key,fx_key:fx.fx_key}); assert.equal(db.prepare('SELECT COUNT(*) count FROM market_quotes').get().count,2);
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}});
