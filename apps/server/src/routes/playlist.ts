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
}
