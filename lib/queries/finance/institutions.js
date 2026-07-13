const { validateSchemaShape, requiredString, optionalString, enumValue, booleanInt, expectedVersion, FinanceError } = require('../../finance/contracts');
const { getDb, stableKey, normalizeAlias, logChange, requireRow, assertVersion, withTransaction } = require('./common');

function listInstitutions(db = getDb()) {
  return db.prepare(`
    SELECT i.*, COUNT(a.id) AS alias_count
    FROM institutions i LEFT JOIN institution_aliases a ON a.institution_id = i.id
    GROUP BY i.id ORDER BY i.active DESC, i.display_name, i.id
  `).all();
}

function getInstitution(key, db = getDb()) {
  const row = requireRow(db.prepare('SELECT * FROM institutions WHERE institution_key = ?').get(key), 'Institution');
  return { ...row, aliases: db.prepare('SELECT * FROM institution_aliases WHERE institution_id = ? ORDER BY id').all(row.id) };
}

function createInstitution(input, actor = {}, db = getDb()) {
  validateSchemaShape('institution', input);
  const value = {
    institution_key: stableKey(), display_name: requiredString(input.display_name, 'display_name', 160),
    institution_type: enumValue(input.institution_type, 'institution_type', 'institution_type'),
    country_code: requiredString(input.country_code, 'country_code', 2).toUpperCase(), active: booleanInt(input.active, true),
  };
  if (!/^[A-Z]{2}$/.test(value.country_code)) throw new FinanceError('VALIDATION_ERROR', 'country_code must be two uppercase letters', { field: 'country_code' });
  return withTransaction(db, () => {
    db.prepare('INSERT INTO institutions (institution_key, display_name, institution_type, country_code, active) VALUES (?, ?, ?, ?, ?)')
      .run(value.institution_key, value.display_name, value.institution_type, value.country_code, value.active);
    const row = getInstitution(value.institution_key, db);
    logChange(db, { resourceType: 'institution', resourceKey: value.institution_key, action: 'create', after: row, actorType: actor.type, actorNote: actor.note });
    return row;
  });
}

function updateInstitution(key, input, actor = {}, db = getDb()) {
  validateSchemaShape('institution', input);
  const version = expectedVersion(input.expected_version);
  return withTransaction(db, () => {
    const before = getInstitution(key, db); assertVersion(before, version);
    const name = requiredString(input.display_name, 'display_name', 160);
    const type = enumValue(input.institution_type, 'institution_type', 'institution_type');
    const country = requiredString(input.country_code, 'country_code', 2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new FinanceError('VALIDATION_ERROR', 'country_code must be two uppercase letters', { field: 'country_code' });
    db.prepare('UPDATE institutions SET display_name=?, institution_type=?, country_code=?, active=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE institution_key=?')
      .run(name, type, country, booleanInt(input.active, Boolean(before.active)), key);
    const after = getInstitution(key, db);
    logChange(db, { resourceType: 'institution', resourceKey: key, action: 'update', before, after, actorType: actor.type, actorNote: actor.note });
    return after;
  });
}

function addInstitutionAlias(key, input, actor = {}, db = getDb()) {
  validateSchemaShape('institution_alias', input);
  return withTransaction(db, () => {
    const institution = getInstitution(key, db);
    const alias = {
      source_system: requiredString(input.source_system, 'source_system', 80),
      alias_value_normalized: normalizeAlias(requiredString(input.alias_value, 'alias_value', 200)),
      country_hint: optionalString(input.country_hint, 'country_hint', 2)?.toUpperCase() || '',
      authority: enumValue(input.authority, 'authority', 'authority', 'ai_inferred'),
      review_state: enumValue(input.review_state, 'review_state', 'review_state', 'needs_review'),
    };
    if (alias.country_hint && !/^[A-Z]{2}$/.test(alias.country_hint)) throw new FinanceError('VALIDATION_ERROR', 'country_hint must be two uppercase letters', { field: 'country_hint' });
    try {
      const result = db.prepare(`INSERT INTO institution_aliases (institution_id, source_system, alias_value_normalized, country_hint, authority, review_state) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(institution.id, alias.source_system, alias.alias_value_normalized, alias.country_hint, alias.authority, alias.review_state);
      const row = db.prepare('SELECT * FROM institution_aliases WHERE id = ?').get(result.lastInsertRowid);
      logChange(db, { resourceType: 'institution_alias', resourceKey: String(row.id), action: 'create', after: row, actorType: actor.type, actorNote: actor.note });
      return row;
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) throw new FinanceError('IDENTITY_CONFLICT', 'Institution alias is already bound', { status: 409 });
      throw error;
    }
  });
}

module.exports = { listInstitutions, getInstitution, createInstitution, updateInstitution, addInstitutionAlias };
