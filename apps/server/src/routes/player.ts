import { FastifyInstance } from 'fastify';
import { ncmService } from '../services/ncm.service.js';

export function registerPlayerRoutes(app: FastifyInstance) {
  app.get('/api/player/url/:songId', async (req) => {
    const { songId } = req.params as { songId: string };
    const url = await ncmService.getSongUrl(songId);
    return { url: url || '' };
  });

  app.get('/api/player/detail/:songId', async (req, reply) => {
    const { songId } = req.params as { songId: string };
    const detail = await ncmService.getSongDetail(songId);
    if (!detail) return reply.code(404).send({ error: 'song not found' });
    return detail;
  });
}
