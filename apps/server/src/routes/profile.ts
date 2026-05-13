import { FastifyInstance } from 'fastify';
import { playsRepo } from '../db/plays.repo.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DIR = path.join(__dirname, '..', '..', '..', '..', 'user');

export function registerProfileRoutes(app: FastifyInstance) {
  app.get('/api/profile', async () => {
    const stats = await playsRepo.getStats();
    return stats;
  });

  app.get('/api/profile/taste', async () => {
    try {
      const content = fs.readFileSync(path.join(USER_DIR, 'taste.md'), 'utf-8');
      return { content };
    } catch {
      return { content: '# 我的音乐品味\n\n## 喜欢的风格\n- \n\n## 不喜欢的\n- \n' };
    }
  });

  app.put('/api/profile/taste', async (req) => {
    const { content } = req.body as { content: string };
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(path.join(USER_DIR, 'taste.md'), content, 'utf-8');
    return { saved: true };
  });
}
