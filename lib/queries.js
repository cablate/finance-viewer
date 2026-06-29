// 所有 SQLite 查詢邏輯（搬自原 src/server.js + src/database.js）。
// 內部用 getDb() 單例。寫入路徑（patchTransaction/batchCorrection）已包 DB transaction（audit P2#7）。
const { getDb } = require('./db');
const { EDITABLE_FIELDS, DIMENSION_MAP } = require('./constants');

// 「實際消費」認定條件（排除移轉、信用卡繳款、不列入）
const SPEND_WHERE = `
  outflow > 0
  AND owner_primary <> '移轉不算'
  AND flow_type <> '信用卡繳款/移轉'
  AND necessity <> '不列入'
`;

// 排序白名單（getTransactions 用；含 t. 前綴）
const ALLOWED_SORT = {
  date: 't.transaction_date',
  name: 't.name',
  amount: 't.amount',
  outflow: 't.outflow',
  category: 't.category_primary',
  owner: 't.owner_primary',
  necessity: 't.necessity',
};

// 數值安全轉換：避免 audit 指出的 limit/offset NaN 問題（Number('abc')=NaN）。
// 注意 searchParams.get() 無值時回 null（不是 undefined），Number(null)=0 會誤成 LIMIT 0，
// 故須先明確把 null/undefined/空字串 視為 fallback。
function safeInt(value, fallback, max) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let v = Math.max(n, 0);
  if (max !== undefined) v = Math.min(v, max);
  return v;
}

function buildTransactionWhere(params, tableAlias = '') {
  const where = [];
  const values = {};
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const month = params.get('month');
  if (month) {
    where.push(`${prefix}transaction_month = $month`);
    values.$month = month;
  }

  where.push(`(${prefix}flow_type IS NULL OR (${prefix}flow_type <> '信用卡繳款/移轉' AND ${prefix}flow_type <> '信用卡繳款'))`);

  const view = params.get('view') || 'all';
  const scope = params.get('scope') || 'all';

  if (scope === 'personal') where.push(`${prefix}owner_primary = '個人'`);
  else if (scope === 'business') where.push(`${prefix}owner_primary IN ('事業', '事業候選')`);

  if (view === 'card') where.push(`${prefix}source_type LIKE '%信用卡%'`);
  if (view === 'bank') where.push(`${prefix}source_type LIKE '%帳戶%'`);
  if (view === 'saving') where.push(`(${prefix}necessity IN ('可節省', '可優化') AND ${prefix}owner_primary <> '移轉不算')`);
  if (view === 'review') where.push(`(${prefix}owner_primary = '待確認' OR ${prefix}category_primary = '待確認' OR ${prefix}necessity = '需確認')`);
  if (view === 'unreviewed') where.push(`NOT EXISTS (SELECT 1 FROM correction_log cl WHERE cl.transaction_id = ${prefix}id)`);

  const owner = params.get('owner');
  if (owner) { where.push(`${prefix}owner_primary = $owner`); values.$owner = owner; }
  const category = params.get('category');
  if (category) { where.push(`${prefix}category_primary = $category`); values.$category = category; }
  const necessity = params.get('necessity');
  if (necessity) { where.push(`${prefix}necessity = $necessity`); values.$necessity = necessity; }
  const source = params.get('source');
  if (source) { where.push(`${prefix}source_type = $source`); values.$source = source; }
  const flow = params.get('flow');
  if (flow) { where.push(`${prefix}flow_type = $flow`); values.$flow = flow; }
  const search = params.get('search');
  if (search) {
    where.push(`(${prefix}name LIKE $search OR ${prefix}raw_info LIKE $search OR ${prefix}memo LIKE $search OR ${prefix}judgment_reason LIKE $search)`);
    values.$search = `%${search}%`;
  }

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
}

function getMeta() {
  const db = getDb();
  const transactionMonths = db.prepare(`
    SELECT transaction_month AS month, COUNT(*) AS rows
    FROM transactions GROUP BY transaction_month ORDER BY transaction_month
  `).all();
  const distinct = (column) => db.prepare(`
    SELECT ${column} AS value, COUNT(*) AS rows
    FROM transactions GROUP BY ${column} ORDER BY rows DESC, value
  `).all();
  return {
    databasePath: require('./db').DB_PATH,
    generatedAt: new Date().toISOString(),
    counts: {
      transactions: db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count,
      sourceLinks: db.prepare('SELECT COUNT(*) AS count FROM transaction_sources').get().count,
      sources: db.prepare('SELECT COUNT(*) AS count FROM sources').get().count,
      accounts: db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count,
    },
    months: { transaction: transactionMonths },
    filters: {
      sources: distinct('source_type'),
      owners: distinct('owner_primary'),
      categories: distinct('category_primary'),
      necessities: distinct('necessity'),
      flows: distinct('flow_type'),
    },
  };
}

function getSummary(params) {
  const db = getDb();
  const { sql, values } = buildTransactionWhere(params);
  const select = (expression) => db.prepare(`SELECT COALESCE(${expression}, 0) AS value FROM transactions ${sql}`).get(values).value || 0;
  const latestBalance = db.prepare(`
    SELECT balance, transaction_date AS date, name
    FROM transactions
    WHERE balance IS NOT NULL AND source_type LIKE '%帳戶%'
    ORDER BY transaction_date DESC, CAST(NULLIF(account_original_order, '') AS INTEGER) DESC, id DESC
    LIMIT 1
  `).get();
  const base = db.prepare(`
    SELECT
      COUNT(*) AS rows,
      COALESCE(SUM(inflow), 0) AS inflow,
      COALESCE(SUM(outflow), 0) AS outflow,
      COALESCE(SUM(amount), 0) AS signedTotal
    FROM transactions ${sql}
  `).get(values);
  const metrics = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} THEN outflow ELSE 0 END), 0) AS actualSpend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND owner_primary = '個人' THEN outflow ELSE 0 END), 0) AS personalSpend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND owner_primary IN ('事業', '事業候選') THEN outflow ELSE 0 END), 0) AS businessSpend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND necessity IN ('必要', '事業必要') THEN outflow ELSE 0 END), 0) AS requiredSpend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND necessity = '可節省' THEN outflow ELSE 0 END), 0) AS saveableSpend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND necessity = '可優化' THEN outflow ELSE 0 END), 0) AS optimizableSpend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND (necessity = '需確認' OR owner_primary = '待確認' OR category_primary = '待確認') THEN outflow ELSE 0 END), 0) AS reviewSpend,
      COALESCE(SUM(CASE WHEN source_type LIKE '%信用卡%' AND flow_type = '信用卡消費' THEN outflow ELSE 0 END), 0) AS cardSpend,
      COALESCE(SUM(CASE WHEN source_type LIKE '%帳戶%' AND outflow > 0 THEN outflow ELSE 0 END), 0) AS bankOutflow,
      COALESCE(SUM(CASE WHEN owner_primary = '移轉不算' OR flow_type = '信用卡繳款/移轉' THEN outflow ELSE 0 END), 0) AS transferOutflow
    FROM transactions ${sql}
  `).get(values);
  return {
    ...base, ...metrics,
    moneyLeftAfterSpend: base.inflow - metrics.actualSpend,
    netCashMovement: base.inflow - base.outflow,
    latestBankBalance: latestBalance || null,
    selectedMonth: params.get('month') || null,
    view: params.get('view') || 'all',
    rawOutflow: select('SUM(outflow)'),
  };
}

function getBreakdown(params) {
  const db = getDb();
  const dimension = params.get('dimension') || 'category';
  const column = DIMENSION_MAP[dimension] || DIMENSION_MAP.category;
  const { sql, values } = buildTransactionWhere(params);
  return db.prepare(`
    SELECT
      ${column} AS label,
      COUNT(*) AS rows,
      COALESCE(SUM(inflow), 0) AS inflow,
      COALESCE(SUM(outflow), 0) AS outflow,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} THEN outflow ELSE 0 END), 0) AS spend,
      COALESCE(SUM(amount), 0) AS signedTotal
    FROM transactions ${sql}
    GROUP BY ${column}
    ORDER BY spend DESC, outflow DESC, rows DESC, label
  `).all(values);
}

function getTrend(params) {
  const db = getDb();
  const { sql, values } = buildTransactionWhere(new URLSearchParams([...params].filter(([key]) => key !== 'month')));
  return db.prepare(`
    SELECT
      transaction_month AS month,
      COUNT(*) AS rows,
      COALESCE(SUM(inflow), 0) AS inflow,
      COALESCE(SUM(outflow), 0) AS outflow,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} THEN outflow ELSE 0 END), 0) AS spend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND owner_primary = '個人' THEN outflow ELSE 0 END), 0) AS personalSpend,
      COALESCE(SUM(CASE WHEN ${SPEND_WHERE} AND owner_primary IN ('事業', '事業候選') THEN outflow ELSE 0 END), 0) AS businessSpend
    FROM transactions ${sql}
    GROUP BY transaction_month ORDER BY month
  `).all(values);
}

function getTransactions(params) {
  const db = getDb();
  const sort = ALLOWED_SORT[params.get('sort')] || 't.transaction_date';
  const direction = params.get('direction') === 'desc' ? 'DESC' : 'ASC';
  const limit = safeInt(params.get('limit'), 1000, 2000);
  const offset = safeInt(params.get('offset'), 0);
  const filtered = buildTransactionWhere(params, 't');
  const rows = db.prepare(`
    SELECT
      t.*,
      a.name AS account_name,
      s.description AS source_description,
      (SELECT json_group_array(json_object('type', tags.tag_type, 'name', tags.name, 'color', tags.color))
         FROM transaction_tags JOIN tags ON tags.id = transaction_tags.tag_id
         WHERE transaction_tags.transaction_id = t.id) AS tags_json,
      (SELECT COUNT(*) FROM transaction_sources ts WHERE ts.transaction_id = t.id) AS source_link_count,
      (SELECT COUNT(*) FROM correction_log cl WHERE cl.transaction_id = t.id) AS correction_count
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN sources s ON s.id = t.first_source_id
    ${filtered.sql}
    ORDER BY ${sort} ${direction}, t.id ASC
    LIMIT $limit OFFSET $offset
  `).all({ ...filtered.values, $limit: limit, $offset: offset });
  const total = db.prepare(`SELECT COUNT(*) AS count FROM transactions t ${filtered.sql}`).get(filtered.values).count;
  return {
    total, limit, offset,
    rows: rows.map((row) => ({ ...row, tags: JSON.parse(row.tags_json || '[]'), tags_json: undefined })),
  };
}

function getBalanceHistory() {
  const db = getDb();
  return db.prepare(`
    SELECT month, balance FROM (
      SELECT
        transaction_month AS month, balance,
        ROW_NUMBER() OVER (PARTITION BY transaction_month ORDER BY transaction_date DESC, id DESC) AS rn
      FROM transactions
      WHERE balance IS NOT NULL AND source_type LIKE '%帳戶%'
    ) WHERE rn = 1 ORDER BY month
  `).all();
}

function getReviewQueue(limit = 20) {
  const db = getDb();
  const safeLimit = safeInt(limit, 20, 100);
  const uncertain = db.prepare(`
    SELECT COUNT(*) AS count FROM transactions
    WHERE owner_primary = '待確認' OR category_primary = '待確認' OR necessity = '需確認'
  `).get().count;
  const unreviewed = db.prepare(`
    SELECT COUNT(*) AS count FROM transactions t
    WHERE NOT EXISTS (SELECT 1 FROM correction_log cl WHERE cl.transaction_id = t.id)
  `).get().count;
  const samples = db.prepare(`
    SELECT id, transaction_date, name, owner_primary, category_primary, necessity, amount
    FROM transactions
    WHERE owner_primary = '待確認' OR category_primary = '待確認' OR necessity = '需確認'
    ORDER BY transaction_date DESC LIMIT ?
  `).all(safeLimit);
  return { uncertain_count: uncertain, unreviewed_count: unreviewed, samples };
}

function getSpending(month, category, scope) {
  const db = getDb();
  const where = ['outflow > 0'];
  const params = {};
  if (month) { where.push('transaction_month = $month'); params.$month = month; }
  if (category) { where.push('category_primary = $category'); params.$category = category; }
  if (scope === 'personal') where.push("owner_primary = '個人'");
  else if (scope === 'business') where.push("owner_primary IN ('事業', '事業候選')");
  const sql = `SELECT
    COALESCE(SUM(outflow), 0) AS total,
    COUNT(*) AS count,
    COALESCE(ROUND(AVG(outflow), 0), 0) AS average
  FROM transactions WHERE ${where.join(' AND ')}`;
  return db.prepare(sql).get(params);
}

function getCorrectionLog(transactionId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM correction_log WHERE transaction_id = ? ORDER BY corrected_at DESC, id DESC`).all(transactionId);
}

function logCorrection(db, transactionId, fieldName, oldValue, newValue) {
  db.prepare(`INSERT INTO correction_log (transaction_id, field_name, old_value, new_value) VALUES (?, ?, ?, ?)`)
    .run(transactionId, fieldName, String(oldValue ?? ''), String(newValue ?? ''));
}

function getCorrectionSummary() {
  const db = getDb();
  return db.prepare(`
    SELECT cl.field_name, cl.old_value, cl.new_value, COUNT(*) AS count
    FROM correction_log cl
    GROUP BY cl.field_name, cl.old_value, cl.new_value
    ORDER BY count DESC
  `).all();
}

function getCorrections({ limit = 200, field = '' } = {}) {
  const db = getDb();
  const safeLimit = safeInt(limit, 200, 1000);
  let sql = `SELECT cl.*, t.name AS transaction_name, t.transaction_date
             FROM correction_log cl JOIN transactions t ON t.id = cl.transaction_id`;
  const params = {};
  if (field) { sql += ' WHERE cl.field_name = $field'; params.$field = field; }
  sql += ' ORDER BY cl.corrected_at DESC, cl.id DESC LIMIT $limit';
  params.$limit = safeLimit;
  const rows = db.prepare(sql).all(params);
  const summary = getCorrectionSummary();
  return { rows, summary, total: rows.length };
}

// PATCH /api/transactions/:id — 單筆修正。UPDATE + log 包在同一 transaction（audit P2#7）。
// 回傳 { status, body } 給 route handler 直接用。
function patchTransaction(txnId, body) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
  if (!current) return { status: 404, body: { error: 'Transaction not found' } };

  const updates = [];
  const logEntries = [];
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined && String(body[field]) !== String(current[field] ?? '')) {
      updates.push(`${field} = ?`);
      logEntries.push({ field, oldValue: current[field], newValue: body[field] });
    }
  }
  if (updates.length === 0) return { status: 200, body: { ok: true, message: '無變更', transaction: current } };

  db.exec('BEGIN');
  try {
    const setClause = updates.join(', ');
    const updateValues = logEntries.map((e) => e.newValue);
    db.prepare(`UPDATE transactions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...updateValues, txnId);
    for (const entry of logEntries) logCorrection(db, txnId, entry.field, entry.oldValue, entry.newValue);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
  return { status: 200, body: { ok: true, message: `已更新 ${updates.length} 個欄位`, transaction: updated } };
}

// POST /api/transactions/batch — 批次修正。整批包一個 transaction（audit P2#7）。
function batchCorrection(corrections) {
  const db = getDb();
  const results = { updated: 0, errors: 0, details: [] };
  if (!Array.isArray(corrections) || corrections.length === 0) {
    return { ...results, error: 'corrections array required' };
  }
  // 批次長度上限（audit：防 DoS）
  const MAX_BATCH = 500;
  const work = corrections.slice(0, MAX_BATCH);
  if (corrections.length > MAX_BATCH) results.truncated = true;

  db.exec('BEGIN');
  try {
    for (const item of work) {
      try {
        const current = db.prepare('SELECT * FROM transactions WHERE id = ?').get(item.id);
        if (!current) { results.errors++; results.details.push({ id: item.id, error: 'not found' }); continue; }
        for (const field of EDITABLE_FIELDS) {
          if (item[field] !== undefined && String(item[field]) !== String(current[field] ?? '')) {
            db.prepare(`UPDATE transactions SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(item[field], item.id);
            logCorrection(db, item.id, field, current[field], item[field]);
          }
        }
        results.updated++;
        results.details.push({ id: item.id, status: 'updated' });
      } catch (err) {
        results.errors++;
        results.details.push({ id: item.id, error: err.message });
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return results;
}

module.exports = {
  buildTransactionWhere,
  getMeta,
  getSummary,
  getBreakdown,
  getTrend,
  getTransactions,
  getBalanceHistory,
  getReviewQueue,
  getSpending,
  getCorrectionLog,
  logCorrection,
  getCorrectionSummary,
  getCorrections,
  patchTransaction,
  batchCorrection,
  safeInt,
};
