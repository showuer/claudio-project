import { FastifyInstance } from 'fastify';
import { searchService } from '../services/search.service.js';

export function registerSearchRoutes(app: FastifyInstance) {
  app.get('/api/search', async (req) => {
    const { keyword, q, limit } = req.query as { keyword?: string; q?: string; limit?: string };
    const query = keyword || q || '';
    if (!query) return { results: [] };
    const result = await searchService.searchPlayable(query, parseInt(limit || '10'));
    return { results: result.songs, keyword: result.keyword, source: result.source };
  });
}
