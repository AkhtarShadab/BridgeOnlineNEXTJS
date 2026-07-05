// Server-only flags read FEATURE_*; client-visible flags also need a NEXT_PUBLIC_ twin,
// because Next.js only bundles NEXT_PUBLIC_* into the browser.
const on = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : v === "true";

export const features = {
  // voice UI is rendered in client components → read the public twin in the browser
  voiceChat: on(process.env.NEXT_PUBLIC_FEATURE_VOICE_CHAT ?? process.env.FEATURE_VOICE_CHAT, true),
  // hint UI is rendered in a client component → read the public twin in the browser
  aiHints:   on(process.env.NEXT_PUBLIC_FEATURE_AI_HINTS ?? process.env.FEATURE_AI_HINTS, false), // Feature 02/12
  newUI:     on(process.env.NEXT_PUBLIC_FEATURE_NEW_UI ?? process.env.FEATURE_NEW_UI, false), // Feature 01
  reconnectGrace: on(process.env.NEXT_PUBLIC_FEATURE_RECONNECT_GRACE ?? process.env.FEATURE_RECONNECT_GRACE, false), // Feature 08
  // ── Redis track kill switches (server-only; no NEXT_PUBLIC_ twin) ────────
  // These are per-feature kill switches with fallbacks, NOT a blanket
  // FEATURE_REDIS. The Redis *capability* is detected by isRedisConfigured()
  // in lib/redis.ts (one knob, can't lie). These flags only select whether the
  // Feature 17/18 code paths are *used* once Redis is available — so ops can
  // flip them off to fall back to the Postgres-only / inline paths if a Redis
  // feature misbehaves, without unsetting REDIS_URL (which would also kill the
  // Socket.io adapter from Feature 16, which has no flag by design).
  // Both default false until 17/18 ship.
  hotColdState: on(process.env.FEATURE_HOT_COLD_STATE, false),  // Feature 17: RedisGameStateStore vs PostgresGameStateStore
  actionQueue:  on(process.env.FEATURE_ACTION_QUEUE, false),   // Feature 18: BullMQ queue vs inline API-route processing
} as const;

export type FeatureFlag = keyof typeof features;
export const isEnabled = (f: FeatureFlag) => features[f];
