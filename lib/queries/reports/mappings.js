// 寫入型報表映射查詢：transaction_report_mappings（逐筆）+ report_mapping_rules（比對規則）。
// 對應 WP1 兩支 route（app/api/reports/mappings、app/api/reports/mapping-rules）的查詢層。
// 路由只負責 JSON 解析與 envelope；校驗與寫入在此（CJS，可直接被 test 與 route 共用）。
//
// 安全守則（與紅線一致）：
// - report_line 必須 ∈ REPORT_LINE_DEFINITIONS（白名單，來自 lib/reporting/report-lines.js）
// - 動態欄位名不接受使用者輸入（SQL 欄位全為靜態字串）
// - 不寫金額 / 日期 / 來源欄位
// - 錯誤丟 Error（含可辨識訊息），由 route 轉成 {error} + 4xx
const { getDb, clamp } = require('../core');
const { isKnownReportLine } = require('../../reporting/report-lines');

// 校驗失敗專用錯誤（route 依 message 判 4xx）。
class MappingValidationError extends Error {}

// upsertTransactionReportMapping：寫 transaction_report_mappings（PK = transaction_id）。
// 回傳 { transaction_id, report_line }。
function upsertTransactionReportMapping(data, db = getDb()) {
  const body = data || {};

  // transaction_id：必填、正整數
  const transactionId = Number(body.transaction_id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    throw new MappingValidationError('transaction_id 必須是正整數');
  }

  // report_line：必填、白名單
  const reportLine = body.report_line && String(body.report_line).trim()
    ? String(body.report_line).trim()
    : null;
  if (!reportLine) {
    throw new MappingValidationError('report_line 為必填');
  }
  if (!isKnownReportLine(reportLine)) {
    throw new MappingValidationError(`report_line 不在白名單中：${reportLine}`);
  }

  // mapping_source：預設 'ai'
  const mappingSource = body.mapping_source && String(body.mapping_source).trim()
    ? String(body.mapping_source).trim()
    : 'ai';

  // confidence：可選 0~1
  let confidence = null;
  if (body.confidence !== undefined && body.confidence !== null && body.confidence !== '') {
    const c = Number(body.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 1) {
      throw new MappingValidationError('confidence 必須是 0~1 之間的數值');
    }
    confidence = c;
  }

  // reason / note：note 附加到 reason（transaction_report_mappings 無 note 欄位）
  const reason = body.reason != null ? String(body.reason) : null;
  const note = body.note != null ? String(body.note) : null;
  const finalReason = note ? (reason ? `${reason}\n${note}` : note) : reason;

  // transaction_id 存在驗證
  const txn = db.prepare('SELECT id FROM transactions WHERE id = ?').get(transactionId);
  if (!txn) {
    const err = new MappingValidationError(`transaction_id 不存在：${transactionId}`);
    err.notFound = true;
    throw err;
  }

  db.prepare(`
    INSERT OR REPLACE INTO transaction_report_mappings
      (transaction_id, report_line, mapping_source, confidence, reason)
    VALUES ($tid, $line, $src, $conf, $reason)
  `).run({
    $tid: transactionId,
    $line: reportLine,
    $src: mappingSource,
    $conf: confidence,
    $reason: finalReason,
  });

  return { transaction_id: transactionId, report_line: reportLine };
}

// createReportMappingRule：寫 report_mapping_rules（新增）。回傳 { id }。
function createReportMappingRule(data, db = getDb()) {
  const body = data || {};

  // report_line：必填、白名單
  const reportLine = body.report_line && String(body.report_line).trim()
    ? String(body.report_line).trim()
    : null;
  if (!reportLine) {
    throw new MappingValidationError('report_line 為必填');
  }
  if (!isKnownReportLine(reportLine)) {
    throw new MappingValidationError(`report_line 不在白名單中：${reportLine}`);
  }

  // 比對條件
  const matchKey = body.match_key && String(body.match_key).trim()
    ? String(body.match_key).trim()
    : null;
  const sourceType = body.source_type && String(body.source_type).trim()
    ? String(body.source_type).trim()
    : null;
  let direction = null;
  if (body.direction !== undefined && body.direction !== null && body.direction !== '') {
    const d = String(body.direction).trim();
    if (!['in', 'out'].includes(d)) {
      throw new MappingValidationError("direction 只允許 'in' 或 'out'");
    }
    direction = d;
  }

  // 至少需一個比對條件
  if (matchKey === null && sourceType === null && direction === null) {
    throw new MappingValidationError('規則至少需指定一個比對條件（match_key / source_type / direction）');
  }

  // confidence：預設 0，0~1
  let confidence = 0;
  if (body.confidence !== undefined && body.confidence !== null && body.confidence !== '') {
    const c = Number(body.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 1) {
      throw new MappingValidationError('confidence 必須是 0~1 之間的數值');
    }
    confidence = c;
  }

  // enabled：預設 true
  const enabled = (body.enabled === false || body.enabled === 0 || body.enabled === '0')
    ? 0
    : 1;

  // reason / note → note 欄位
  const reason = body.reason != null ? String(body.reason) : null;
  const note = body.note != null ? String(body.note) : null;
  const finalNote = note ? (reason ? `${reason}\n${note}` : note) : reason;

  const result = db.prepare(`
    INSERT INTO report_mapping_rules
      (match_key, source_type, direction, report_line, confidence, enabled, note)
    VALUES ($mk, $st, $dir, $line, $conf, $enabled, $note)
  `).run({
    $mk: matchKey,
    $st: sourceType,
    $dir: direction,
    $line: reportLine,
    $conf: confidence,
    $enabled: enabled,
    $note: finalNote,
  });

  return { id: Number(result.lastInsertRowid) };
}

module.exports = {
  MappingValidationError,
  upsertTransactionReportMapping,
  createReportMappingRule,
};
