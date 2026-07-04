import { test } from "@playwright/test";
import { warmupServer } from "./helpers/warmup";

/**
 * This spec MUST run first (alphabetically before all others).
 * It triggers Next.js compilation on every route the test suite uses,
 * so subsequent tests get <100ms responses instead of 10-60s cold starts.
 */
test.describe("Server warmup", () => {
    test("compile all routes", async ({ request }) => {
        test.setTimeout(600_000); // 10 min — first compilation can be slow
        await warmupServer(request);
    });
});
