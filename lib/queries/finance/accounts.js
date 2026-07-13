const { validateSchemaShape, requiredString, optionalString, enumValue, currency, booleanInt, expectedVersion, FinanceError } = require('../../finance/contracts');
const { getDb, stableKey, normalizeAlias, logChange, requireRow, assertVersion, withTransaction } = require('./common');

const SCOPE_BY_KIND = Object.freeze({
  cash: 'cash_accounts', bank: 'cash_accounts', e_wallet: 'cash_accounts',
  credit_card: 'credit_cards', loan: 'liabilities', payable: 'liabilities', investment: 'investments',
});

function accountProjection() {
  return `SELECT a.*, e.entity_key, e.name AS entity_name, i.institution_key, i.display_name AS institution_name
    FROM accounts a JOIN reporting_entities e ON e.id = a.entity_id
    LEFT JOIN institutions i ON i.id = a.institution_id`;
}

function listAccounts(filters = {}, db = getDb()) {
  const where = []; const params = [];
  if (filters.entity_key) { where.push('e.entity_key = ?'); params.push(filters.entity_key); }
  if (filters.active !== undefined) { where.push('a.active = ?'); params.push(filters.active ? 1 : 0); }
  return db.prepare(`${accountProjection()} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.active DESC, a.display_name, a.id`).all(...params);
}

function getAccount(key, db = getDb()) {
  const row = requireRow(db.prepare(`${accountProjection()} WHERE a.account_key = ?`).get(key), 'Account');
  return { ...row, aliases: db.prepare('SELECT * FROM account_aliases WHERE account_id = ? ORDER BY id').all(row.id) };
}

function resolveEntity(db, key = 'personal') {
  return requireRow(db.prepare('SELECT * FROM reporting_entities WHERE entity_key = ?').get(key), 'Entity');
}

function resolveInstitution(db, key) {
  if (!key) return null;
  return requireRow(db.prepare('SELECT * FROM institutions WHERE institution_key = ?').get(key), 'Institution');
}

function invalidateScopeForAccount(db, account, actor) {
  const scopeKind = SCOPE_BY_KIND[account.account_kind];
  if (!scopeKind) return 0;
  const rows = db.prepare(`SELECT * FROM scope_attestations WHERE entity_id = ? AND scope_kind = ? AND invalidated_at IS NULL`).all(account.entity_id, scopeKind);
  for (const before of rows) {
    db.prepare(`UPDATE scope_attestations SET invalidated_at=CURRENT_TIMESTAMP, invalidation_reason=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(`New ${account.account_kind} account ${account.account_key}`, before.id);
    const after = db.prepare('SELECT * FROM scope_attestations WHERE id = ?').get(before.id);
    logChange(db, { resourceType: 'scope_attestation', resourceKey: after.attestation_key, action: 'invalidate', before, after, actorType: actor.type, actorNote: actor.note });
  }
  return rows.length;
}

function createAccount(input, actor = {}, db = getDb()) {
  validateSchemaShape('account', input);
  const entity = resolveEntity(db, input.entity_key || 'personal');
  const institution = resolveInstitution(db, input.institution_key);
  const key = stableKey();
  const kind = enumValue(input.account_kind, 'account_kind', 'account_kind');
  const authority = enumValue(input.authority, 'authority', 'authority', 'ai_inferred');
  const review = authority === 'ai_inferred' ? 'needs_review' : enumValue(input.review_state, 'review_state', 'review_state', 'needs_review');
  const displayName = requiredString(input.display_name, 'display_name', 160);
  const legacyName = `${displayName} [${key.slice(0, 8)}]`;
  const value = {
    key, displayName, legacyName, entity, institution, kind, currency: currency(input.currency),
    normalBalance: enumValue(input.normal_balance, 'normal_balance', 'normal_balance', ['credit_card', 'loan', 'payable', 'equity'].includes(kind) ? 'credit' : 'debit'),
    liquidity: enumValue(input.liquidity_class, 'liquidity_class', 'liquidity_class', ['cash', 'bank', 'e_wallet'].includes(kind) ? 'liquid' : 'non_liquid'),
    active: booleanInt(input.active, true), included: booleanInt(input.included_in_analysis, true), authority, review,
  };
  return withTransaction(db, () => {
    db.prepare(`INSERT INTO accounts (name, institution, account_type, masked_number, account_key, display_name, entity_id, institution_id, account_kind, currency, normal_balance, liquidity_class, active, included_in_analysis, authority, review_state, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`)
      .run(value.legacyName, institution?.display_name || 'Manual', kind, optionalString(input.masked_number, 'masked_number', 32), key, displayName, entity.id, institution?.id || null, kind, value.currency, value.normalBalance, value.liquidity, value.active, value.included, authority, review);
    const row = getAccount(key, db);
    logChange(db, { resourceType: 'account', resourceKey: key, action: 'create', after: row, actorType: actor.type, actorNote: actor.note });
    row.invalidated_attestations = invalidateScopeForAccount(db, row, actor);
    return row;
  });
}

function updateAccount(key, input, actor = {}, db = getDb()) {
  validateSchemaShape('account', input);
  const version = expectedVersion(input.expected_version);
  return withTransaction(db, () => {
    const before = getAccount(key, db); assertVersion(before, version);
    const entity = resolveEntity(db, input.entity_key || before.entity_key);
    const institution = input.institution_key === undefined ? (before.institution_key ? resolveInstitution(db, before.institution_key) : null) : resolveInstitution(db, input.institution_key);
    const kind = enumValue(input.account_kind, 'account_kind', 'account_kind');
    const authority = enumValue(input.authority, 'authority', 'authority', before.authority);
    const review = authority === 'ai_inferred' ? 'needs_review' : enumValue(input.review_state, 'review_state', 'review_state', before.review_state);
    db.prepare(`UPDATE accounts SET display_name=?, entity_id=?, institution_id=?, account_kind=?, account_type=?, currency=?, normal_balance=?, liquidity_class=?, masked_number=?, active=?, included_in_analysis=?, authority=?, review_state=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE account_key=?`)
      .run(requiredString(input.display_name, 'display_name', 160), entity.id, institution?.id || null, kind, kind, currency(input.currency), enumValue(input.normal_balance, 'normal_balance', 'normal_balance', before.normal_balance), enumValue(input.liquidity_class, 'liquidity_class', 'liquidity_class', before.liquidity_class), optionalString(input.masked_number, 'masked_number', 32), booleanInt(input.active, Boolean(before.active)), booleanInt(input.included_in_analysis, Boolean(before.included_in_analysis)), authority, review, key);
    const after = getAccount(key, db);
    logChange(db, { resourceType: 'account', resourceKey: key, action: 'update', before, after, actorType: actor.type, actorNote: actor.note });
    if (before.account_kind !== after.account_kind || before.entity_id !== after.entity_id || (!before.active && after.active)) after.invalidated_attestations = invalidateScopeForAccount(db, after, actor);
    return after;
  });
}

function addAccountAlias(key, input, actor = {}, db = getDb()) {
  validateSchemaShape('account_alias', input);
  return withTransaction(db, () => {
    const account = getAccount(key, db);
    const values = {
      source: requiredString(input.source_system, 'source_system', 80), type: enumValue(input.alias_type, 'alias_type', 'alias_type'),
      alias: normalizeAlias(requiredString(input.alias_value, 'alias_value', 200)), hint: optionalString(input.masked_hint, 'masked_hint', 32),
      confidence: input.confidence ?? null, authority: enumValue(input.authority, 'authority', 'authority', 'ai_inferred'), review: enumValue(input.review_state, 'review_state', 'review_state', 'needs_review'),
    };
    if (values.confidence !== null && (typeof values.confidence !== 'number' || values.confidence < 0 || values.confidence > 1)) throw new FinanceError('VALIDATION_ERROR', 'confidence must be between 0 and 1', { field: 'confidence' });
    try {
      const result = db.prepare(`INSERT INTO account_aliases (account_id, source_system, alias_type, alias_value_normalized, masked_hint, confidence, authority, review_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(account.id, values.source, values.type, values.alias, values.hint, values.confidence, values.authority, values.review);
      const row = db.prepare('SELECT * FROM account_aliases WHERE id = ?').get(result.lastInsertRowid);
      logChange(db, { resourceType: 'account_alias', resourceKey: String(row.id), action: 'create', after: row, actorType: actor.type, actorNote: actor.note });
      return row;
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) throw new FinanceError('IDENTITY_CONFLICT', 'Account alias is already bound', { status: 409 });
      throw error;
    }
  });
}

module.exports = { listAccounts, getAccount, createAccount, updateAccount, addAccountAlias, invalidateScopeForAccount };
