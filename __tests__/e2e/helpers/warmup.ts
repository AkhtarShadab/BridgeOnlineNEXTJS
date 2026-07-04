import { type APIRequestContext } from "@playwright/test";

/**
 * Warmup the Next.js dev server by hitting every route the tests use.
 * First access triggers compilation (10–60s per route).
 * After this returns, all routes respond in <100ms.
 *
 * Call in test.beforeAll() of every test file that needs fast API/UI responses.
 */
export async function warmupServer(request: APIRequestContext) {
    const routes = [
        "/register",
        "/login",
        "/dashboard",
        "/create-room",
        "/join-room",
        "/api/auth/session",
    ];
    for (const route of routes) {
        try {
            await request.get(route, { timeout: 90_000 });
        } catch {
            // Compilation failures are expected — page might redirect,
            // but the compilation still happened.
        }
    }
}
