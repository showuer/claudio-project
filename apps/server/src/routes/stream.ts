import { FastifyInstance } from 'fastify';
import { OutgoingHttpHeaders } from 'node:http';
import { ncmService } from '../services/ncm.service.js';

let activeStreams = 0;

export function getActiveStreamCount(): number {
  return activeStreams;
}

export function registerStreamRoutes(app: FastifyInstance) {
  app.get('/api/stream/:songId', async (req, reply) => {
    const { songId } = req.params as { songId: string };
    const url = await ncmService.getSongUrl(songId);

    if (!url) {
      return reply.status(404).send({ error: 'URL not available' });
    }

    try {
      const headers: Record<string, string> = {};
      const range = req.headers.range;
      if (range) headers.Range = range;

      const resp = await fetch(url, { headers });

      if (!resp.ok || !resp.body) {
        return reply.status(502).send({ error: 'Stream fetch failed' });
      }

      const status = resp.status;
      const ct = resp.headers.get('content-type') || 'audio/mpeg';
      const cl = resp.headers.get('content-length');
      const cr = resp.headers.get('content-range');
      const acr = resp.headers.get('accept-ranges');

      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'private, max-age=120');
      reply.header('Content-Type', ct);
      reply.header('Accept-Ranges', acr || 'bytes');
      if (cl) reply.header('Content-Length', cl);
      if (cr) reply.header('Content-Range', cr);

      // Stream the response body
      const reader = resp.body.getReader();
      reply.hijack();
      reply.raw.writeHead(status, reply.getHeaders() as OutgoingHttpHeaders);
      activeStreams++;
      reply.raw.on('close', () => { activeStreams = Math.max(0, activeStreams - 1); });

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { reply.raw.end(); break; }
            reply.raw.write(value);
          }
        } catch { reply.raw.destroy(); }
      };
      pump().catch(() => { /* connection torn down */ });
    } catch {
      return reply.status(502).send({ error: 'Stream failed' });
    }
  });
}
