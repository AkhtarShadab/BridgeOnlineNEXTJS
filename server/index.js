import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';

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

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);

        // Join a specific room
        socket.on('room:join', (data) => {
            const { roomId } = data;
            socket.join(`room-${roomId}`);
            console.log(`Socket ${socket.id} joined room-${roomId}`);

            // Broadcast to others in the room (not including sender)
            socket.to(`room-${roomId}`).emit('room:player_joined', {
                socketId: socket.id,
                timestamp: new Date().toISOString(),
            });
        });

        // Leave a room
        socket.on('room:leave', (data) => {
            const { roomId } = data;
            socket.leave(`room-${roomId}`);
            console.log(`Socket ${socket.id} left room-${roomId}`);

            socket.to(`room-${roomId}`).emit('room:player_left', {
                socketId: socket.id,
                timestamp: new Date().toISOString(),
            });
        });

        // Seat selection - broadcast to others (sender already updated their own UI)
        socket.on('room:seat_changed', (data) => {
            const { roomId, userId, seat, username } = data;
            console.log(`Seat changed in room-${roomId}:`, { userId, seat, username });
            socket.to(`room-${roomId}`).emit('room:seat_changed', {
                userId,
                seat,
                username,
                timestamp: new Date().toISOString(),
            });
        });

        // Ready status toggle - broadcast to others
        socket.on('room:ready_toggle', (data) => {
            const { roomId, userId, isReady, username } = data;
            console.log(`Ready toggle in room-${roomId}:`, { userId, isReady, username });
            socket.to(`room-${roomId}`).emit('room:player_ready', {
                userId,
                isReady,
                username,
                timestamp: new Date().toISOString(),
            });
        });

        // Player left event - broadcast to others
        socket.on('room:player_left', (data) => {
            const { roomId, userId, username } = data;
            console.log(`Player left room-${roomId}:`, { userId, username });
            socket.to(`room-${roomId}`).emit('room:player_left', {
                userId,
                username,
                timestamp: new Date().toISOString(),
            });
        });

        // Room settings update
        socket.on('room:settings_updated', (data) => {
            const { roomId, settings } = data;
            io.to(`room-${roomId}`).emit('room:settings_updated', {
                settings,
                timestamp: new Date().toISOString(),
            });
        });

        // Game bidding
        socket.on('game:make_bid', (data) => {
            const { roomId, bid } = data;
            io.to(`room-${roomId}`).emit('game:bid_made', {
                socketId: socket.id,
                bid,
            });
        });

        // Card play
        socket.on('game:play_card', (data) => {
            const { roomId, card } = data;
            io.to(`room-${roomId}`).emit('game:card_played', {
                socketId: socket.id,
                card,
            });
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected:', socket.id);
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
        console.log(`> Network access: http://192.168.243.113:${port}`);
        console.log(`> Socket.io server running`);
    });
});
