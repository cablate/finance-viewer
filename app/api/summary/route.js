import { NextResponse } from "next/server";
import { getSummary } from "@/lib/queries";

export async function GET(request) {
  try {
    const params = request.nextUrl.searchParams;
    const data = getSummary(params);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
