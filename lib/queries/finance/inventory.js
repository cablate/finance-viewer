const { FinanceError, enumValue, isoDate } = require('../../finance/contracts');
const { getDb, requireRow } = require('./common');
const { listAccounts } = require('./accounts');
const { listSources } = require('./sources');
const { latestBalanceForAccount } = require('./balances');
const { coarseScopeStatus } = require('./scope');
const { activeRecordSql } = require('../../finance/active-records');
const { listCreditCards, listLiabilities, listCommitments } = require('./obligations');
const { investmentPositions } = require('./investments');
const { listValuedItems } = require('./valued-items');
const { reconciliationSummary } = require('./reconciliation');
const { listReviewTasks } = require('./review-tasks');

function localDate() { return new Date().toLocaleDateString('en-CA'); }

function dayDiff(later, earlier) {
  return Math.floor((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}

function expectationGaps(goal, entityKey, asOfDate, db) {
  const rows = db.prepare(`SELECT x.*,a.account_key FROM source_expectations x
    JOIN reporting_entities e ON e.id=x.entity_id LEFT JOIN accounts a ON a.id=x.account_id
    JOIN source_expectation_goals g ON g.expectation_id=x.id
    WHERE e.entity_key=? AND g.goal_key=? AND x.active=1`).all(entityKey, goal);
  const hard = []; const candidates = [];
  for (const expectation of rows) {
    const latest = db.prepare(`SELECT source_key,COALESCE(period_end,substr(as_of_at,1,10),substr(observed_at,1,10),substr(imported_at,1,10)) AS evidence_date
      FROM sources WHERE status='active' AND source_kind=? AND (? IS NULL OR account_id=?) ORDER BY evidence_date DESC,id DESC LIMIT 1`).get(expectation.expected_source_kind, expectation.account_id, expectation.account_id);
    let gap = null;
    if (!latest?.evidence_date) gap = 'missing_expected_source';
    else if (expectation.cadence === 'monthly' && dayDiff(asOfDate, latest.evidence_date) > 31 + Number(expectation.grace_days || 0)) gap = 'expected_source_overdue';
    if (!gap) continue;
    const item = { expectation_key: expectation.expectation_key, account_key: expectation.account_key, expected_source_kind: expectation.expected_source_kind, gap, latest_evidence_date: latest?.evidence_date || null };
    if (['official', 'user_confirmed'].includes(expectation.authority) && expectation.review_state === 'confirmed') hard.push(item); else candidates.push(item);
  }
  return { hard, candidates };
}

function readinessForGoal(goal, { entityKey = 'personal', asOfDate = localDate() } = {}, db = getDb()) {
  enumValue(goal, 'analysis_goal', 'goal'); isoDate(asOfDate, 'as_of');
  requireRow(db.prepare('SELECT * FROM reporting_entities WHERE entity_key=?').get(entityKey), 'Entity');
  const expectations = expectationGaps(goal, entityKey, asOfDate, db);
  if (goal === 'spending_history') {
    const coverage = db.prepare(`SELECT COUNT(*) AS rows,MIN(transaction_date) AS period_start,MAX(transaction_date) AS period_end FROM transactions WHERE ${activeRecordSql()}`).get();
    const gaps = [...expectations.hard];
    if (!coverage.rows) gaps.unshift({ gap: 'no_cash_activity' });
    return { goal, status: gaps.length ? (coverage.rows ? 'partial' : 'empty') : 'complete', as_of_date: asOfDate, gaps, candidate_gaps: expectations.candidates, evidence: { transaction_rows: coverage.rows, period_start: coverage.period_start, period_end: coverage.period_end } };
  }
  if (goal === 'cash_position') {
    const accounts = listAccounts({ entity_key: entityKey, active: true }, db).filter((account) => account.included_in_analysis && ['cash', 'bank', 'e_wallet'].includes(account.account_kind));
    const balances = accounts.map((account) => ({ account_key: account.account_key, display_name: account.display_name, ...latestBalanceForAccount(account.account_key, { asOfDate }, db) }));
    const scope = coarseScopeStatus({ entityKey, scopeKind: 'cash_accounts' }, db); const gaps = [...expectations.hard];
    if (!accounts.length) gaps.push({ gap: 'no_cash_accounts' });
    if (scope.status !== 'complete') gaps.push({ gap: scope.gap, attestation_key: scope.attestation_key || null });
    for (const balance of balances) if (balance.status !== 'current') gaps.push({ gap: `balance_${balance.status}`, account_key: balance.account_key });
    const hasConflict = balances.some((balance) => balance.status === 'conflicted'); const hasStale = balances.some((balance) => balance.status === 'stale');
    return { goal, status: hasConflict ? 'conflicted' : (hasStale ? 'stale' : (gaps.length ? (accounts.length ? 'partial' : 'empty') : 'complete')), as_of_date: asOfDate, gaps, candidate_gaps: expectations.candidates, scope, accounts: balances };
  }
  if (goal === 'debt_obligations') {
    const cards = listCreditCards(db).filter((item) => item.entity_key === entityKey);
    const liabilities = listLiabilities(db).filter((item) => item.entity_key === entityKey);
    const cardScope = coarseScopeStatus({ entityKey, scopeKind: 'credit_cards' }, db);
    const liabilityScope = coarseScopeStatus({ entityKey, scopeKind: 'liabilities' }, db);
    const gaps = [...expectations.hard];
    if (cardScope.status !== 'complete') gaps.push({ gap: cardScope.gap, scope_kind: 'credit_cards' });
    if (liabilityScope.status !== 'complete') gaps.push({ gap: liabilityScope.gap, scope_kind: 'liabilities' });
    for (const card of cards) {
      if (!card.statements.length) gaps.push({ gap: 'missing_credit_card_statement', account_key: card.account_key, next_action: 'import_credit_card_statement' });
    }
    for (const liability of liabilities) {
      const principal = db.prepare(`SELECT snapshot_key,as_of_date,review_state FROM account_balance_snapshots
        WHERE account_id=? AND balance_kind='principal' AND record_status IN ('provisional','posted','confirmed')
        AND as_of_date<=? ORDER BY as_of_date DESC,id DESC LIMIT 1`).get(liability.account_id, asOfDate);
      if (!principal) gaps.push({ gap: 'missing_loan_principal_balance', account_key: liability.account_key, liability_key: liability.liability_key, next_action: 'add_principal_balance_snapshot' });
    }
    const hasAnyDebt = cards.length || liabilities.length;
    return {
      goal,
      status: gaps.length ? (hasAnyDebt ? 'partial' : 'empty') : 'complete',
      as_of_date: asOfDate,
      gaps,
      candidate_gaps: expectations.candidates,
      scopes: { credit_cards: cardScope, liabilities: liabilityScope },
      evidence: { credit_card_profiles: cards.length, liability_profiles: liabilities.length },
    };
  }
  if (goal === 'liquidity_forecast_90d') {
    const cash = readinessForGoal('cash_position', { entityKey, asOfDate }, db);
    const debt = readinessForGoal('debt_obligations', { entityKey, asOfDate }, db);
    const commitments = listCommitments(db).filter((item) => item.entity_key === entityKey && item.status === 'scheduled');
    const gaps = [
      ...(cash.status === 'complete' ? [] : [{ gap: 'cash_position_not_ready', status: cash.status }]),
      ...(debt.status === 'complete' ? [] : [{ gap: 'debt_obligations_not_ready', status: debt.status }]),
      ...(!commitments.length ? [{ gap: 'no_confirmed_commitments', next_action: 'add_recurring_cash_commitments' }] : []),
    ];
    return {
      goal,
      status: 'partial',
      as_of_date: asOfDate,
      gaps,
      candidate_gaps: expectations.candidates,
      prerequisites_ready: gaps.length === 0,
      forecast_available: false,
      evidence: { cash_position: cash.status, debt_obligations: debt.status, scheduled_commitments: commitments.length },
    };
  }
  if (goal === 'investment_value') {
    const scope = coarseScopeStatus({ entityKey, scopeKind: 'investments' }, db);
    const positions = investmentPositions({ entityKey, asOfDate, baseCurrency: 'TWD' }, db);
    const gaps = [...expectations.hard];
    if (scope.status !== 'complete') gaps.push({ gap: scope.gap, scope_kind: 'investments' });
    for (const position of positions) if (position.valuation_status !== 'current') gaps.push({ gap: `investment_${position.valuation_status}`, instrument_key: position.instrument_key, account_key: position.account_key });
    const statuses = new Set(positions.map((item) => item.valuation_status));
    return { goal, status: statuses.has('currency_mismatch') ? 'conflicted' : (statuses.has('stale') ? 'stale' : (gaps.length ? (positions.length ? 'partial' : 'empty') : 'complete')), as_of_date: asOfDate, gaps, candidate_gaps: expectations.candidates, scope, positions };
  }
  if (goal === 'net_worth') {
    const cash = readinessForGoal('cash_position', { entityKey, asOfDate }, db);
    const debt = readinessForGoal('debt_obligations', { entityKey, asOfDate }, db);
    const investments = readinessForGoal('investment_value', { entityKey, asOfDate }, db);
    const valuedScope = coarseScopeStatus({ entityKey, scopeKind: 'valued_items' }, db); const valuedItems = listValuedItems({ entityKey, asOfDate }, db); const reconciliation = reconciliationSummary(db);
    const valuedStatus = valuedScope.status !== 'complete' || valuedItems.some((item) => !item.latest_valuation) ? (valuedItems.length ? 'partial' : 'empty') : 'complete';
    const prerequisites = { cash_position: cash.status, debt_obligations: debt.status, investment_value: investments.status, valued_items: valuedStatus, reconciliation: reconciliation.status };
    const gaps = Object.entries(prerequisites).filter(([, status]) => status !== 'complete').map(([name, status]) => ({ gap: `${name}_not_ready`, status }));
    const status = Object.values(prerequisites).includes('conflicted') ? 'conflicted' : (reconciliation.status === 'unreconciled' ? 'unreconciled' : (gaps.length ? 'partial' : 'complete'));
    return { goal, status, as_of_date: asOfDate, gaps, candidate_gaps: expectations.candidates, prerequisites, valued_item_scope: valuedScope, report_available: false };
  }
  return { goal, status: 'unsupported', as_of_date: asOfDate, gaps: [{ gap: 'goal_not_available_until_later_phase' }], candidate_gaps: expectations.candidates };
}

function getFinanceInventory({ entityKey = 'personal', asOfDate = localDate() } = {}, db = getDb()) {
  isoDate(asOfDate, 'as_of');
  const entity = requireRow(db.prepare('SELECT * FROM reporting_entities WHERE entity_key=?').get(entityKey), 'Entity');
  const accounts = listAccounts({ entity_key: entityKey }, db).map((account) => ({ ...account, balance: account.active && account.included_in_analysis ? latestBalanceForAccount(account.account_key, { asOfDate }, db) : null }));
  const transactionCoverage = db.prepare(`SELECT COUNT(*) AS rows,MIN(transaction_date) AS period_start,MAX(transaction_date) AS period_end,COUNT(DISTINCT transaction_month) AS months FROM transactions WHERE ${activeRecordSql()}`).get();
  const creditCards = listCreditCards(db).filter((item) => accounts.some((account) => account.account_key === item.account_key));
  const liabilities = listLiabilities(db).filter((item) => accounts.some((account) => account.account_key === item.account_key));
  const commitments = listCommitments(db).filter((item) => item.entity_key === entityKey);
  const investments = investmentPositions({ entityKey, asOfDate, baseCurrency: entity.base_currency || 'TWD' }, db);
  const valuedItems = listValuedItems({ entityKey, asOfDate }, db); const reconciliation = reconciliationSummary(db); const reviewTasks = listReviewTasks({ status: 'open' }, db);
  return {
    api_version: 'finance/v1', as_of_date: asOfDate, entity, accounts, sources: listSources({}, db),
    credit_cards: creditCards, liabilities, commitments, investments, valued_items: valuedItems, reconciliation, review_tasks: reviewTasks, transaction_coverage: transactionCoverage,
    net_worth_inventory: {
      tier_1: { cash_accounts: accounts.filter((item) => ['cash','bank','e_wallet'].includes(item.account_kind)), liabilities, investments },
      tier_2: { valued_items: valuedItems },
      note: 'Tier 2 valuations do not create cash-flow or profit-and-loss facts.',
    },
    readiness: {
      spending_history: readinessForGoal('spending_history', { entityKey, asOfDate }, db),
      cash_position: readinessForGoal('cash_position', { entityKey, asOfDate }, db),
      debt_obligations: readinessForGoal('debt_obligations', { entityKey, asOfDate }, db),
      liquidity_forecast_90d: readinessForGoal('liquidity_forecast_90d', { entityKey, asOfDate }, db),
      investment_value: readinessForGoal('investment_value', { entityKey, asOfDate }, db),
      net_worth: readinessForGoal('net_worth', { entityKey, asOfDate }, db),
    },
  };
}

module.exports = { expectationGaps, readinessForGoal, getFinanceInventory };
