const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase, initializeDatabase } = require('../lib/db');
const { createAccount } = require('../lib/queries/finance/accounts');
const { createSource } = require('../lib/queries/finance/sources');
const { createBalanceSnapshot } = require('../lib/queries/finance/balances');
const { createCashActivity } = require('../lib/queries/finance/cash-activity');
const { analysisContext } = require('../lib/queries/finance/analysis-context');
const { readFinanceJson } = require('../lib/finance/http');

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'last-say-analysis-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  initializeDatabase(db);
  try {
    const account = createAccount({ display_name: 'Synthetic analysis cash', account_kind: 'bank', currency: 'TWD', authority: 'user_confirmed', review_state: 'confirmed' }, {}, db);
    const source = createSource({ source_kind: 'bank_statement_csv', description: 'Synthetic private filename must not leak', source_file: 'uploads/private-synthetic.csv', account_key: account.account_key, authority: 'institution_export', review_state: 'reviewed' }, {}, db);
    createBalanceSnapshot({ account_key: account.account_key, source_key: source.source_key, as_of_date: '2026-06-30', observed_at: '2026-07-01T00:00:00Z', balance_kind: 'statement', amount_minor: '9300000', currency: 'TWD', authority: 'official', review_state: 'confirmed' }, {}, db);
    createCashActivity({ account_key: account.account_key, source_key: source.source_key, transaction_date: '2026-06-20', external_id: 'analysis-1', name: 'SYNTHETIC RENT', amount_minor: '-1800000', currency: 'TWD', flow_type: 'expense', category_primary: 'housing', judgment_reason: 'Synthetic fixture' }, {}, db);

    const legacyAccountId = db.prepare("INSERT INTO accounts(name,account_type)VALUES('Legacy personal card','card')").run().lastInsertRowid;
    db.prepare(`INSERT INTO transactions(dedupe_key,import_match_key,transaction_date,transaction_month,source_type,flow_type,name,amount,inflow,outflow,category_primary,category_sub,ai_confidence,judgment_reason,account_id,classification_source,reviewed,transaction_key,currency,amount_minor,inflow_minor,outflow_minor,record_status) VALUES('legacy-analysis','legacy-analysis','2026-05-15','2026-05','legacy card','card spend','LEGACY SYNTHETIC',-2500,0,2500,'shopping','',0.7,'Legacy fixture',?,'ai',0,'legacy-analysis','TWD','-250000','0','250000','posted')`).run(legacyAccountId);
    return run(db, account);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('named analysis datasets enforce filters, pagination, provenance, legacy coverage, and privacy', () => fixture((db, account) => {
  const request = { entity: 'personal', as_of: '2026-07-14', datasets: [{ name: 'cash_activity', from: '2026-05-01', to: '2026-06-30', group_by: 'month', limit: 12 }, { name: 'account_balances', account_key: account.account_key, freshness: true, limit: 10 }] };
  const first = analysisContext(request, db);
  const second = analysisContext(request, db);
  assert.deepEqual(first, second);
  assert.equal(first.policy_version, 'finance-readiness/1');
  assert.equal(first.datasets[0].rows.find((row) => row.month === '2026-06').outflow_minor, '1800000');
  assert.equal(first.datasets[0].rows.find((row) => row.month === '2026-05').outflow_minor, '250000');
  assert.equal(first.datasets[1].rows[0].balance.selected.amount_minor, '9300000');
  assert.ok(first.datasets.every((dataset) => dataset.provenance.source_watermark));
  const serialized = JSON.stringify(first);
  for (const forbidden of ['source_file', 'raw_info', 'content_sha256', 'private-synthetic.csv']) assert.equal(serialized.includes(forbidden), false);
  assert.equal(first.response_bytes, Buffer.byteLength(serialized));
  assert.ok(first.response_bytes < 512 * 1024);
}));

test('analysis context rejects arbitrary datasets, SQL-like fields, invalid filters, excessive limits, and oversized batches', () => fixture((db) => {
  assert.throws(() => analysisContext({ datasets: [{ name: 'sqlite_query' }] }, db), (error) => error.code === 'UNKNOWN_SCHEMA');
  assert.throws(() => analysisContext({ datasets: [{ name: 'cash_activity', sql: 'SELECT * FROM transactions' }] }, db), (error) => error.code === 'VALIDATION_ERROR');
  assert.throws(() => analysisContext({ datasets: [{ name: 'account_balances', freshness: 'yes' }] }, db), (error) => error.code === 'VALIDATION_ERROR');
  assert.throws(() => analysisContext({ datasets: [{ name: 'valued_items', item_type: 'anything' }] }, db), (error) => error.code === 'VALIDATION_ERROR');
  assert.throws(() => analysisContext({ datasets: [{ name: 'cash_activity', limit: 201 }] }, db), (error) => error.code === 'VALIDATION_ERROR');
  assert.throws(() => analysisContext({ datasets: Array.from({ length: 9 }, () => ({ name: 'reconciliation' })) }, db), (error) => error.code === 'VALIDATION_ERROR');
}));

test('finance JSON reader enforces actual UTF-8 request size without Content-Length', async () => {
  const request = new Request('http://localhost/api/finance/analysis-context', { method: 'POST', body: JSON.stringify({ padding: 'x'.repeat(70 * 1024) }) });
  await assert.rejects(readFinanceJson(request, { maxBytes: 64 * 1024 }), (error) => error.code === 'VALIDATION_ERROR' && error.status === 413);
});
