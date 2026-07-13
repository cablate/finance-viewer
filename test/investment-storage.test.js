const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { openDatabase, initializeDatabase } = require('../lib/db');
const { createAccount } = require('../lib/queries/finance/accounts'); const { createSource } = require('../lib/queries/finance/sources');
const { createInstrument, createTrade, createHolding, createMarketQuote } = require('../lib/queries/finance/investments');

function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'last-say-invest-'));const db=openDatabase(path.join(dir,'test.sqlite'));initializeDatabase(db);try{return run(db);}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}

test('instrument, trade and holding retain source authority and decimal strings',()=>fixture(db=>{
  const account=createAccount({display_name:'Synthetic broker',account_kind:'investment',currency:'USD',authority:'user_confirmed',review_state:'confirmed'}, {},db);
  const source=createSource({source_kind:'brokerage_statement',description:'Synthetic broker statement',account_key:account.account_key,authority:'official'}, {},db);
  const instrument=createInstrument({instrument_type:'etf',name:'Synthetic Global Fund',symbol:'SGF',exchange:'TEST',quote_currency:'USD',authority:'official',review_state:'confirmed'}, {},db);
  const trade=createTrade({account_key:account.account_key,instrument_key:instrument.instrument_key,source_key:source.source_key,trade_date:'2026-06-01',activity_type:'buy',quantity_decimal:'10.25',unit_price_decimal:'100.00',net_minor:'102500',currency:'USD',external_id:'trade-1',authority:'official',review_state:'confirmed'}, {},db);
  const holding=createHolding({account_key:account.account_key,instrument_key:instrument.instrument_key,source_key:source.source_key,as_of_date:'2026-06-30',quantity_decimal:'10.25',reported_market_value_minor:'103000',currency:'USD',authority:'official',review_state:'confirmed'}, {},db);
  assert.equal(trade.quantity_decimal,'10.25'); assert.equal(holding.quantity_decimal,'10.25'); assert.equal(db.prepare('SELECT COUNT(*) count FROM investment_trades').get().count,1);
}));

test('unsupported derivatives and quotes without matching source/currency fail closed',()=>fixture(db=>{
  assert.throws(()=>createInstrument({instrument_type:'option',name:'Synthetic option',quote_currency:'USD',authority:'official'}, {},db),error=>error.code==='VALIDATION_ERROR');
  const instrument=createInstrument({instrument_type:'stock',name:'Synthetic Stock',symbol:'SS',exchange:'TEST',quote_currency:'USD',authority:'official'}, {},db);
  assert.throws(()=>createMarketQuote({instrument_key:instrument.instrument_key,price_decimal:'10',quote_currency:'TWD',as_of_date:'2026-07-14',quote_type:'close',provider:'Test',authority:'ai_researched'}, {},db),error=>['SOURCE_REQUIRED','NOT_FOUND','VALIDATION_ERROR'].includes(error.code));
  assert.equal(db.prepare('SELECT COUNT(*) count FROM market_quotes').get().count,0);
}));
