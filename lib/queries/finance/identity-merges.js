const { createHash } = require('node:crypto');
const { FinanceError, enumValue } = require('../../finance/contracts');
const { isConfirmationAuthorization } = require('./authorization');
const { getDb, logChange, requireRow, withTransaction } = require('./common');

const REGISTRY = Object.freeze({
  institution: Object.freeze({ table: 'institutions', key: 'institution_key', merged: 'merged_into_institution_id', active: 'active', refs: Object.freeze([
    ['institution_aliases', 'institution_id'], ['accounts', 'institution_id'], ['sources', 'institution_id'],
  ]) }),
  account: Object.freeze({ table: 'accounts', key: 'account_key', merged: 'merged_into_account_id', active: 'active', refs: Object.freeze([
    ['account_aliases', 'account_id'], ['sources', 'account_id'], ['source_expectations', 'account_id'],
    ['account_balance_snapshots', 'account_id'], ['transactions', 'account_id'], ['credit_card_profiles', 'account_id'],
    ['liability_profiles', 'account_id'], ['commitment_templates', 'account_id'], ['investment_trades', 'account_id'], ['holding_snapshots', 'account_id'],
  ]) }),
  instrument: Object.freeze({ table: 'instruments', key: 'instrument_key', merged: 'merged_into_instrument_id', active: 'active', refs: Object.freeze([
    ['investment_trades', 'instrument_id'], ['holding_snapshots', 'instrument_id'], ['market_quotes', 'instrument_id'],
  ]) }),
});

function resource(db, type, key) {
  const config = REGISTRY[type]; return requireRow(db.prepare(`SELECT * FROM ${config.table} WHERE ${config.key}=?`).get(key), type);
}

function collisions(db, type, source, target) {
  const found = [];
  const config = REGISTRY[type];
  if (db.prepare(`SELECT 1 FROM review_tasks s JOIN review_tasks t ON t.resource_type=? AND t.resource_key=? AND t.task_kind=s.task_kind WHERE s.resource_type=? AND s.resource_key=? LIMIT 1`).get(type, target[config.key], type, source[config.key])) found.push('review_tasks:task_identity');
  if (type === 'institution' && (source.country_code !== target.country_code || source.institution_type !== target.institution_type)) found.push('institution:identity_shape_mismatch');
  if (type === 'account') {
    if (source.entity_id !== target.entity_id || source.account_kind !== target.account_kind || source.currency !== target.currency) found.push('account:identity_shape_mismatch');
    for (const table of ['credit_card_profiles', 'liability_profiles']) if (db.prepare(`SELECT 1 FROM ${table} WHERE account_id=?`).get(source.id) && db.prepare(`SELECT 1 FROM ${table} WHERE account_id=?`).get(target.id)) found.push(`${table}:one_per_account`);
    if (db.prepare(`SELECT 1 FROM investment_trades s JOIN investment_trades t ON t.account_id=? AND t.source_id=s.source_id AND t.external_id=s.external_id WHERE s.account_id=? AND s.external_id IS NOT NULL LIMIT 1`).get(target.id, source.id)) found.push('investment_trades:external_identity');
    if (db.prepare(`SELECT 1 FROM holding_snapshots s JOIN holding_snapshots t ON t.account_id=? AND t.instrument_id=s.instrument_id AND t.source_id=s.source_id AND t.as_of_date=s.as_of_date WHERE s.account_id=? LIMIT 1`).get(target.id, source.id)) found.push('holding_snapshots:snapshot_identity');
    if (db.prepare(`SELECT 1 FROM account_balance_snapshots s JOIN account_balance_snapshots t ON t.account_id=? AND t.balance_kind=s.balance_kind AND t.as_of_date=s.as_of_date AND COALESCE(t.source_id,-1)=COALESCE(s.source_id,-1) WHERE s.account_id=? LIMIT 1`).get(target.id, source.id)) found.push('account_balance_snapshots:snapshot_identity');
    if (db.prepare(`SELECT 1 FROM transactions s JOIN transactions t ON t.account_id=? AND t.source_type=s.source_type AND t.external_id=s.external_id WHERE s.account_id=? AND s.external_id IS NOT NULL LIMIT 1`).get(target.id, source.id)) found.push('transactions:external_identity');
  }
  if (type === 'instrument') {
    if (source.instrument_type !== target.instrument_type || source.quote_currency !== target.quote_currency) found.push('instrument:identity_shape_mismatch');
    if (db.prepare(`SELECT 1 FROM holding_snapshots s JOIN holding_snapshots t ON t.instrument_id=? AND t.account_id=s.account_id AND t.source_id=s.source_id AND t.as_of_date=s.as_of_date WHERE s.instrument_id=? LIMIT 1`).get(target.id, source.id)) found.push('holding_snapshots:snapshot_identity');
    if (db.prepare(`SELECT 1 FROM market_quotes s JOIN market_quotes t ON t.instrument_id=? AND t.source_id=s.source_id AND t.as_of_date=s.as_of_date AND t.quote_type=s.quote_type WHERE s.instrument_id=? LIMIT 1`).get(target.id, source.id)) found.push('market_quotes:quote_identity');
  }
  return found;
}

function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function previewIdentityMerge(input, db = getDb()) {
  const type = enumValue(input.resource_type, 'merge_resource_type', 'resource_type'); const config = REGISTRY[type];
  if (input.source_key === input.target_key) throw new FinanceError('VALIDATION_ERROR', 'Merge source and target must differ');
  const source = resource(db, type, input.source_key); const target = resource(db, type, input.target_key);
  if (source[config.merged] || target[config.merged]) throw new FinanceError('IDENTITY_CONFLICT', 'Merged identities cannot be merged again', { status: 409 });
  if (!source[config.active] || !target[config.active]) throw new FinanceError('IDENTITY_CONFLICT', 'Archived identities cannot be merged', { status: 409 });
  const impacts = config.refs.map(([table, column]) => ({ table, column, rows: Number(db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE ${column}=?`).get(source.id).count) }));
  const conflictList = collisions(db, type, source, target);
  const core = { resource_type: type, source_key: input.source_key, target_key: input.target_key, source_version: Number(source.version), target_version: Number(target.version), impacts, collisions: conflictList };
  return { ...core, can_merge: conflictList.length === 0, impact_hash: hash(core) };
}

function mergeIdentity(payload, actor = {}, db = getDb(), authorization) {
  const action = `merge_${payload.resource_type}`;
  if (!isConfirmationAuthorization(authorization, action)) throw new FinanceError('HUMAN_CONFIRMATION_REQUIRED', 'A confirmed one-time receipt is required', { status: 403 });
  return withTransaction(db, () => {
    const preview = previewIdentityMerge(payload, db);
    if (!preview.can_merge || preview.impact_hash !== payload.impact_hash || preview.source_version !== payload.source_version || preview.target_version !== payload.target_version) throw new FinanceError('VERSION_CONFLICT', 'Merge impact changed after preview', { status: 409 });
    const config = REGISTRY[preview.resource_type]; const source = resource(db, preview.resource_type, preview.source_key); const target = resource(db, preview.resource_type, preview.target_key);
    for (const [table, column] of config.refs) db.prepare(`UPDATE ${table} SET ${column}=? WHERE ${column}=?`).run(target.id, source.id);
    db.prepare(`UPDATE review_tasks SET resource_key=?,updated_at=CURRENT_TIMESTAMP WHERE resource_type=? AND resource_key=?`).run(preview.target_key, preview.resource_type, preview.source_key);
    db.prepare(`UPDATE ${config.table} SET ${config.merged}=?,${config.active}=0,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(target.id, source.id);
    db.prepare(`INSERT INTO identity_redirects(resource_type,old_key,new_key,proposal_key) VALUES(?,?,?,?)`).run(preview.resource_type, preview.source_key, preview.target_key, authorization.proposal_key);
    const after = resource(db, preview.resource_type, preview.source_key);
    logChange(db, { resourceType: preview.resource_type, resourceKey: preview.source_key, action: 'merge', before: source, after: { ...after, redirected_to: preview.target_key, impacts: preview.impacts }, actorType: actor.type || 'human_ui', actorNote: actor.note });
    return { resource_type: preview.resource_type, old_key: preview.source_key, new_key: preview.target_key, impacts: preview.impacts, redirect: true };
  });
}

function resolveIdentityRedirect(type, key, db = getDb()) {
  enumValue(type, 'merge_resource_type', 'resource_type');
  const seen = new Set(); let current = key; let first = null;
  while (true) {
    if (seen.has(current)) throw new FinanceError('IDENTITY_CONFLICT', 'Identity redirect cycle detected', { status: 409 });
    seen.add(current); const row = db.prepare('SELECT resource_type,old_key,new_key,merged_at FROM identity_redirects WHERE resource_type=? AND old_key=?').get(type, current);
    if (!row) return first ? { resource_type: type, old_key: key, new_key: current, merged_at: first.merged_at, hops: seen.size - 1 } : { resource_type: type, old_key: key, new_key: key, merged_at: null, hops: 0 };
    first ||= row; current = row.new_key;
  }
}

module.exports = { REGISTRY, previewIdentityMerge, mergeIdentity, resolveIdentityRedirect };
