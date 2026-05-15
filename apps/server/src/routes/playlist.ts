import { FastifyInstance } from 'fastify';
import { playlistRepo } from '../db/playlist.repo.js';
import { ncmService } from '../services/ncm.service.js';

export function registerPlaylistRoutes(app: FastifyInstance) {
  app.get('/api/playlists', async () => {
    const playlists = await playlistRepo.getAll();
    return { playlists };
  });

  app.post('/api/playlists/sync', async () => {
    const ncmPlaylists = await ncmService.getUserPlaylists();
    const now = new Date().toISOString();
    for (const p of ncmPlaylists) {
      await playlistRepo.upsert({
        id: p.id, name: p.name, cover_url: p.coverUrl || null,
        song_count: p.trackCount, source: 'ncm', synced_at: now,
      });
    }
    return { imported: ncmPlaylists.length, playlists: ncmPlaylists };
  });

  // Get songs from a specific playlist
  app.get('/api/playlist/:id/tracks', async (req) => {
    const { id } = req.params as { id: string };
    const songs = await ncmService.getPlaylistTracks(id, 50);
    return { songs };
  });

  // Daily recommended songs
  app.get('/api/recommend/daily', async () => {
    const songs = await ncmService.getDailyRecommend();
    return { songs };
  });
}
