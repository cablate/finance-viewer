import { NextResponse } from "next/server";
import { getTrend } from "@/lib/queries";

export async function GET(request) {
  try {
    const params = request.nextUrl.searchParams;
    const data = getTrend(params);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
