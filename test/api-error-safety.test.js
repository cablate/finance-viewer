const test = require('node:test');
const assert = require('node:assert/strict');

const { safeErrorMessage } = require('../lib/api-helpers');

test('safeErrorMessage hides internal details in production and preserves them in development', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);

  try {
    const error = new Error('SQLITE_CANTOPEN: C:\\private\\finance.sqlite');
    process.env.NODE_ENV = 'production';
    assert.equal(safeErrorMessage(error), '處理時發生錯誤，請稍後再試。');

    process.env.NODE_ENV = 'development';
    assert.equal(safeErrorMessage(error), error.message);
    assert.equal(logged.length, 2, 'both environments must preserve a server-side trace');
  } finally {
    console.error = previousError;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});
