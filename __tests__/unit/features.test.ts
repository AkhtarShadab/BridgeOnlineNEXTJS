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

  // ── Redis track kill switches (Feature 17/18 prep) ──────────────────────────
  // These are server-only flags (no NEXT_PUBLIC_ twin). Both default false
  // until their features ship. See lib/features.ts for the rationale (no
  // blanket FEATURE_REDIS — capability is detected by isRedisConfigured()).
  it("hotColdState defaults to false (Feature 17 prep)", async () => {
    delete process.env.FEATURE_HOT_COLD_STATE;
    const { features } = await import("@/lib/features");
    expect(features.hotColdState).toBe(false);
  });

  it("hotColdState is true when FEATURE_HOT_COLD_STATE=true", async () => {
    process.env.FEATURE_HOT_COLD_STATE = "true";
    const { features } = await import("@/lib/features");
    expect(features.hotColdState).toBe(true);
    delete process.env.FEATURE_HOT_COLD_STATE;
  });

  it("actionQueue defaults to false (Feature 18 prep)", async () => {
    delete process.env.FEATURE_ACTION_QUEUE;
    const { features } = await import("@/lib/features");
    expect(features.actionQueue).toBe(false);
  });

  it("actionQueue is true when FEATURE_ACTION_QUEUE=true", async () => {
    process.env.FEATURE_ACTION_QUEUE = "true";
    const { features } = await import("@/lib/features");
    expect(features.actionQueue).toBe(true);
    delete process.env.FEATURE_ACTION_QUEUE;
  });
});
