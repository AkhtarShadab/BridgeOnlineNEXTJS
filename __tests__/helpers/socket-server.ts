import { createServer, type Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
// @ts-ignore – JS module, no types needed
import { registerSocketHandlers } from '@/lib/socket/register-handlers.js';

export interface TestSocketServer {
  io: SocketIOServer;
  httpServer: HTTPServer;
  url: string;
  close(): Promise<void>;
}

export function createTestServer(): Promise<TestSocketServer> {
  return new Promise((resolve) => {
    const httpServer = createServer();
    const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

    registerSocketHandlers(io);

    httpServer.listen(0, () => {
      const addr = httpServer.address() as { port: number };
      resolve({
        io,
        httpServer,
        url: `http://localhost:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            io.close();
            httpServer.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

export function connectClient(url: string): ClientSocket {
  return ioc(url, { transports: ['websocket'], autoConnect: true });
}

export function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeout = 3000
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Already in the target state (e.g. already connected)
    if (event === 'connect' && socket.connected) {
      resolve(undefined as T);
      return;
    }
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}" on socket ${socket.id ?? '(pending)'}`)),
      timeout
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

export function disconnectAll(...sockets: ClientSocket[]) {
  sockets.forEach((s) => s.disconnect());
}
