import { FastifyInstance } from 'fastify';
import { queueRepo } from './db/queue.repo.js';

const clients = new Set<{ send: (data: string) => void }>();

export function broadcast(event: object) {
  const data = JSON.stringify(event);
  for (const client of clients) {
    try { client.send(data); } catch { clients.delete(client); }
  }
}

export function registerWebSocket(app: FastifyInstance) {
  app.register(async (app) => {
    app.get('/ws', { websocket: true }, (socket) => {
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
