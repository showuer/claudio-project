import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { weatherService } from './weather.service.js';
import { playsRepo } from '../db/plays.repo.js';
import { queueRepo } from '../db/queue.repo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DIR = path.join(__dirname, '..', '..', '..', '..', 'user');

function readFileSafe(filePath: string, fallback: string = ''): string {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return fallback; }
}

interface LibrarySong {
  id: string; name: string; artist: string; album: string;
}

export const contextService = {
  getCandidates(count: number = 200): LibrarySong[] {
    try {
      const raw = fs.readFileSync(path.join(USER_DIR, 'library.json'), 'utf-8');
      const all: LibrarySong[] = JSON.parse(raw);
      // Fisher-Yates shuffle, then take first `count`
      const shuffled = [...all];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, count);
    } catch {
      return [];
    }
  },

  async assembleContext(userMessage: string) {
    const taste = readFileSafe(path.join(USER_DIR, 'taste.md'), '# 音乐品味\n- 喜欢各种好听的音乐');
    const routines = readFileSafe(path.join(USER_DIR, 'routines.md'), '# 作息\n- 全天喜欢听歌');

    const weather = await weatherService.getCurrent();
    const weatherStr = weatherService.formatNatural(weather);

    const now = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} ${weekdays[now.getDay()]}`;

    const recentPlays = await playsRepo.getRecent(20);
    const recentStr = recentPlays.map((p) => `- ${p.song_name} - ${p.artist || '未知'}`).join('\n') || '无记录';

    const queue = await queueRepo.getAll();
    const queueStr = queue.map((q) => `${q.song_name} - ${q.artist || ''}`).join(', ') || '空';

    const systemPrompt = readFileSafe(
      path.join(__dirname, '..', 'prompts', 'system.md'),
      '你是一个私人电台 DJ，叫 Claudio。根据天气、时间、用户品味从候选歌曲中选歌并为每首歌写串词。输出 JSON：{"say":"...","play":[{"id":"...","name":"...","artist":"..."}],"segue":"..."}'
    );

    const fullSystem = `${systemPrompt}

## Current playback rule
When recommending songs, write one continuous playlist opening in "say" only. Do not write per-song intros. Return songs as metadata only: id, name, artist. The opening should feel like one connected FM monologue, with each sentence flowing into the next.`
      .replace('{{taste}}', taste)
      .replace('{{routines}}', routines)
      .replace('{{weather}}', weatherStr)
      .replace('{{time}}', timeStr)
      .replace('{{recentPlays}}', recentStr)
      .replace('{{currentQueue}}', queueStr);

    return { systemPrompt: fullSystem, userMessage, weather: weatherStr, time: timeStr };
  },
};
