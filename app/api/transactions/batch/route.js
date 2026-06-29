import { NextResponse } from 'next/server';
import { batchCorrection } from '@/lib/queries';

// POST /api/transactions/batch
// body: { corrections: [...] } 或 { items: [...] }
// batchCorrection 已內建 transaction 與長度上限（MAX_BATCH=500）。
// 回傳 { ok: true, ...results }，results 含 updated / errors / details（可能含 truncated / error）。
export async function POST(request) {
  try {
    const body = await request.json();
    const corrections = body.corrections || body.items || [];
    const results = batchCorrection(corrections);
    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    return NextResponse.json(
      { error: String((err && err.message) || err) },
      { status: 500 }
    );
  }
}
