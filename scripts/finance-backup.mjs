import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createFinanceBackup } = require('../lib/db/backup');

function value(name) { const index=process.argv.indexOf(name); return index === -1 ? null : process.argv[index+1]; }
const dbPath=value('--db'); const outputDir=value('--output'); const includeSources=process.argv.includes('--include-sources');
if(!dbPath||!outputDir)throw new Error('Usage: node scripts/finance-backup.mjs --db <explicit-db-path> --output <ignored-backup-dir> [--include-sources]');
const result=await createFinanceBackup({dbPath,outputDir,includeSources});
process.stdout.write(`${JSON.stringify({bundle_dir:result.bundle_dir,manifest_path:result.manifest_path,mode:result.manifest.mode,warning:result.manifest.warning},null,2)}\n`);
