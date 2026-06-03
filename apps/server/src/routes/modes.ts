import { FastifyInstance } from 'fastify';
import { stationModesService, type StationMode } from '../services/stationModes.service.js';

const MODES = new Set<StationMode>(['random-infinite', 'focus-cafe', 'focus-library']);

function parseMode(mode: unknown): StationMode {
  if (typeof mode === 'string' && MODES.has(mode as StationMode)) return mode as StationMode;
  throw new Error('Invalid station mode');
}

function parseExcludeSongIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function registerModeRoutes(app: FastifyInstance) {
  app.post('/api/modes/start', async (req, reply) => {
    const body = req.body as { mode?: unknown; excludeSongIds?: unknown };
    try {
      return await stationModesService.start({
        mode: parseMode(body?.mode),
        excludeSongIds: parseExcludeSongIds(body?.excludeSongIds),
      });
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message || 'Mode start failed' });
    }
  });

  app.post('/api/modes/next', async (req, reply) => {
    const body = req.body as { mode?: unknown; cursor?: unknown; excludeSongIds?: unknown };
    try {
      return await stationModesService.next({
        mode: parseMode(body?.mode),
        cursor: typeof body?.cursor === 'string' ? body.cursor : '',
        excludeSongIds: parseExcludeSongIds(body?.excludeSongIds),
      });
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message || 'Mode next failed' });
    }
  });
}
