const legacyBaseline = require('./0001-legacy-baseline');
const financialSharedKernel = require('./0002-financial-shared-kernel');
const ingestionAndBalances = require('./0003-ingestion-and-balances');
const obligations = require('./0004-obligations');
const investments = require('./0005-investments');
const reconciliation = require('./0006-reconciliation');

const MIGRATIONS = Object.freeze([legacyBaseline, financialSharedKernel, ingestionAndBalances, obligations, investments, reconciliation]);

module.exports = { MIGRATIONS };
