import { FastifyInstance } from 'fastify';
import { ncmService } from '../services/ncm.service.js';

export function registerStreamRoutes(app: FastifyInstance) {
  // Redirect to NetEase CDN URL — browser handles Range/seek natively
  app.get('/api/stream/:songId', async (req, reply) => {
    const { songId } = req.params as { songId: string };
    const url = await ncmService.getSongUrl(songId);

    if (!url) {
      return reply.status(404).send({ error: 'URL not available' });
    }

    reply.redirect(302, url);
  });
}
