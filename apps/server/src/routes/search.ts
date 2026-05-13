import { FastifyInstance } from 'fastify';
import { ncmService } from '../services/ncm.service.js';

export function registerSearchRoutes(app: FastifyInstance) {
  app.get('/api/search', async (req) => {
    const { keyword, limit } = req.query as { keyword?: string; limit?: string };
    if (!keyword) return { results: [] };
    const results = await ncmService.search(keyword, parseInt(limit || '10'));
    return { results };
  });
}
