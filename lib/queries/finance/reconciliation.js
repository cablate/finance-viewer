const { FinanceError, enumValue, currency, optionalString } = require('../../finance/contracts');
const { moneyMinor } = require('./balances');
const { createReviewTask } = require('./review-tasks');
const { getDb, stableKey, logChange, requireRow, withTransaction } = require('./common');

function transaction(db, key, required = true) {
  if (!key && !required) return null;
  return requireRow(db.prepare('SELECT * FROM transactions WHERE transaction_key=?').get(key), 'Transaction');
}

function projection() {
  return `SELECT m.*,f.transaction_key AS from_transaction_key,t.transaction_key AS to_transaction_key
    FROM transfer_matches m JOIN transactions f ON f.id=m.from_transaction_id
    LEFT JOIN transactions t ON t.id=m.to_transaction_id`;
}

function listTransferMatches(db = getDb()) {
  return db.prepare(`${projection()} ORDER BY m.created_at DESC,m.id DESC`).all().map((row) => ({ ...row, amount_minor: String(row.amount_minor) }));
}

function createTransferMatch(input, actor = {}, db = getDb()) {
  const from = transaction(db, input.from_transaction_key); const to = transaction(db, input.to_transaction_key, false);
  if (to && from.id === to.id) throw new FinanceError('VALIDATION_ERROR', 'Transfer legs must be different transactions');
  const amount = moneyMinor(input.amount_minor); if (amount <= 0n) throw new FinanceError('VALIDATION_ERROR', 'amount_minor must be positive', { field: 'amount_minor' });
  const matchCurrency = currency(input.currency); if (from.currency !== matchCurrency || (to && to.currency !== matchCurrency)) throw new FinanceError('VALIDATION_ERROR', 'Transfer legs and match currency must agree', { field: 'currency' });
  const confidence = input.confidence == null ? null : Number(input.confidence);
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new FinanceError('VALIDATION_ERROR', 'confidence must be between 0 and 1', { field: 'confidence' });
  const authority = enumValue(input.authority, 'authority', 'authority'); let status = enumValue(input.match_status, 'transfer_match_status', 'match_status', 'proposed');
  if (!to && status === 'confirmed') throw new FinanceError('REVIEW_REQUIRED', 'A one-sided transfer cannot be confirmed', { status: 409 });
  if (status === 'confirmed' && authority !== 'user_confirmed' && authority !== 'official' && (confidence == null || confidence < 0.8)) throw new FinanceError('REVIEW_REQUIRED', 'Low-confidence transfer requires human review', { status: 409 });
  const key = stableKey();
  return withTransaction(db, () => {
    db.prepare(`INSERT INTO transfer_matches(match_key,from_transaction_id,to_transaction_id,amount_minor,currency,match_status,confidence,authority,review_state,note)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(key, from.id, to?.id || null, amount, matchCurrency, status, confidence, authority, enumValue(input.review_state, 'review_state', 'review_state', status === 'confirmed' ? 'confirmed' : 'needs_review'), optionalString(input.note, 'note', 1000));
    const row = db.prepare(`${projection()} WHERE m.match_key=?`).get(key);
    if (status === 'proposed') createReviewTask({ task_kind: 'transfer_match', resource_type: 'transfer_match', resource_key: key, priority: to ? 65 : 80, reason: to ? 'Confirm the proposed internal transfer pair' : 'Find the missing internal transfer leg' }, db);
    logChange(db, { resourceType: 'transfer_match', resourceKey: key, action: 'create', after: { ...row, amount_minor: String(row.amount_minor) }, actorType: actor.type, actorNote: actor.note });
    return { ...row, amount_minor: String(row.amount_minor) };
  });
}

function reconciliationSummary(db = getDb()) {
  const legs = db.prepare(`
    SELECT t.transaction_key,'card_settlement' context,m.match_status status FROM credit_card_payment_matches m JOIN transactions t ON t.id=m.transaction_id
    UNION ALL SELECT t.transaction_key,'loan_allocation',m.reconciliation_status FROM loan_payment_allocations m JOIN transactions t ON t.id=m.transaction_id
    UNION ALL SELECT t.transaction_key,'investment_cash_leg',m.reconciliation_status FROM investment_cash_matches m JOIN transactions t ON t.id=m.transaction_id
    UNION ALL SELECT f.transaction_key,'internal_transfer',m.match_status FROM transfer_matches m JOIN transactions f ON f.id=m.from_transaction_id
    UNION ALL SELECT t.transaction_key,'internal_transfer',m.match_status FROM transfer_matches m JOIN transactions t ON t.id=m.to_transaction_id WHERE m.to_transaction_id IS NOT NULL
  `).all();
  const byTransaction = new Map();
  for (const leg of legs) { const current = byTransaction.get(leg.transaction_key) || []; current.push({ context: leg.context, status: leg.status }); byTransaction.set(leg.transaction_key, current); }
  const conflicts = [...byTransaction.entries()].filter(([, entries]) => new Set(entries.map((entry) => entry.context)).size > 1).map(([transaction_key, entries]) => ({ transaction_key, entries }));
  const oneSided = db.prepare(`SELECT m.match_key,f.transaction_key AS from_transaction_key FROM transfer_matches m JOIN transactions f ON f.id=m.from_transaction_id WHERE m.to_transaction_id IS NULL AND m.match_status<>'rejected'`).all();
  const pending = db.prepare(`SELECT COUNT(*) count FROM transfer_matches WHERE match_status='proposed'`).get().count;
  const sourceConflicts = db.prepare("SELECT conflict_key,target_context,semantic_key FROM source_conflicts WHERE status='open' ORDER BY created_at,id").all();
  return { status: conflicts.length || sourceConflicts.length ? 'conflicted' : (oneSided.length || pending ? 'unreconciled' : 'complete'), typed_legs: legs, duplicate_context_conflicts: conflicts, source_conflicts: sourceConflicts, one_sided_transfers: oneSided, pending_transfer_matches: pending };
}

module.exports = { listTransferMatches, createTransferMatch, reconciliationSummary };
