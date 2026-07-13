const { ENUMS, SUPPORTED_CURRENCIES } = require('./enums');

const string = (options = {}) => ({ type: 'string', ...options });
const enumString = (name) => ({ type: 'string', enum: ENUMS[name] });

const SHARED_DEFINITIONS = Object.freeze({
  stable_key: string({ minLength: 1, maxLength: 100 }),
  date: string({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  date_time: string({ format: 'date-time' }),
  currency: { type: 'string', enum: SUPPORTED_CURRENCIES },
  money_minor: { type: 'string', pattern: '^-?(0|[1-9]\\d*)$', maxLength: 40 },
  decimal: { type: 'string', pattern: '^-?(0|[1-9]\\d*)(\\.\\d+)?$', maxLength: 80 },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  authority: enumString('authority'),
  review_state: enumString('review_state'),
  version: { type: 'integer', minimum: 1 },
});

const SCHEMAS = Object.freeze({
  entity: {
    $id: 'finance.entity/v1', type: 'object', additionalProperties: false,
    required: ['name', 'entity_type', 'base_currency'],
    properties: { name: string({ minLength: 1, maxLength: 120 }), entity_type: enumString('entity_type'), base_currency: SHARED_DEFINITIONS.currency, active: { type: 'boolean' }, expected_version: SHARED_DEFINITIONS.version },
  },
  institution: {
    $id: 'finance.institution/v1', type: 'object', additionalProperties: false,
    required: ['display_name', 'institution_type', 'country_code'],
    properties: { display_name: string({ minLength: 1, maxLength: 160 }), institution_type: enumString('institution_type'), country_code: string({ pattern: '^[A-Z]{2}$' }), active: { type: 'boolean' }, expected_version: SHARED_DEFINITIONS.version },
  },
  institution_alias: {
    $id: 'finance.institution-alias/v1', type: 'object', additionalProperties: false,
    required: ['source_system', 'alias_value'],
    properties: { source_system: string({ minLength: 1, maxLength: 80 }), alias_value: string({ minLength: 1, maxLength: 200 }), country_hint: string({ pattern: '^[A-Z]{2}$' }), authority: SHARED_DEFINITIONS.authority, review_state: SHARED_DEFINITIONS.review_state },
  },
  account: {
    $id: 'finance.account/v1', type: 'object', additionalProperties: false,
    required: ['display_name', 'account_kind', 'currency'],
    properties: { display_name: string({ minLength: 1, maxLength: 160 }), entity_key: SHARED_DEFINITIONS.stable_key, institution_key: SHARED_DEFINITIONS.stable_key, account_kind: enumString('account_kind'), currency: SHARED_DEFINITIONS.currency, normal_balance: enumString('normal_balance'), liquidity_class: enumString('liquidity_class'), masked_number: string({ maxLength: 32 }), active: { type: 'boolean' }, included_in_analysis: { type: 'boolean' }, authority: SHARED_DEFINITIONS.authority, review_state: SHARED_DEFINITIONS.review_state, expected_version: SHARED_DEFINITIONS.version },
  },
  account_alias: {
    $id: 'finance.account-alias/v1', type: 'object', additionalProperties: false,
    required: ['source_system', 'alias_type', 'alias_value'],
    properties: { source_system: string({ minLength: 1, maxLength: 80 }), alias_type: enumString('alias_type'), alias_value: string({ minLength: 1, maxLength: 200 }), masked_hint: string({ maxLength: 32 }), confidence: SHARED_DEFINITIONS.confidence, authority: SHARED_DEFINITIONS.authority, review_state: SHARED_DEFINITIONS.review_state },
  },
  source: {
    $id: 'finance.source/v1', type: 'object', additionalProperties: false,
    required: ['source_kind', 'description', 'authority'],
    properties: { source_kind: enumString('source_kind'), source_file: string({ maxLength: 500 }), description: string({ minLength: 1, maxLength: 500 }), content_sha256: string({ pattern: '^[a-fA-F0-9]{64}$' }), period_start: SHARED_DEFINITIONS.date, period_end: SHARED_DEFINITIONS.date, as_of_at: string({ maxLength: 40 }), observed_at: string({ maxLength: 40 }), institution_key: SHARED_DEFINITIONS.stable_key, account_key: SHARED_DEFINITIONS.stable_key, is_official: { type: 'boolean' }, authority: SHARED_DEFINITIONS.authority, artifact_status: enumString('artifact_status'), review_state: SHARED_DEFINITIONS.review_state, expected_version: SHARED_DEFINITIONS.version },
  },
  scope_attestation: {
    $id: 'finance.scope-attestation/v1', type: 'object', additionalProperties: false,
    required: ['entity_key', 'scope_kind', 'as_of_date', 'coverage_state', 'authority'],
    properties: { entity_key: SHARED_DEFINITIONS.stable_key, scope_kind: enumString('scope_kind'), as_of_date: SHARED_DEFINITIONS.date, coverage_state: enumString('coverage_state'), included_note: string({ maxLength: 1000 }), excluded_note: string({ maxLength: 1000 }), valid_until: SHARED_DEFINITIONS.date, source_key: SHARED_DEFINITIONS.stable_key, authority: SHARED_DEFINITIONS.authority, review_state: SHARED_DEFINITIONS.review_state, proposal_key: SHARED_DEFINITIONS.stable_key, confirmation_receipt: string({ maxLength: 200 }) },
  },
  source_expectation: {
    $id: 'finance.source-expectation/v1', type: 'object', additionalProperties: false,
    required: ['entity_key', 'target_context', 'expected_source_kind', 'cadence', 'authority', 'goals'],
    properties: { entity_key: SHARED_DEFINITIONS.stable_key, account_key: SHARED_DEFINITIONS.stable_key, target_context: enumString('target_context'), expected_source_kind: enumString('source_kind'), cadence: enumString('cadence'), grace_days: { type: 'integer', minimum: 0, maximum: 366 }, period_anchor: string({ maxLength: 40 }), active: { type: 'boolean' }, authority: SHARED_DEFINITIONS.authority, review_state: SHARED_DEFINITIONS.review_state, goals: { type: 'array', minItems: 1, uniqueItems: true, items: enumString('analysis_goal') }, expected_version: SHARED_DEFINITIONS.version },
  },
  error: {
    $id: 'finance.error/v1', type: 'object', additionalProperties: false,
    required: ['error'], properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'retryable'], properties: { code: enumString('error_code'), message: string({ minLength: 1, maxLength: 500 }), field: string({ maxLength: 200 }), allowed_values: { type: 'array', items: string() }, retryable: { type: 'boolean' } } } },
  },
});

module.exports = { SHARED_DEFINITIONS, SCHEMAS };
