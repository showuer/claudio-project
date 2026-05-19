import { FastifyInstance } from 'fastify';
import { playsRepo } from '../db/plays.repo.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DIR = path.join(__dirname, '..', '..', '..', '..', 'user');

export function registerProfileRoutes(app: FastifyInstance) {
  // Record a play when a song starts
  app.post('/api/plays', async (req) => {
    const { songId, songName, artist } = req.body as { songId: string; songName: string; artist?: string };
    if (!songId || !songName) return { ok: false };
    await playsRepo.insert({ song_id: songId, song_name: songName, artist });
    return { ok: true };
  });

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
    let copy = 'Your private AI DJ. 24/7 radio tuned to your taste.';
    try {
      const taste = fs.readFileSync(path.join(USER_DIR, 'taste.md'), 'utf-8');
      const styleMatch = taste.match(/## 风格偏好\n([\s\S]*?)(?=\n##|$)/);
      if (styleMatch) {
        const lines = styleMatch[1].trim().split('\n').filter(l => l.startsWith('-'));
        tags = lines.map(l => l.replace(/^-\s*/, '').split('：')[0].split('、')[0].trim()).filter(Boolean).slice(0, 8);
      }
      // Extract personal description (first paragraph after title)
      const descMatch = taste.match(/^# .+\n\n([\s\S]*?)(?=\n##|$)/);
      if (descMatch) {
        copy = descMatch[1].trim().split('\n')[0] || copy;
      }
    } catch { /* use defaults */ }

    if (tags.length === 0) {
      tags = ['J-ROCK', 'MANDARIN POP', 'HIP-HOP', 'J-POP', 'R&B', 'K-POP'];
    }

    // Get latest mood
    let mood = '';
    try {
      mood = fs.readFileSync(path.join(USER_DIR, 'mood.md'), 'utf-8').trim();
    } catch { /* no mood yet */ }

    // Get random philosophy quote from taste.md
    let philosophy = '';
    try {
      const tasteContent = fs.readFileSync(path.join(USER_DIR, 'taste.md'), 'utf-8');
      const phMatch = tasteContent.match(/## 生活哲思\n([\s\S]*?)(?=\n##|$)/);
      if (phMatch) {
        const lines = phMatch[1].trim().split('\n').filter((l: string) => l.startsWith('-'));
        const quotes = lines.map((l: string) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
        philosophy = quotes[Math.floor(Math.random() * quotes.length)] || '';
      }
    } catch { /* ignore */ }

    return {
      tags, topArtists, genresCount: tags.length, copy, mood, philosophy,
      totalHours: stats.totalHours || 0,
      totalPlays: stats.totalPlays || 0,
    };
  });

  // Save style tags (updates taste.md)
  app.put('/api/profile/styles', async (req) => {
    const { tags } = req.body as { tags: string[] };
    if (!Array.isArray(tags)) return { saved: false, error: 'tags must be an array' };

    const clean = tags.map(t => String(t).trim().toUpperCase()).filter(Boolean).slice(0, 12);
    try {
      let taste = '';
      try { taste = fs.readFileSync(path.join(USER_DIR, 'taste.md'), 'utf-8'); } catch { /* create */ }
      // Replace or add 风格偏好 section
      const newSection = '## 风格偏好\n- ' + clean.join('\n- ');
      if (taste.includes('## 风格偏好')) {
        taste = taste.replace(/## 风格偏好\n[\s\S]*?(?=\n##|$)/, newSection);
      } else {
        taste = taste.trimEnd() + '\n\n' + newSection + '\n';
      }
      fs.writeFileSync(path.join(USER_DIR, 'taste.md'), taste, 'utf-8');
      return { saved: true, tags: clean };
    } catch (err: any) {
      return { saved: false, error: err.message };
    }
  });

  // Recently liked songs
  app.get('/api/profile/liked', async () => {
    try {
      const data = fs.readFileSync(path.join(USER_DIR, 'liked.json'), 'utf-8');
      return { songs: JSON.parse(data) };
    } catch {
      return { songs: [] };
    }
  });

  app.post('/api/profile/liked', async (req) => {
    const { songId, songName, artist } = req.body as { songId: string; songName: string; artist: string };
    if (!songId || !songName) return { saved: false };
    try {
      let songs: any[] = [];
      try { songs = JSON.parse(fs.readFileSync(path.join(USER_DIR, 'liked.json'), 'utf-8')); } catch { /* new */ }
      const exists = songs.findIndex((s: any) => s.id === songId);
      if (exists >= 0) {
        songs.splice(exists, 1); // Unlike — remove
      } else {
        songs.unshift({ id: songId, name: songName, artist: artist || '', likedAt: new Date().toISOString() });
      }
      songs = songs.slice(0, 50); // Keep last 50
      fs.mkdirSync(USER_DIR, { recursive: true });
      fs.writeFileSync(path.join(USER_DIR, 'liked.json'), JSON.stringify(songs, null, 2), 'utf-8');
      return { saved: true, liked: exists < 0, songs };
    } catch (err: any) {
      return { saved: false, error: err.message };
    }
  });

  // Mood memory
  app.get('/api/profile/mood', async () => {
    try {
      const mood = fs.readFileSync(path.join(USER_DIR, 'mood.md'), 'utf-8').trim();
      return { mood };
    } catch {
      return { mood: '' };
    }
  });

  app.put('/api/profile/mood', async (req) => {
    const { mood } = req.body as { mood: string };
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(path.join(USER_DIR, 'mood.md'), String(mood || '').trim(), 'utf-8');
    return { saved: true };
  });
}
