/**
 * Registers all Socket.io event handlers on the given io instance.
 * Extracted from server/index.js so it can be imported by integration tests.
 */
export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('room:join', ({ roomId }) => {
      socket.join(`room-${roomId}`);
      socket.to(`room-${roomId}`).emit('room:player_joined', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('room:leave', ({ roomId }) => {
      socket.leave(`room-${roomId}`);
      socket.to(`room-${roomId}`).emit('room:player_left', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('room:seat_changed', ({ roomId, userId, seat, username }) => {
      socket.to(`room-${roomId}`).emit('room:seat_changed', {
        userId,
        seat,
        username,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('room:ready_toggle', ({ roomId, userId, isReady, username }) => {
      socket.to(`room-${roomId}`).emit('room:player_ready', {
        userId,
        isReady,
        username,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('room:player_left', ({ roomId, userId, username }) => {
      socket.to(`room-${roomId}`).emit('room:player_left', {
        userId,
        username,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('room:settings_updated', ({ roomId, settings }) => {
      io.to(`room-${roomId}`).emit('room:settings_updated', {
        settings,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('game:join', ({ gameId, roomId }) => {
      if (gameId) socket.join(`game-${gameId}`);
      if (roomId) socket.join(`room-${roomId}`);
    });

    socket.on('game:make_bid', ({ roomId, bid }) => {
      io.to(`room-${roomId}`).emit('game:bid_made', {
        socketId: socket.id,
        bid,
      });
    });

    socket.on('game:play_card', ({ roomId, card }) => {
      io.to(`room-${roomId}`).emit('game:card_played', {
        socketId: socket.id,
        card,
      });
    });

    socket.on('voice:offer', (data) => {
      socket.to(`room-${data.roomId}`).emit('voice:offer', data);
    });

    socket.on('voice:answer', (data) => {
      socket.to(`room-${data.roomId}`).emit('voice:answer', data);
    });

    socket.on('voice:ice_candidate', (data) => {
      socket.to(`room-${data.roomId}`).emit('voice:ice_candidate', data);
    });

    socket.on('voice:toggle_mute', (data) => {
      socket.to(`room-${data.roomId}`).emit('voice:user_muted', data);
    });

    socket.on('voice:speaking', (data) => {
      socket.to(`room-${data.roomId}`).emit('voice:speaking', data);
    });

    socket.on('voice:leave', (data) => {
      socket.to(`room-${data.roomId}`).emit('voice:user_left', data);
    });
  });
}
