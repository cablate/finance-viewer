import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const repoRoot = path.resolve(import.meta.dirname, '../../..');

function parseOutput(argv) {
  const index = argv.indexOf('--output');
  if (index === -1 || !argv[index + 1]) {
    throw new Error('Usage: build-legacy-v0.2.3.mjs --output <explicit-temp-path>');
  }
  const output = path.resolve(argv[index + 1]);
  const relative = path.relative(repoRoot, output);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Legacy fixture output must be outside the repository. Use an explicit temporary path.');
  }
  if (fs.existsSync(output)) throw new Error(`Refusing to overwrite existing target: ${output}`);
  return output;
}

const output = parseOutput(process.argv.slice(2));
fs.mkdirSync(path.dirname(output), { recursive: true });
process.env.FINANCE_DB_PATH = output;
const db = new DatabaseSync(output);

try {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      institution TEXT NOT NULL DEFAULT 'Imported Source',
      account_type TEXT NOT NULL,
      masked_number TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_file TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      statement_month TEXT,
      row_count INTEGER,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_type, source_file, description)
    );
    CREATE TABLE classification_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_key TEXT, source_type TEXT, direction TEXT, category_value TEXT,
      confidence REAL NOT NULL DEFAULT 0, sample_count INTEGER NOT NULL DEFAULT 0,
      applied_count INTEGER NOT NULL DEFAULT 0, overridden_count INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL DEFAULT 'ai_analysis', enabled INTEGER NOT NULL DEFAULT 1,
      note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE, import_match_key TEXT NOT NULL,
      transaction_date TEXT NOT NULL, transaction_month TEXT NOT NULL, statement_month TEXT,
      source_type TEXT NOT NULL, flow_type TEXT NOT NULL, name TEXT NOT NULL,
      amount REAL NOT NULL, inflow REAL NOT NULL DEFAULT 0, outflow REAL NOT NULL DEFAULT 0,
      category_primary TEXT NOT NULL, category_sub TEXT, ai_confidence REAL,
      judgment_reason TEXT, memo TEXT, raw_info TEXT, balance REAL, account_original_order TEXT,
      account_id INTEGER NOT NULL REFERENCES accounts(id), first_source_id INTEGER REFERENCES sources(id),
      classification_source TEXT NOT NULL DEFAULT 'ai',
      rule_id INTEGER REFERENCES classification_rules(id) ON DELETE SET NULL,
      reviewed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE correction_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
      field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, match_key TEXT,
      source_type TEXT, direction TEXT, rule_id INTEGER,
      corrected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TRIGGER correction_log_no_update BEFORE UPDATE ON correction_log
    BEGIN SELECT RAISE(ABORT, 'correction_log is append-only'); END;
    CREATE TRIGGER correction_log_no_delete BEFORE DELETE ON correction_log
    BEGIN SELECT RAISE(ABORT, 'correction_log is append-only'); END;
    CREATE TABLE rule_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id INTEGER, action TEXT NOT NULL,
      before_rule_json TEXT, after_rule_json TEXT,
      impacted_count INTEGER NOT NULL DEFAULT 0, reclassified_count INTEGER NOT NULL DEFAULT 0,
      pending_count INTEGER NOT NULL DEFAULT 0, preserved_reviewed_count INTEGER NOT NULL DEFAULT 0,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TRIGGER rule_change_log_no_update BEFORE UPDATE ON rule_change_log
    BEGIN SELECT RAISE(ABORT, 'rule_change_log is append-only'); END;
    CREATE TRIGGER rule_change_log_no_delete BEFORE DELETE ON rule_change_log
    BEGIN SELECT RAISE(ABORT, 'rule_change_log is append-only'); END;
    PRAGMA user_version = 1;
  `);
  const accountId = db.prepare(`
    INSERT INTO accounts (name, institution, account_type, masked_number)
    VALUES (?, ?, ?, ?)
  `).run('Synthetic Legacy Card', 'Example Card Union', 'card', '1001').lastInsertRowid;

  const sourceId = db.prepare(`
    INSERT INTO sources (source_type, source_file, description, statement_month, row_count)
    VALUES (?, ?, ?, ?, ?)
  `).run('synthetic_card', 'synthetic/legacy-card.csv', 'Synthetic v0.2.3 fixture', '2026-06', 2).lastInsertRowid;

  const ruleId = db.prepare(`
    INSERT INTO classification_rules (
      match_key, source_type, direction, category_value, confidence, sample_count,
      applied_count, overridden_count, origin, enabled, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('EXAMPLE MARKET', 'synthetic_card', 'out', '日常開銷', 0.88, 2, 2, 1, 'ai_analysis', 1, 'Synthetic legacy rule with evidence note').lastInsertRowid;

  const insertTransaction = db.prepare(`
    INSERT INTO transactions (
      dedupe_key, import_match_key, transaction_date, transaction_month, statement_month,
      source_type, flow_type, name, amount, inflow, outflow, category_primary,
      category_sub, ai_confidence, judgment_reason, account_id, first_source_id,
      classification_source, rule_id, reviewed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const reviewedId = insertTransaction.run(
    'synthetic-legacy-reviewed', 'synthetic-match-reviewed', '2026-06-02', '2026-06', '2026-06',
    'synthetic_card', 'card_spend', 'EXAMPLE MARKET', -123400, 0, 123400,
    '飲食', '外食', 0.88, 'Synthetic AI classification later corrected by a person.',
    accountId, sourceId, 'human', null, 1,
  ).lastInsertRowid;
  insertTransaction.run(
    'synthetic-legacy-rule', 'synthetic-match-rule', '2026-06-03', '2026-06', '2026-06',
    'synthetic_card', 'card_spend', 'EXAMPLE MARKET BRANCH', -45600, 0, 45600,
    '日常開銷', '一般', 0.88, 'Synthetic rule classification.',
    accountId, sourceId, 'rule', ruleId, 0,
  );

  db.prepare(`
    INSERT INTO correction_log (
      transaction_id, field_name, old_value, new_value, match_key, source_type, direction, rule_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(reviewedId, 'category_primary', '日常開銷', '飲食', 'EXAMPLE MARKET', 'synthetic_card', 'out', ruleId);

  db.prepare(`
    INSERT INTO rule_change_log (
      rule_id, action, before_rule_json, after_rule_json, impacted_count,
      reclassified_count, pending_count, preserved_reviewed_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ruleId, 'update', '{"category_value":"一般"}', '{"category_value":"日常開銷"}', 2, 1, 0, 1);

  const summary = {
    fixture: 'legacy-v0.2.3',
    app_version: '0.2.3',
    schema_version: Number(db.prepare('PRAGMA user_version').get().user_version),
    tables: Object.fromEntries(['accounts', 'sources', 'transactions', 'classification_rules', 'correction_log', 'rule_change_log'].map((table) => [
      table,
      Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count),
    ])),
    output,
    host_tmp: path.resolve(os.tmpdir()),
  };
  console.log(JSON.stringify(summary));
} finally {
  db.close();
}
