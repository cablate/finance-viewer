const POLICY_VERSION = 'finance-readiness/1';

const GOALS = Object.freeze({
  spending_history: ['cash_activity'],
  cash_position: ['scope', 'cash_accounts', 'cash_balances', 'source_freshness'],
  net_worth: ['cash_position', 'debt_facts', 'investment_valuation', 'valued_items', 'reconciliation'],
  debt_obligations: ['scope', 'card_statements', 'liability_principal'],
  investment_value: ['scope', 'investment_valuation', 'source_freshness'],
  cash_flow_statement: ['cash_boundaries', 'cash_activity', 'reconciliation'],
  liquidity_forecast_90d: ['cash_position', 'debt_facts', 'commitments'],
  tax_or_derivatives: ['separate_context'],
});

function gapRequirement(gap) {
  const value = gap.gap || '';
  if (value.includes('scope_attestation') || value === 'scope_not_complete') return 'scope';
  if (value.includes('expected_source') || value.includes('stale')) return 'source_freshness';
  if (value.includes('balance') || value === 'no_cash_accounts') return 'cash_balances';
  if (value.includes('credit_card_statement')) return 'card_statements';
  if (value.includes('loan_principal') || value.includes('debt_obligations')) return 'liability_principal';
  if (value.includes('investment')) return 'investment_valuation';
  if (value.includes('valued_item')) return 'valued_items';
  if (value.includes('reconciliation') || value.includes('transfer')) return 'reconciliation';
  if (value.includes('beginning_cash') || value.includes('ending_cash')) return 'cash_boundaries';
  if (value.includes('cash_activity')) return 'cash_activity';
  if (value.includes('commitment')) return 'commitments';
  if (value.includes('separate_context')) return 'separate_context';
  return GOALS.cash_position.includes(value) ? value : 'domain_facts';
}

function gapPriority(gap) {
  const value = gap.gap || '';
  if (value.includes('scope_attestation') || value === 'scope_not_complete') return 1;
  if (value.includes('identity') || value.includes('explicit_scope')) return 2;
  if (/missing_(?:liability|loan|account|holding|credit_card)|no_cash|no_cash_activity/.test(value)) return 3;
  if (value.includes('expected_source') || value.includes('stale') || value.includes('missing_quote') || value.includes('missing_fx')) return 4;
  if (value.includes('conflict') || value.includes('reconciliation') || value.includes('transfer')) return 5;
  return 6;
}

function nextAction(gap) {
  if (gap.next_action) return gap.next_action;
  const value = gap.gap || '';
  if (value.includes('scope_attestation')) return 'confirm_or_update_scope_inventory';
  if (value.includes('expected_source')) return 'provide_expected_source_period';
  if (value.includes('balance')) return 'add_or_review_balance_snapshot';
  if (value.includes('quote')) return 'add_current_market_quote';
  if (value.includes('fx')) return 'add_as_of_fx_quote';
  if (value.includes('transfer') || value.includes('reconciliation')) return 'resolve_reconciliation_queue';
  if (value.includes('commitment')) return 'add_or_confirm_commitments';
  if (value.includes('separate_context')) return 'use_or_build_separate_typed_context';
  return 'inspect_typed_evidence';
}

function sourceWatermark(db) {
  const source = db.prepare("SELECT COUNT(*) count,MAX(id) max_id,MAX(updated_at) updated_at FROM sources WHERE status='active'").get();
  const changes = db.prepare('SELECT MAX(id) max_id,MAX(changed_at) changed_at FROM data_change_log').get();
  return { active_source_count: Number(source.count), source_max_id: Number(source.max_id || 0), source_updated_at: source.updated_at || null, change_max_id: Number(changes.max_id || 0), changed_at: changes.changed_at || null };
}

function finalizeReadiness(result, db, { entityKey, accountKey = null }) {
  const requirements = GOALS[result.goal] || [];
  const gaps = (result.gaps || []).map((gap) => {
    const priority = gapPriority(gap); return { ...gap, requirement: gapRequirement(gap), priority, impact: priority <= 3 ? 'blocks_complete_answer' : (priority <= 5 ? 'may_change_material_result' : 'improves_detail'), effort_hint: priority === 1 ? 'human_inventory_decision' : (priority <= 4 ? 'provide_one_typed_source' : 'review_existing_evidence'), next_action: nextAction(gap) };
  }).sort((a, b) => a.priority - b.priority || a.gap.localeCompare(b.gap));
  const blocked = new Set(gaps.map((gap) => gap.requirement));
  return { ...result, scope_evidence: result.scope || null, api_version: 'finance/v1', policy_version: POLICY_VERSION, scope: { kind: accountKey ? 'account' : 'global', entity_key: entityKey, account_key: accountKey }, requirements, satisfied: requirements.filter((requirement) => !blocked.has(requirement)), gaps, conflicts: gaps.filter((gap) => gap.priority === 5), freshness: { as_of_date: result.as_of_date, stale: result.status === 'stale' }, priority: gaps[0]?.priority || null, next_actions: gaps.map((gap) => gap.next_action), source_watermark: sourceWatermark(db) };
}

module.exports = { POLICY_VERSION, GOALS, finalizeReadiness, sourceWatermark };
