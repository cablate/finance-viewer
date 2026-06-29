import { NextResponse } from "next/server";
import { getBreakdown } from "@/lib/queries";

export async function GET(request) {
  try {
    const params = request.nextUrl.searchParams;
    const data = getBreakdown(params);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
