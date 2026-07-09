import { NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/api-helpers";
import { getIncomeStatement } from "@/lib/queries";

export async function GET(request) {
  try {
    const data = getIncomeStatement(request.nextUrl.searchParams);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err) },
      { status: 500 },
    );
  }
}
