import { NextResponse } from "next/server";
import { getBalanceHistory } from "@/lib/queries";

export async function GET() {
  try {
    const data = getBalanceHistory();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
