const legacyBaseline = require('./0001-legacy-baseline');
const financialSharedKernel = require('./0002-financial-shared-kernel');

const MIGRATIONS = Object.freeze([legacyBaseline, financialSharedKernel]);

module.exports = { MIGRATIONS };
