const { FinanceError } = require('../contracts');

function parseDecimal(value, field = 'decimal') {
  if (typeof value !== 'string') throw new FinanceError('VALIDATION_ERROR', `${field} must be a canonical decimal string`, { field });
  const text = value;
  const match = text.match(/^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match || text.length > 80) throw new FinanceError('VALIDATION_ERROR', `${field} must be a canonical decimal string`, { field });
  const fraction = match[3] || '';
  const coefficient = BigInt(`${match[1]}${match[2]}${fraction}`);
  return { text, coefficient, scale: fraction.length };
}

function pow10(exponent) { return 10n ** BigInt(exponent); }

function roundHalfEven(numerator, denominator) {
  const negative = numerator < 0n; const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator; const remainder = absolute % denominator;
  const doubled = remainder * 2n;
  const rounded = doubled > denominator || (doubled === denominator && quotient % 2n === 1n) ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function multiplyToInteger(values, outputScale = 0) {
  const parsed = values.map((value, index) => parseDecimal(value, `values[${index}]`));
  const coefficient = parsed.reduce((product, item) => product * item.coefficient, 1n);
  const inputScale = parsed.reduce((sum, item) => sum + item.scale, 0);
  if (outputScale >= inputScale) return coefficient * pow10(outputScale - inputScale);
  return roundHalfEven(coefficient, pow10(inputScale - outputScale));
}

const CURRENCY_EXPONENTS = Object.freeze({ JPY: 0 });

function currencyExponent(currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new FinanceError('VALIDATION_ERROR', 'currency must be an ISO currency code', { field: 'currency' });
  }
  return CURRENCY_EXPONENTS[currency] ?? 2;
}

function decimalToMinor(values, currency = 'TWD') {
  return multiplyToInteger(values, currencyExponent(currency));
}

function minorToDecimal(value, currency = 'TWD') {
  const minor = BigInt(value); const exponent = currencyExponent(currency);
  if (exponent === 0) return minor.toString();
  const negative = minor < 0n; const absolute = negative ? -minor : minor;
  const scale = pow10(exponent);
  return `${negative ? '-' : ''}${absolute / scale}.${(absolute % scale).toString().padStart(exponent, '0')}`;
}

module.exports = { parseDecimal, roundHalfEven, multiplyToInteger, currencyExponent, decimalToMinor, minorToDecimal };
