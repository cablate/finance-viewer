const { FinanceError, requiredString, optionalString, enumValue, currency, isoDate } = require('../../finance/contracts');
const { moneyMinor } = require('./balances');
const { createReviewTask } = require('./review-tasks');
const { getDb, stableKey, logChange, requireRow, withTransaction } = require('./common');

function itemProjection() {
  return `SELECT v.*,e.entity_key FROM valued_items v JOIN reporting_entities e ON e.id=v.entity_id`;
}

function getValuedItem(key, db = getDb()) { return requireRow(db.prepare(`${itemProjection()} WHERE v.item_key=?`).get(key), 'Valued item'); }

function listValuedItems({ entityKey = 'personal', asOfDate = new Date().toLocaleDateString('en-CA') } = {}, db = getDb()) {
  isoDate(asOfDate, 'as_of_date');
  const items = db.prepare(`${itemProjection()} WHERE e.entity_key=? AND v.active=1 ORDER BY v.display_name`).all(entityKey);
  return items.map((item) => {
    const valuation = db.prepare(`SELECT x.*,s.source_key FROM valuation_snapshots x JOIN sources s ON s.id=x.source_id
      WHERE x.item_id=? AND x.as_of_date<=? AND x.record_status IN ('provisional','posted','confirmed')
      ORDER BY x.as_of_date DESC,CASE x.authority WHEN 'official' THEN 6 WHEN 'institution_export' THEN 5 WHEN 'user_confirmed' THEN 4 WHEN 'ai_researched' THEN 3 WHEN 'ai_inferred' THEN 2 ELSE 1 END DESC,x.id DESC LIMIT 1`).get(item.id, asOfDate);
    return { ...item, latest_valuation: valuation ? { ...valuation, value_minor: String(valuation.value_minor) } : null, tier: 2 };
  });
}

function createValuedItem(input, actor = {}, db = getDb()) {
  const entity = requireRow(db.prepare('SELECT * FROM reporting_entities WHERE entity_key=?').get(input.entity_key || 'personal'), 'Reporting entity');
  const key = stableKey();
  return withTransaction(db, () => {
    db.prepare(`INSERT INTO valued_items(item_key,entity_id,item_type,display_name,position,authority,review_state)
      VALUES(?,?,?,?,?,?,?)`).run(key, entity.id, enumValue(input.item_type, 'valued_item_type', 'item_type'), requiredString(input.display_name, 'display_name', 200), enumValue(input.position, 'valued_item_position', 'position', 'asset'), enumValue(input.authority, 'authority', 'authority'), enumValue(input.review_state, 'review_state', 'review_state', 'needs_review'));
    const row = getValuedItem(key, db); logChange(db, { resourceType: 'valued_item', resourceKey: key, action: 'create', after: row, actorType: actor.type, actorNote: actor.note }); return row;
  });
}

function createValuation(itemKey, input, actor = {}, db = getDb()) {
  const item = getValuedItem(itemKey, db); const source = requireRow(db.prepare('SELECT * FROM sources WHERE source_key=?').get(input.source_key), 'Source'); const key = stableKey();
  const confidence = input.confidence == null ? null : Number(input.confidence);
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new FinanceError('VALIDATION_ERROR', 'confidence must be between 0 and 1', { field: 'confidence' });
  return withTransaction(db, () => {
    db.prepare(`INSERT INTO valuation_snapshots(valuation_key,item_id,source_id,as_of_date,value_minor,currency,valuation_method,confidence,authority,review_state,record_status,note)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(key, item.id, source.id, isoDate(input.as_of_date, 'as_of_date'), moneyMinor(input.value_minor), currency(input.currency), enumValue(input.valuation_method, 'valuation_method', 'valuation_method'), confidence, enumValue(input.authority, 'authority', 'authority'), enumValue(input.review_state, 'review_state', 'review_state', 'needs_review'), enumValue(input.record_status, 'record_status', 'record_status', 'posted'), optionalString(input.note, 'note', 1000));
    const row = db.prepare(`SELECT x.*,s.source_key FROM valuation_snapshots x JOIN sources s ON s.id=x.source_id WHERE x.valuation_key=?`).get(key);
    if (row.review_state === 'needs_review') createReviewTask({ task_kind: 'valuation', resource_type: 'valuation_snapshot', resource_key: key, priority: 55, reason: `Review ${item.display_name} valuation evidence and method` }, db);
    logChange(db, { resourceType: 'valuation_snapshot', resourceKey: key, action: 'create', after: { ...row, value_minor: String(row.value_minor) }, actorType: actor.type, actorNote: actor.note });
    return { ...row, value_minor: String(row.value_minor) };
  });
}

module.exports = { getValuedItem, listValuedItems, createValuedItem, createValuation };
