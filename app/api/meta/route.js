import { NextResponse } from "next/server";
import { getMeta } from "@/lib/queries";

export async function GET() {
  try {
    const data = getMeta();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
