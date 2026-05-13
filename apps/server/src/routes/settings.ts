import { FastifyInstance } from 'fastify';
import { settingsRepo } from '../db/settings.repo.js';

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    const all = await settingsRepo.getAll();
    const masked = await settingsRepo.getMaskedApiKeys();
    return { ...all, ...masked };
  });

  app.put('/api/settings', async (req) => {
    const { key, value } = req.body as { key: string; value: string };
    await settingsRepo.set(key, value);
    return { updated: true, key };
  });
}
