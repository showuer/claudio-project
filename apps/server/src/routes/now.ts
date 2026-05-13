import { FastifyInstance } from 'fastify';
import { queueRepo } from '../db/queue.repo.js';

export function registerNowRoutes(app: FastifyInstance) {
  app.get('/api/now', async () => {
    const queue = await queueRepo.getAll();
    return {
      nowPlaying: queue[0] || null,
      queue: queue.slice(1),
      isPlaying: queue.length > 0,
      progressMs: 0,
    };
  });
}
