const { validateSchemaShape, requiredString, enumValue, currency, booleanInt, expectedVersion } = require('../../finance/contracts');
const { getDb, stableKey, logChange, requireRow, assertVersion, withTransaction } = require('./common');

function listEntities(db = getDb()) {
  return db.prepare('SELECT * FROM reporting_entities ORDER BY active DESC, name, id').all();
}

function getEntity(key, db = getDb()) {
  return requireRow(db.prepare('SELECT * FROM reporting_entities WHERE entity_key = ?').get(key), 'Entity');
}

function createEntity(input, actor = {}, db = getDb()) {
  validateSchemaShape('entity', input);
  const entity = {
    entity_key: stableKey(), name: requiredString(input.name, 'name', 120),
    entity_type: enumValue(input.entity_type, 'entity_type', 'entity_type'),
    base_currency: currency(input.base_currency, 'base_currency'), active: booleanInt(input.active, true),
  };
  return withTransaction(db, () => {
    db.prepare('INSERT INTO reporting_entities (entity_key, name, entity_type, base_currency, active) VALUES (?, ?, ?, ?, ?)')
      .run(entity.entity_key, entity.name, entity.entity_type, entity.base_currency, entity.active);
    const row = getEntity(entity.entity_key, db);
    logChange(db, { resourceType: 'entity', resourceKey: entity.entity_key, action: 'create', after: row, actorType: actor.type, actorNote: actor.note });
    return row;
  });
}

function updateEntity(key, input, actor = {}, db = getDb()) {
  validateSchemaShape('entity', input);
  const version = expectedVersion(input.expected_version);
  return withTransaction(db, () => {
    const before = getEntity(key, db); assertVersion(before, version);
    const next = {
      name: requiredString(input.name, 'name', 120), entity_type: enumValue(input.entity_type, 'entity_type', 'entity_type'),
      base_currency: currency(input.base_currency, 'base_currency'), active: booleanInt(input.active, Boolean(before.active)),
    };
    db.prepare(`UPDATE reporting_entities SET name=?, entity_type=?, base_currency=?, active=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE entity_key=?`)
      .run(next.name, next.entity_type, next.base_currency, next.active, key);
    const after = getEntity(key, db);
    logChange(db, { resourceType: 'entity', resourceKey: key, action: 'update', before, after, actorType: actor.type, actorNote: actor.note });
    return after;
  });
}

module.exports = { listEntities, getEntity, createEntity, updateEntity };
