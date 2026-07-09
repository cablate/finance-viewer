function makeBlocker(kind, count, label, recommendedAction) {
  return {
    kind,
    severity: 'blocks_complete',
    count,
    label,
    recommended_action: recommendedAction,
  };
}

function buildIncomeStatementCoverage({
  entityId = 'personal',
  periodStart = null,
  periodEnd = null,
  basis = 'card_accrual_management',
  currency = 'TWD',
  includedAccountIds = [],
  defaultedFields = [],
  transactionCount = 0,
  unmappedTransactionCount = 0,
  unreviewedTransactionCount = 0,
  unmatchedTransferCount = 0,
}) {
  const blockers = [];
  const warnings = [];

  if (unmappedTransactionCount > 0) {
    blockers.push(makeBlocker(
      'unmapped_report_line',
      unmappedTransactionCount,
      `${unmappedTransactionCount} 筆交易需要指定報表科目。`,
      'review_report_mappings',
    ));
  }

  if (unreviewedTransactionCount > 0) {
    blockers.push(makeBlocker(
      'unreviewed_transaction',
      unreviewedTransactionCount,
      `${unreviewedTransactionCount} 筆交易尚未審核。`,
      'review_transactions',
    ));
  }

  if (unmatchedTransferCount > 0) {
    blockers.push(makeBlocker(
      'unmatched_transfer',
      unmatchedTransferCount,
      `${unmatchedTransferCount} 筆疑似轉帳交易需要審核。`,
      'review_transfers',
    ));
  }

  if (defaultedFields.length > 0) {
    warnings.push({
      kind: 'defaulted_scope',
      severity: 'info',
      fields: defaultedFields,
      label: `使用預設報表範圍：${defaultedFields.join(', ')}`,
    });
  }

  let status = 'complete';
  if (transactionCount === 0) status = 'empty';
  else if (unmappedTransactionCount > 0 && unreviewedTransactionCount === 0) status = 'unmapped';
  else if (blockers.length > 0) status = 'partial';

  return {
    status,
    entity_id: entityId,
    period_start: periodStart,
    period_end: periodEnd,
    as_of_date: periodEnd,
    basis,
    currency,
    included_account_ids: includedAccountIds,
    defaulted_fields: defaultedFields,
    missing_required_accounts: [],
    missing_balance_snapshots: [],
    stale_balance_snapshots: [],
    unreviewed_transaction_count: unreviewedTransactionCount,
    unmapped_transaction_count: unmappedTransactionCount,
    unmatched_transfer_count: unmatchedTransferCount,
    reconciliation_delta_cents: 0,
    blockers,
    warnings,
  };
}

module.exports = {
  buildIncomeStatementCoverage,
};
