const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SCHEMA_VERSION,
  getSchemaVersion,
  initializeDatabase,
  migrateSchema,
  openDatabase,
} = require('../lib/db');

function withTempDb(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'last-say-db-foundation-'));
  const dbPath = path.join(dir, 'finance.sqlite');
  const db = openDatabase(dbPath);
  try {
    return run(db);
  } finally {
    try { db.close(); } catch { /* already closed */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('initializeDatabase creates a complete schema and records its version', () => {
  withTempDb((db) => {
    initializeDatabase(db);

    assert.equal(getSchemaVersion(db), SCHEMA_VERSION);
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('transactions', 'correction_log', 'rule_change_log')
      ORDER BY name
    `).all().map((row) => row.name);
    assert.deepEqual(tables, ['correction_log', 'rule_change_log', 'transactions']);
    assert.equal(db.isTransaction, false, 'initializer must commit before returning');
  });
});

test('initializeDatabase refuses a DB created by a newer schema version without writing to it', () => {
  withTempDb((db) => {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);

    assert.throws(
      () => initializeDatabase(db),
      /schema 版本 .*高於本程式支援/,
    );
    assert.equal(getSchemaVersion(db), SCHEMA_VERSION + 1);
    const transactions = db.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = 'transactions'
    `).get().count;
    assert.equal(transactions, 0, 'version guard must run before schema writes');
  });
});

test('migrateSchema rolls back every earlier change when a later schema step fails', () => {
  withTempDb((db) => {
    db.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY,
        account_id INTEGER,
        classification_source TEXT
      );
      CREATE VIEW transaction_report_mappings AS
      SELECT 1 AS transaction_id, 'operating_expense' AS report_line;
    `);

    assert.throws(
      () => migrateSchema(db),
      /views may not be indexed|transaction_report_mappings.*already exists|already exists.*transaction_report_mappings/,
    );

    const columns = db.prepare('PRAGMA table_info(transactions)').all().map((row) => row.name);
    assert.deepEqual(columns, ['id', 'account_id', 'classification_source']);
    const reportRules = db.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = 'report_mapping_rules'
    `).get().count;
    assert.equal(reportRules, 0, 'tables created earlier in the failed migration must roll back');
    assert.equal(db.isTransaction, false, 'failed migration must close its transaction');
  });
});

test('migrateSchema does not commit a transaction owned by its caller', () => {
  withTempDb((db) => {
    db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER)');
    db.exec('BEGIN IMMEDIATE');

    migrateSchema(db);

    assert.equal(db.isTransaction, true);
    db.exec('ROLLBACK');
    const columns = db.prepare('PRAGMA table_info(transactions)').all().map((row) => row.name);
    assert.deepEqual(columns, ['id', 'account_id']);
  });
});
