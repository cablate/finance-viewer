const { randomUUID } = require('node:crypto');

const SOURCE = `
financial-shared-kernel-v1:
reporting_entities,institutions,institution_aliases,
accounts-additive,account_aliases,sources-additive,
scope_attestations,source_expectations,source_expectation_goals,
data_change_log,human_confirmation_requests
`;

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
}

function addColumns(db, table, definitions) {
  if (!tableExists(db, table)) return;
  const current = columns(db, table);
  for (const [name, definition] of definitions) {
    if (!current.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function accountKind(accountType) {
  const value = String(accountType || '').toLowerCase();
  if (value === 'card' || value === 'credit_card') return 'credit_card';
  if (value === 'bank' || value === 'bank_account' || value === 'checking' || value === 'savings') return 'bank';
  if (value === 'cash') return 'cash';
  if (value === 'e_wallet' || value === 'wallet') return 'e_wallet';
  if (value === 'loan') return 'loan';
  if (value === 'investment' || value === 'brokerage') return 'investment';
  return 'other';
}

function apply(db) {
  db.exec(`
    CREATE TABLE reporting_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    INSERT INTO reporting_entities (entity_key, name, entity_type, base_currency)
    VALUES ('personal', 'Personal', 'personal', 'TWD');

    CREATE TABLE institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      institution_type TEXT NOT NULL,
      country_code TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      version INTEGER NOT NULL DEFAULT 1,
      merged_into_institution_id INTEGER REFERENCES institutions(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (merged_into_institution_id IS NULL OR merged_into_institution_id <> id)
    ) STRICT;

    CREATE TABLE institution_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
      source_system TEXT NOT NULL,
      alias_value_normalized TEXT NOT NULL,
      country_hint TEXT,
      authority TEXT NOT NULL,
      review_state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_system, alias_value_normalized, country_hint)
    ) STRICT;
  `);

  addColumns(db, 'accounts', [
    ['account_key', 'TEXT'],
    ['display_name', 'TEXT'],
    ['entity_id', 'INTEGER REFERENCES reporting_entities(id) ON DELETE RESTRICT'],
    ['institution_id', 'INTEGER REFERENCES institutions(id) ON DELETE RESTRICT'],
    ['account_kind', 'TEXT'],
    ['currency', 'TEXT'],
    ['normal_balance', 'TEXT'],
    ['liquidity_class', 'TEXT'],
    ['active', 'INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))'],
    ['included_in_analysis', 'INTEGER NOT NULL DEFAULT 1 CHECK (included_in_analysis IN (0, 1))'],
    ['authority', 'TEXT'],
    ['review_state', 'TEXT'],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
    ['updated_at', 'TEXT'],
    ['merged_into_account_id', 'INTEGER REFERENCES accounts(id) ON DELETE RESTRICT'],
  ]);

  const personalId = db.prepare("SELECT id FROM reporting_entities WHERE entity_key = 'personal'").get().id;
  const accounts = db.prepare(`
    SELECT id, name, account_type, account_key FROM accounts ORDER BY id
  `).all();
  const updateAccount = db.prepare(`
    UPDATE accounts SET
      account_key = ?, display_name = COALESCE(display_name, name), entity_id = COALESCE(entity_id, ?),
      account_kind = COALESCE(account_kind, ?), currency = COALESCE(currency, 'TWD'),
      normal_balance = COALESCE(normal_balance, ?), liquidity_class = COALESCE(liquidity_class, ?),
      authority = COALESCE(authority, 'ai_inferred'), review_state = COALESCE(review_state, 'needs_review'),
      updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
    WHERE id = ?
  `);
  for (const account of accounts) {
    const kind = accountKind(account.account_type);
    const normalBalance = ['credit_card', 'loan', 'payable', 'equity'].includes(kind) ? 'credit' : 'debit';
    const liquidity = ['cash', 'bank', 'e_wallet'].includes(kind) ? 'liquid' : 'non_liquid';
    updateAccount.run(account.account_key || randomUUID(), personalId, kind, normalBalance, liquidity, account.id);
  }
  db.exec(`
    CREATE UNIQUE INDEX accounts_account_key_uq ON accounts(account_key);
    CREATE INDEX accounts_entity_kind_idx ON accounts(entity_id, account_kind, active);
    CREATE INDEX accounts_institution_idx ON accounts(institution_id);

    CREATE TABLE account_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      source_system TEXT NOT NULL,
      alias_type TEXT NOT NULL,
      alias_value_normalized TEXT NOT NULL,
      masked_hint TEXT,
      confidence REAL,
      authority TEXT NOT NULL,
      review_state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_system, alias_type, alias_value_normalized)
    ) STRICT;
  `);

  addColumns(db, 'sources', [
    ['source_key', 'TEXT'],
    ['source_kind', 'TEXT'],
    ['authority', 'TEXT'],
    ['status', 'TEXT'],
    ['artifact_status', 'TEXT'],
    ['content_sha256', 'TEXT'],
    ['period_start', 'TEXT'],
    ['period_end', 'TEXT'],
    ['as_of_at', 'TEXT'],
    ['observed_at', 'TEXT'],
    ['institution_id', 'INTEGER REFERENCES institutions(id) ON DELETE RESTRICT'],
    ['account_id', 'INTEGER REFERENCES accounts(id) ON DELETE RESTRICT'],
    ['is_official', 'INTEGER NOT NULL DEFAULT 0 CHECK (is_official IN (0, 1))'],
    ['supersedes_source_id', 'INTEGER REFERENCES sources(id) ON DELETE RESTRICT'],
    ['created_by', 'TEXT'],
    ['review_state', 'TEXT'],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
    ['updated_at', 'TEXT'],
  ]);
  const sources = db.prepare('SELECT id, source_type, source_key FROM sources ORDER BY id').all();
  const updateSource = db.prepare(`
    UPDATE sources SET source_key = ?, source_kind = COALESCE(source_kind, source_type),
      authority = COALESCE(authority, 'institution_export'), status = COALESCE(status, 'active'),
      artifact_status = COALESCE(artifact_status, CASE WHEN source_file = '' THEN 'missing' ELSE 'external-only' END),
      created_by = COALESCE(created_by, 'legacy_import'), review_state = COALESCE(review_state, 'needs_review'),
      updated_at = COALESCE(updated_at, imported_at)
    WHERE id = ?
  `);
  for (const source of sources) updateSource.run(source.source_key || randomUUID(), source.id);

  db.exec(`
    CREATE UNIQUE INDEX sources_source_key_uq ON sources(source_key);
    CREATE INDEX sources_period_idx ON sources(period_start, period_end, as_of_at);
    CREATE INDEX sources_account_idx ON sources(account_id, source_kind);

    CREATE TABLE scope_attestations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attestation_key TEXT NOT NULL UNIQUE,
      entity_id INTEGER NOT NULL REFERENCES reporting_entities(id) ON DELETE RESTRICT,
      scope_kind TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      coverage_state TEXT NOT NULL,
      included_note TEXT,
      excluded_note TEXT,
      valid_until TEXT,
      source_id INTEGER REFERENCES sources(id) ON DELETE RESTRICT,
      authority TEXT NOT NULL,
      review_state TEXT NOT NULL,
      invalidated_at TEXT,
      invalidation_reason TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE INDEX scope_attestations_lookup_idx ON scope_attestations(entity_id, scope_kind, as_of_date);

    CREATE TABLE source_expectations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expectation_key TEXT NOT NULL UNIQUE,
      entity_id INTEGER NOT NULL REFERENCES reporting_entities(id) ON DELETE RESTRICT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
      target_context TEXT NOT NULL,
      expected_source_kind TEXT NOT NULL,
      cadence TEXT NOT NULL,
      grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
      period_anchor TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      authority TEXT NOT NULL,
      review_state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE TABLE source_expectation_goals (
      expectation_id INTEGER NOT NULL REFERENCES source_expectations(id) ON DELETE CASCADE,
      goal_key TEXT NOT NULL,
      PRIMARY KEY (expectation_id, goal_key)
    ) STRICT;

    CREATE TABLE data_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_type TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      actor_type TEXT NOT NULL,
      actor_note TEXT,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE INDEX data_change_log_resource_idx ON data_change_log(resource_type, resource_key, id);
    CREATE TRIGGER data_change_log_no_update BEFORE UPDATE ON data_change_log
    BEGIN SELECT RAISE(ABORT, 'data_change_log is append-only'); END;
    CREATE TRIGGER data_change_log_no_delete BEFORE DELETE ON data_change_log
    BEGIN SELECT RAISE(ABORT, 'data_change_log is append-only'); END;

    CREATE TABLE human_confirmation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_key TEXT NOT NULL UNIQUE,
      action_kind TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_key TEXT,
      payload_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      expected_version INTEGER,
      confirmation_hash TEXT,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      confirmed_at TEXT,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE INDEX human_confirmation_status_idx ON human_confirmation_requests(status, expires_at);
  `);
}

module.exports = { version: 2, name: 'financial-shared-kernel-v1', source: SOURCE, apply };
