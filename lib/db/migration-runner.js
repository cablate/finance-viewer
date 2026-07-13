const { createHash } = require('node:crypto');

function migrationChecksum(migration) {
  return createHash('sha256')
    .update(`${migration.version}\n${migration.name}\n${migration.source}\n${migration.apply.toString()}`)
    .digest('hex');
}

function ensureMigrationLedger(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      app_version TEXT NOT NULL
    ) STRICT;
  `);
}

function runMigrations(db, migrations, { appVersion }) {
  if (!db.isTransaction) {
    throw new Error('Migration runner requires an existing transaction');
  }
  ensureMigrationLedger(db);

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const seen = new Set();
  const knownVersions = new Set(ordered.map((migration) => migration.version));
  const unknownApplied = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all()
    .find((migration) => !knownVersions.has(Number(migration.version)));
  if (unknownApplied) {
    throw new Error(`Database contains unknown/newer migration ${unknownApplied.version} (${unknownApplied.name})`);
  }
  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version <= 0 || seen.has(migration.version)) {
      throw new Error(`Invalid or duplicate migration version: ${migration.version}`);
    }
    seen.add(migration.version);
    const checksum = migrationChecksum(migration);
    const existing = db.prepare('SELECT name, checksum FROM schema_migrations WHERE version = ?').get(migration.version);
    if (existing) {
      if (existing.name !== migration.name || existing.checksum !== checksum) {
        throw new Error(`Migration checksum mismatch at version ${migration.version} (${migration.name})`);
      }
      continue;
    }

    migration.apply(db);
    db.prepare(`
      INSERT INTO schema_migrations (version, name, checksum, app_version)
      VALUES (?, ?, ?, ?)
    `).run(migration.version, migration.name, checksum, appVersion);
  }

  return db.prepare(`
    SELECT version, name, checksum, applied_at, app_version
    FROM schema_migrations ORDER BY version
  `).all();
}

module.exports = { migrationChecksum, ensureMigrationLedger, runMigrations };
