const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('runtime smoke refuses a caller-provided DB path before deleting anything', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'last-say-smoke-safety-'));
  const protectedDb = path.join(dir, 'must-survive.sqlite');
  const sentinel = 'do-not-delete';
  fs.writeFileSync(protectedDb, sentinel, 'utf8');

  try {
    const result = spawnSync(process.execPath, ['scripts/smoke-runtime.mjs'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, FINANCE_DB_PATH: protectedDb },
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /only permits data\/dev-verify-runtime\.sqlite/);
    assert.equal(fs.readFileSync(protectedDb, 'utf8'), sentinel);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
