import { FastifyInstance } from 'fastify';
import { ncmService } from '../services/ncm.service.js';

export function registerStreamRoutes(app: FastifyInstance) {
  app.get('/api/stream/:songId', async (req, reply) => {
    const { songId } = req.params as { songId: string };
    const url = await ncmService.getSongUrl(songId);

    if (!url) {
      return reply.status(404).send({ error: 'URL not available' });
    }

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error('Fetch failed');
      const buffer = Buffer.from(await resp.arrayBuffer());
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Content-Length', buffer.length);
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(buffer);
    } catch {
      return reply.status(502).send({ error: 'Stream failed' });
    }
  });
}
