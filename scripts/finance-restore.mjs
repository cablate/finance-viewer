import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { restoreFinanceBackup } = require('../lib/db/backup');

function value(name) { const index=process.argv.indexOf(name); return index === -1 ? null : process.argv[index+1]; }
const manifestPath=value('--input'); const targetPath=value('--target');
if(!manifestPath||!targetPath)throw new Error('Usage: node scripts/finance-restore.mjs --input <backup-manifest> --target <new-db-path>');
const result=await restoreFinanceBackup({manifestPath,targetPath});
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
