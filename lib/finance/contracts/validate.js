const { ENUMS, SUPPORTED_CURRENCIES } = require('./enums');
const { SCHEMAS } = require('./schemas');

class FinanceError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'FinanceError';
    this.code = code;
    this.status = options.status ?? 400;
    this.field = options.field;
    this.allowedValues = options.allowedValues;
    this.retryable = options.retryable ?? false;
  }
}

function fail(message, options = {}) {
  throw new FinanceError('VALIDATION_ERROR', message, options);
}

function assertObject(value, name = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`, { field: name });
}

function rejectUnknown(value, allowed, name = 'body') {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`Unknown field: ${unknown[0]}`, { field: `${name}.${unknown[0]}` });
}

function requiredString(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} is required`, { field });
  const result = value.trim();
  if (result.length > maxLength) fail(`${field} exceeds ${maxLength} characters`, { field });
  return result;
}

function optionalString(value, field, maxLength = 500) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(`${field} must be a string`, { field });
  const result = value.trim();
  if (result.length > maxLength) fail(`${field} exceeds ${maxLength} characters`, { field });
  return result || null;
}

function enumValue(value, enumName, field, fallback) {
  const candidate = value ?? fallback;
  if (!ENUMS[enumName].includes(candidate)) fail(`${field} has an unsupported value`, { field, allowedValues: ENUMS[enumName] });
  return candidate;
}

function currency(value, field = 'currency') {
  const candidate = requiredString(value, field, 3).toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(candidate)) fail(`${field} is not supported`, { field, allowedValues: SUPPORTED_CURRENCIES });
  return candidate;
}

function isoDate(value, field) {
  const candidate = requiredString(value, field, 10);
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) fail(`${field} must be a real YYYY-MM-DD date`, { field });
  return candidate;
}

function booleanInt(value, fallback = true) {
  if (value === undefined) return fallback ? 1 : 0;
  if (typeof value !== 'boolean') fail('Boolean field must be true or false');
  return value ? 1 : 0;
}

function expectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) fail('expected_version must be a positive integer', { field: 'expected_version' });
  return version;
}

function validateSchemaShape(schemaName, body) {
  const schema = SCHEMAS[schemaName];
  if (!schema) throw new FinanceError('UNKNOWN_SCHEMA', `Unknown schema: ${schemaName}`, { status: 400 });
  assertObject(body);
  rejectUnknown(body, Object.keys(schema.properties));
  for (const field of schema.required || []) {
    if (body[field] === undefined || body[field] === null || body[field] === '') fail(`${field} is required`, { field });
  }
  return body;
}

function errorEnvelope(error) {
  const financeError = error instanceof FinanceError
    ? error
    : new FinanceError('DB_UNAVAILABLE', '資料服務暫時無法使用。', { status: 500, retryable: true });
  const payload = { code: financeError.code, message: financeError.message, retryable: financeError.retryable };
  if (financeError.field) payload.field = financeError.field;
  if (financeError.allowedValues) payload.allowed_values = financeError.allowedValues;
  return { status: financeError.status, body: { error: payload } };
}

module.exports = { FinanceError, assertObject, rejectUnknown, requiredString, optionalString, enumValue, currency, isoDate, booleanInt, expectedVersion, validateSchemaShape, errorEnvelope };
