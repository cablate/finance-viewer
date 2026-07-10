import { NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/api-helpers';
import { upsertTransactionReportMapping, MappingValidationError } from '@/lib/queries';

// POST /api/reports/mappings — 寫 transaction_report_mappings（PK = transaction_id，INSERT OR REPLACE）。
// body: { transaction_id, report_line, mapping_source?, confidence?, reason?, note? }
//
// 安全守則：
// - report_line 必須 ∈ REPORT_LINE_DEFINITIONS（白名單，校驗在 queries/reports/mappings）
// - transaction_id 須存在（SELECT 驗證）
// - mapping_source 預設 'ai'
// - 不寫金額 / 日期 / 來源欄位
// - 動態欄位名只來自白名單（此 route 不接受任意欄位名）
// - 一律回 JSON {error} envelope
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '請求內容不是有效的 JSON' }, { status: 400 });
    }
    const result = upsertTransactionReportMapping(body || {});
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    if (err instanceof MappingValidationError) {
      const status = err.notFound ? 404 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: safeErrorMessage(err) },
      { status: 500 },
    );
  }
}
