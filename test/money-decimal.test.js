const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDecimal, roundHalfEven, decimalToMinor, minorToDecimal } = require('../lib/finance/money/decimal');

test('decimal owner preserves canonical text and rejects exponent or float inputs', () => {
  assert.deepEqual(parseDecimal('125.500'), { text: '125.500', coefficient: 125500n, scale: 3 });
  assert.throws(() => parseDecimal('1e-3'), /canonical decimal string/);
  assert.throws(() => parseDecimal(0.1 + 0.2), /canonical decimal string/);
});

test('half-even rounding is deterministic at exact ties', () => {
  assert.equal(roundHalfEven(5n, 2n), 2n);
  assert.equal(roundHalfEven(7n, 2n), 4n);
  assert.equal(decimalToMinor(['10.25', '101.23']), 103761n);
  assert.equal(decimalToMinor(['10.25', '101.23'], 'JPY'), 1038n);
  assert.equal(minorToDecimal(1038n, 'JPY'), '1038');
  assert.equal(minorToDecimal(103761n, 'USD'), '1037.61');
});
