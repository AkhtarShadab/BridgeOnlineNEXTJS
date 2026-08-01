/**
 * Playwright config for **Mode-2** e2e: the BullMQ action queue (#15/#18) and
 * the hot/cold game-state split (#14) runtime paths.
 *
 * Differences from the default `playwright.config.ts` (Mode-1):
 *   - `FEATURE_ACTION_QUEUE=true`  → bid/play routes ENQUEUE to BullMQ instead
 *     of processing inline; the all-in-one dev server (server/index.js) starts
 *     the Game Worker in-process.
 *   - `FEATURE_HOT_COLD_STATE=true` → `getGameStateStore()` selects
 *     `RedisGameStateStore` (hot copy in Redis, Postgres snapshot only on
 *     phase transitions, evicted on COMPLETED).
 *   - `FEATURE_RECONNECT_GRACE=true` → exercises the Redis TTL reconnect path
 *     (#16) too, since e2e runs with REDIS_URL set.
 *   - Runs on port 3010 so it does NOT clash with a Mode-1 dev server on 3000.
 *   - `reuseExistingServer: false` always — the flags are read at server boot,
 *     so we MUST start a fresh server with these flags even if a Mode-1 server
 *     is already up on 3000.
 *
 * Run with:
 *   npx playwright test --config playwright.queue.config.ts queue.spec.ts
 * (Requires the test Postgres + Redis from docker-compose.test.yml — the
 * shared global-setup brings them up.)
 */
import { defineConfig, devices } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.test' });

const PORT = 3010;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
    testDir: './__tests__/e2e',
    // Reuse the same database/redis bring-up as Mode-1.
    globalSetup: './__tests__/e2e/global-setup.ts',
    fullyParallel: false,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/queue-report' }]],
    use: {
        baseURL: BASE,
        trace: 'on-first-retry',
        video: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: BASE,
        // Always start fresh: flags are read at boot, so a reused Mode-1
        // server would NOT have the queue/hot-cold paths enabled.
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            NODE_ENV: process.env.NODE_ENV === 'production' ? 'development' : (process.env.NODE_ENV ?? 'development'),
            PORT: String(PORT),
            DATABASE_URL: process.env.DATABASE_URL ?? '',
            DIRECT_URL: process.env.DIRECT_URL ?? '',
            NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? '',
            NEXTAUTH_URL: BASE,
            NEXT_PUBLIC_SOCKET_URL: BASE,
            // Redis (test container on 6380) — capability gate for 16/17/18.
            REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6380',
            // ── Mode-2 kill switches ON ────────────────────────────────────
            FEATURE_ACTION_QUEUE: 'true',
            FEATURE_HOT_COLD_STATE: 'true',
            FEATURE_RECONNECT_GRACE: 'true',
            NEXT_PUBLIC_FEATURE_RECONNECT_GRACE: 'true',
            // ── UI flags (so the modern table renders for UI touch points) ─
            NEXT_PUBLIC_FEATURE_NEW_UI: 'true',
            FEATURE_VOICE_CHAT: 'false',
            NEXT_PUBLIC_FEATURE_VOICE_CHAT: 'false',
            NEXT_PUBLIC_DISABLE_VOICE: 'true',
            // Hints on for completeness (backend stub; queue.spec doesn't depend on it).
            FEATURE_AI_HINTS: 'true',
            NEXT_PUBLIC_FEATURE_AI_HINTS: 'true',
        },
    },
    timeout: 180_000,
});