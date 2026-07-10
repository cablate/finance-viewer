import { NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/api-helpers';
import { getDb, getSchemaVersion } from '@/lib/db';

// GET /api/health — 驗證 server 啟動 + node:sqlite 單例可讀，並回報 schema 相容版本。
export async function GET() {
  try {
    const db = getDb();
    const transactions = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
    const corrections = db.prepare('SELECT COUNT(*) AS c FROM correction_log').get().c;
    return NextResponse.json({
      ok: true,
      transactions,
      corrections,
      schema_version: getSchemaVersion(db),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeErrorMessage(error, '資料庫健康檢查失敗。') },
      { status: 503 },
    );
  }
}
