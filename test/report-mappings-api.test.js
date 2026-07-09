const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// WP1 — POST /api/reports/mappings 寫入層測試。
// 直接測 queries/reports/mappings 的 upsertTransactionReportMapping（route 只是薄殼）。
// 覆蓋：白名單校驗、transaction_id 存在驗證、INSERT OR REPLACE、錯誤類型、不寫金額/日期/來源。
// 採既有 income-statement 測試的子程序 CJS 模式（require ./lib/...）。

function runFixture(setup, op) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-mappings-q-'));
  const dbPath = path.join(dir, 'finance.sqlite');
  const script = `
    const { getDb } = require('./lib/db');
    const { upsertTransactionReportMapping } = require('./lib/queries');
    const db = getDb();
    ${setup}
    let result;
    try {
      result = { ok: true, value: ${op} };
    } catch (e) {
      result = { ok: false, name: e.constructor.name, message: e.message, notFound: !!e.notFound };
    }
    process.stdout.write(JSON.stringify(result));
  `;
  let output;
  try {
    output = execFileSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, FINANCE_DB_PATH: dbPath, NODE_ENV: 'development' },
      timeout: 30000,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return JSON.parse(output);
}

function seedOneTransaction() {
  return `
    const aid = db.prepare("INSERT INTO accounts (name, account_type) VALUES ('A','bank')").run().lastInsertRowid;
    db.prepare(\`INSERT INTO transactions
      (dedupe_key, import_match_key, transaction_date, transaction_month,
       source_type, flow_type, name, amount, inflow, outflow,
       category_primary, account_id) VALUES ('d1','k1','2026-06-01','2026-06','bank','purchase','Coffee',-100,0,100,'飲食',\${aid})\`).run();
  `;
}

test('mappings: inserts a valid report mapping for an existing transaction', () => {
  const r = runFixture(
    seedOneTransaction(),
    "upsertTransactionReportMapping({ transaction_id: 1, report_line: 'expense:food', mapping_source: 'ai', confidence: 0.9, reason: 'test' })",
  );
  assert.equal(r.ok, true);
  assert.equal(r.value.transaction_id, 1);
  assert.equal(r.value.report_line, 'expense:food');
});

test('mappings: rejects unknown report_line (whitelist)', () => {
  const r = runFixture(
    seedOneTransaction(),
    "upsertTransactionReportMapping({ transaction_id: 1, report_line: 'expense:totally_fake_line' })",
  );
  assert.equal(r.ok, false);
  assert.match(r.message, /白名單/);
});

test('mappings: 404 (notFound) when transaction_id does not exist', () => {
  const r = runFixture(
    `/* no transactions */`,
    "upsertTransactionReportMapping({ transaction_id: 9999, report_line: 'expense:food' })",
  );
  assert.equal(r.ok, false);
  assert.equal(r.notFound, true);
  assert.match(r.message, /不存在/);
});

test('mappings: rejects missing report_line', () => {
  const r = runFixture(
    seedOneTransaction(),
    "upsertTransactionReportMapping({ transaction_id: 1 })",
  );
  assert.equal(r.ok, false);
  assert.match(r.message, /report_line/);
});

test('mappings: rejects invalid confidence range', () => {
  const r = runFixture(
    seedOneTransaction(),
    "upsertTransactionReportMapping({ transaction_id: 1, report_line: 'expense:food', confidence: 1.5 })",
  );
  assert.equal(r.ok, false);
  assert.match(r.message, /confidence/);
});

test('mappings: defaults mapping_source to ai when omitted (verified in DB)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-mappings-src-'));
  const dbPath = path.join(dir, 'finance.sqlite');
  const script = `
    const { getDb } = require('./lib/db');
    const { upsertTransactionReportMapping } = require('./lib/queries');
    const db = getDb();
    const aid = db.prepare("INSERT INTO accounts (name, account_type) VALUES ('A','bank')").run().lastInsertRowid;
    db.prepare(\`INSERT INTO transactions
      (dedupe_key, import_match_key, transaction_date, transaction_month,
       source_type, flow_type, name, amount, inflow, outflow,
       category_primary, account_id) VALUES ('d1','k1','2026-06-01','2026-06','bank','purchase','Coffee',-100,0,100,'飲食',\${aid})\`).run();
    upsertTransactionReportMapping({ transaction_id: 1, report_line: 'expense:food' });
    const row = db.prepare('SELECT mapping_source, report_line, confidence FROM transaction_report_mappings WHERE transaction_id = 1').get();
    process.stdout.write(JSON.stringify(row));
  `;
  let output;
  try {
    output = execFileSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, FINANCE_DB_PATH: dbPath, NODE_ENV: 'development' },
      timeout: 30000,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const row = JSON.parse(output);
  assert.equal(row.mapping_source, 'ai');
  assert.equal(row.report_line, 'expense:food');
  assert.equal(row.confidence, null);
});

test('mappings: INSERT OR REPLACE updates existing mapping for same transaction_id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-mappings-replace-'));
  const dbPath = path.join(dir, 'finance.sqlite');
  const script = `
    const { getDb } = require('./lib/db');
    const { upsertTransactionReportMapping } = require('./lib/queries');
    const db = getDb();
    const aid = db.prepare("INSERT INTO accounts (name, account_type) VALUES ('A','bank')").run().lastInsertRowid;
    db.prepare(\`INSERT INTO transactions
      (dedupe_key, import_match_key, transaction_date, transaction_month,
       source_type, flow_type, name, amount, inflow, outflow,
       category_primary, account_id) VALUES ('d1','k1','2026-06-01','2026-06','bank','purchase','Coffee',-100,0,100,'飲食',\${aid})\`).run();
    upsertTransactionReportMapping({ transaction_id: 1, report_line: 'expense:food' });
    upsertTransactionReportMapping({ transaction_id: 1, report_line: 'expense:daily_living' });
    const row = db.prepare('SELECT report_line FROM transaction_report_mappings WHERE transaction_id = 1').get();
    const count = db.prepare('SELECT COUNT(*) AS c FROM transaction_report_mappings WHERE transaction_id = 1').get().c;
    process.stdout.write(JSON.stringify({ row, count }));
  `;
  let output;
  try {
    output = execFileSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, FINANCE_DB_PATH: dbPath, NODE_ENV: 'development' },
      timeout: 30000,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const result = JSON.parse(output);
  assert.equal(result.count, 1, 'should still be 1 row after replace');
  assert.equal(result.row.report_line, 'expense:daily_living');
});
