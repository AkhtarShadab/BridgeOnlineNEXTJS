import { NextResponse } from "next/server";
import { isEnabled, type FeatureFlag } from "./features";
export const featureGate = (f: FeatureFlag) =>
  isEnabled(f) ? null : NextResponse.json({ error: "Feature disabled" }, { status: 403 });
