import { describe, it, expect, beforeEach } from "vitest";

describe("feature flags", () => {
  beforeEach(() => {
    // reset module between tests so env changes apply
    vi.resetModules();
  });

  it("voiceChat defaults to true when env is unset", async () => {
    delete process.env.FEATURE_VOICE_CHAT;
    delete process.env.NEXT_PUBLIC_FEATURE_VOICE_CHAT;
    const { features } = await import("@/lib/features");
    expect(features.voiceChat).toBe(true);
  });

  it("voiceChat is false when NEXT_PUBLIC_FEATURE_VOICE_CHAT=false", async () => {
    process.env.NEXT_PUBLIC_FEATURE_VOICE_CHAT = "false";
    const { features } = await import("@/lib/features");
    expect(features.voiceChat).toBe(false);
  });

  it("aiHints defaults to false", async () => {
    delete process.env.FEATURE_AI_HINTS;
    const { features } = await import("@/lib/features");
    expect(features.aiHints).toBe(false);
  });
});
