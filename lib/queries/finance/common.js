const { randomUUID } = require('node:crypto');
const { getDb } = require('../../db');
const { FinanceError } = require('../../finance/contracts');

function stableKey() {
  return randomUUID();
}

function normalizeAlias(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}

function json(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function logChange(db, { resourceType, resourceKey, action, before, after, actorType = 'unknown', actorNote = null }) {
  db.prepare(`
    INSERT INTO data_change_log (
      resource_type, resource_key, action, before_json, after_json, actor_type, actor_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(resourceType, resourceKey, action, json(before), json(after), actorType, actorNote);
}

function requireRow(row, resource) {
  if (!row) throw new FinanceError('NOT_FOUND', `${resource} not found`, { status: 404 });
  return row;
}

function assertVersion(row, expected) {
  if (Number(row.version) !== Number(expected)) {
    throw new FinanceError('VERSION_CONFLICT', `Expected version ${expected}, current version is ${row.version}`, { status: 409, retryable: true });
  }
}

function withTransaction(db, operation) {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { getDb, stableKey, normalizeAlias, logChange, requireRow, assertVersion, withTransaction };
