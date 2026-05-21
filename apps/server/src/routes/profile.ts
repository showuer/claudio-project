import { FastifyInstance } from 'fastify';
import { playsRepo } from '../db/plays.repo.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryService } from '../services/memory.service.js';

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

  app.get('/api/profile/memory', async () => {
    return memoryService.getEditableProfile();
  });

  app.put('/api/profile/memory', async (req) => {
    const { content } = req.body as { content: string };
    return memoryService.saveEditableProfile(String(content || ''));
  });

  app.get('/api/profile/memory/summary', async () => {
    const summary = await memoryService.getSummary();
    return { ...summary, genresCount: summary.tags.length };
  });

  app.get('/api/profile/taste', async () => {
    return memoryService.getEditableProfile();
  });

  app.put('/api/profile/taste', async (req) => {
    const { content } = req.body as { content: string };
    return memoryService.saveEditableProfile(String(content || ''));
  });

  app.get('/api/profile/styles', async () => {
    const summary = await memoryService.getSummary();
    return { ...summary, genresCount: summary.tags.length };
  });

  // Save style tags while keeping memory.profile.md canonical.
  app.put('/api/profile/styles', async (req) => {
    const { tags } = req.body as { tags: string[] };
    if (!Array.isArray(tags)) return { saved: false, error: 'tags must be an array' };
    return memoryService.updateStyleTags(tags);
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
    const summary = await memoryService.getSummary();
    return { mood: summary.mood };
  });

  app.put('/api/profile/mood', async (req) => {
    const { mood } = req.body as { mood: string };
    return memoryService.updateMood(String(mood || ''));
  });
}
