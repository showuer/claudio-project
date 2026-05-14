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

  app.get('/api/profile/styles', async () => {
    const stats = await playsRepo.getStats();
    const topArtists = stats.topArtists.slice(0, 3).map((a: any) => a.artist);

    let tags: string[] = [];
    try {
      const taste = fs.readFileSync(path.join(USER_DIR, 'taste.md'), 'utf-8');
      const styleMatch = taste.match(/## 风格偏好\n([\s\S]*?)(?=\n##|$)/);
      if (styleMatch) {
        const lines = styleMatch[1].trim().split('\n').filter(l => l.startsWith('-'));
        tags = lines.map(l => l.replace(/^-\s*/, '').split('：')[0].split('、')[0].trim()).filter(Boolean).slice(0, 8);
      }
    } catch { /* use empty tags */ }

    if (tags.length === 0) {
      tags = ['J-ROCK', 'MANDARIN POP', 'HIP-HOP', 'J-POP', 'R&B', 'K-POP'];
    }

    return {
      tags,
      topArtists,
      genresCount: tags.length,
      copy: 'Your private AI DJ. 24/7 radio tuned to your taste.',
    };
  });
}
