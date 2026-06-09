import { featureGate } from "@/lib/features.server";
import { NextResponse } from "next/server";

export async function POST() {
  const gate = featureGate("aiHints");
  if (gate) return gate;
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
