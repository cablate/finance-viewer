const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeForRule, isLikelyIdToken } = require('../lib/normalize');

test('normalizeForRule converges statement merchant variants into stable match keys', () => {
  const cases = [
    ['Ｃａｂ＊Ｃｏｄｅ', 'cab*code'],
    ['連加＊統一超商股份有限', '連加*統一超商股份有限'],
    ['統一金流－ＣａｂＣｏｄ', '統一金流-cabcod'],
    ['保險費分期 01/12', '保險費分期'],
    ['保險費分期 12/12', '保險費分期'],
    ['GOOGLE*CLOUD WMZPFP', 'google*cloud'],
    ['GOOGLE*CLOUD Z9FJ2T', 'google*cloud'],
    ['GOOGLE*CLOUD QCPZWS', 'google*cloud'],
    ['Nintendo CC1583732260', 'nintendo'],
    ['STEAMGAMES.COM 4259522985', 'steamgames.com'],
    ['OpenAI   *ChatGPT   SUBSCR', 'openai *chatgpt'],
    ['國外交易手續費 -CLAUDE', '國外交易手續費 -claude'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeForRule(input), expected, input);
  }
});

test('identifier-token detection happens before lowercase conversion', () => {
  assert.equal(isLikelyIdToken('QCPZWS'), true);
  assert.equal(isLikelyIdToken('qcpzws'), false);
  assert.equal(normalizeForRule('GOOGLE*CLOUD QCPZWS'), 'google*cloud');
  assert.equal(normalizeForRule('GOOGLE*CLOUD qcpzws'), 'google*cloud qcpzws');
});

