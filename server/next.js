/**
 * Feature 19 — Standalone Next.js entry (web service).
 *
 * Hosts only the Next.js HTTP handler (pages + API routes). No Socket.io, no
 * Game Worker. Broadcasts from API routes are no-ops here in production — the
 * standalone worker (server/worker.js) owns emits via the broadcast emitter.
 *
 * In dev, `server/index.js` (all-in-one) is preferred; this file is for the
 * production split where web/socket/worker run as separate deployable units.
 *
 *   node server/next.js   (or: npm run start:web)
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT_WEB ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    // The web process does NOT own a Socket.io server. API routes that check
    // global.io will see null/undefined; in the split topology, broadcasts are
    // the worker's job (via lib/socket/emitter.ts). Setting it to null makes
    // the intent explicit and silences any accidental emit.
    global.io = null;

    server.listen(port, () => {
        console.log(`[web] Next.js ready on http://localhost:${port}`);
    });

    process.on('SIGTERM', () => {
        console.log('[web] SIGTERM received, shutting down...');
        server.close(() => process.exit(0));
    });
});
