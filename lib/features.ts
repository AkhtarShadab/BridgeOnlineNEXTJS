// Server-only flags read FEATURE_*; client-visible flags also need a NEXT_PUBLIC_ twin,
// because Next.js only bundles NEXT_PUBLIC_* into the browser.
const on = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : v === "true";

export const features = {
  // voice UI is rendered in client components → read the public twin in the browser
  voiceChat: on(process.env.NEXT_PUBLIC_FEATURE_VOICE_CHAT ?? process.env.FEATURE_VOICE_CHAT, true),
  aiHints:   on(process.env.FEATURE_AI_HINTS, false),   // server-side route gate (Feature 02)
  newUI:     on(process.env.NEXT_PUBLIC_FEATURE_NEW_UI ?? process.env.FEATURE_NEW_UI, false), // Feature 01
} as const;

export type FeatureFlag = keyof typeof features;
export const isEnabled = (f: FeatureFlag) => features[f];
