import { NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/api-helpers';
import { createReportMappingRule, MappingValidationError } from '@/lib/queries';

// POST /api/reports/mapping-rules — 寫 report_mapping_rules（新增比對規則 → 報表列）。
// body: { match_key?, source_type?, direction?, report_line, confidence?, reason?, note?, enabled? }
//
// 至少需指定一個比對條件（match_key / source_type / direction），report_line 為必填白名單值。
// 安全守則：
// - report_line 必須 ∈ REPORT_LINE_DEFINITIONS（白名單，校驗在 queries/reports/mappings）
// - direction 只允許 'in' / 'out' / null
// - 不寫金額 / 日期 / 來源
// - 動態欄位名不接受使用者輸入
// - 一律回 JSON {error} envelope
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '請求內容不是有效的 JSON' }, { status: 400 });
    }
    const result = createReportMappingRule(body || {});
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof MappingValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json(
      { error: safeErrorMessage(err) },
      { status: 500 },
    );
  }
}
