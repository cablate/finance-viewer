import { NextResponse } from 'next/server';
import { getTransactions } from '@/lib/queries';

// GET /api/transactions — 列表查詢（篩選/排序/分頁）。
// searchParams 直接交給 getTransactions，回傳 { total, limit, offset, rows }。
export async function GET(request) {
  try {
    const data = getTransactions(request.nextUrl.searchParams);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: String((err && err.message) || err) },
      { status: 500 }
    );
  }
}
