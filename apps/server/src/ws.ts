import { FastifyInstance } from 'fastify';
import { queueRepo } from './db/queue.repo.js';

const MAX_CLIENTS = 50;
const clients = new Set<{ send: (data: string) => void }>();

export function getClientCount(): number {
  return clients.size;
}

export function broadcast(event: object) {
  const data = JSON.stringify(event);
  const deadClients: Set<{ send: (data: string) => void }> = new Set();
  for (const client of clients) {
    try { client.send(data); } catch { deadClients.add(client); }
  }
  for (const dead of deadClients) {
    clients.delete(dead);
  }
}

export function registerWebSocket(app: FastifyInstance) {
  app.register(async (app) => {
    app.get('/ws', { websocket: true }, (socket, req) => {
      if (clients.size >= MAX_CLIENTS) {
        socket.close(1013, 'Too many connections');
        return;
      }
      const client = { send: (data: string) => socket.send(data) };
      clients.add(client);

      // Send current state
      queueRepo.getAll().then((queue) => {
        socket.send(JSON.stringify({
          type: 'now_playing',
          data: { song: queue[0] || null, queue: queue.slice(1), isPlaying: queue.length > 0, progressMs: 0 },
        }));
      });

      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
          }
          if (msg.type === 'seek') {
            socket.send(JSON.stringify({ type: 'player_state', isPlaying: true, progressMs: msg.positionMs }));
          }
        } catch { /* ignore */ }
      });

      socket.on('close', () => { clients.delete(client); });
    });
  });
}
