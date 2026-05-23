import { FastifyInstance } from 'fastify';
import { settingsRepo } from '../db/settings.repo.js';

const ALLOWED_SETTING_KEYS = [
  'theme', 'accentColor', 'stationName', 'ttsProvider', 'aiModel',
];

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    const all = await settingsRepo.getAll();
    const masked = await settingsRepo.getMaskedApiKeys();
    return { ...all, ...masked };
  });

  app.put('/api/settings', async (req, reply) => {
    const body = req.body as { key?: string; value?: string } | null;
    const key = body?.key;
    const value = body?.value;
    if (!key || !ALLOWED_SETTING_KEYS.includes(key)) {
      return reply.status(400).send({ error: `Invalid or restricted key: ${key}` });
    }
    if (typeof value !== 'string' || value.length > 500) {
      return reply.status(400).send({ error: 'Invalid value' });
    }
    await settingsRepo.set(key, value);
    return { updated: true, key };
  });
}
