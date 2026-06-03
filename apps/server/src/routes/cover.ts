import type { FastifyInstance } from 'fastify';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function registerCoverRoutes(app: FastifyInstance) {
  app.get('/api/cover-proxy', async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) return reply.code(400).send({ error: 'missing url' });
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reply.code(400).send({ error: 'invalid url' });
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return reply.code(400).send({ error: 'unsupported protocol' });
    }

    const response = await fetch(parsed.toString(), {
      headers: { 'user-agent': 'ClaudioFM/1.0 cover palette proxy' },
    });
    if (!response.ok || !response.body) {
      return reply.code(response.status || 502).send({ error: 'cover fetch failed' });
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return reply.code(415).send({ error: 'not an image' });
    }
    reply
      .header('content-type', contentType)
      .header('cache-control', 'public, max-age=86400')
      .header('access-control-allow-origin', '*');
    return reply.send(response.body);
  });
}

