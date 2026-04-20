import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { registerSocketHandlers } from '../lib/socket/register-handlers.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Listen on all network interfaces
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    const io = new SocketIOServer(server, {
        cors: {
            origin: '*', // Allow all origins for local network testing
            methods: ['GET', 'POST'],
        },
    });

    // Make Socket.IO instance globally accessible to Next.js API routes
    // This enables API routes (e.g. /api/rooms/[roomId]/start) to emit events
    global.io = io;

    registerSocketHandlers(io);

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
        console.log(`> Network access: http://192.168.243.113:${port}`);
        console.log(`> Socket.io server running`);
    });
});
