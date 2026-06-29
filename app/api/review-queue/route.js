import { NextResponse } from 'next/server';
import { getReviewQueue } from '@/lib/queries';

export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = searchParams.get('limit');
    const data = getReviewQueue(limit);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
