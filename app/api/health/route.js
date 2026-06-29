import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/health — 驗證 server 啟動 + node:sqlite 單例可讀到真實資料。
export async function GET() {
  const db = getDb();
  const transactions = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
  const corrections = db.prepare('SELECT COUNT(*) AS c FROM correction_log').get().c;
  return NextResponse.json({ ok: true, transactions, corrections });
}
