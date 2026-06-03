import { FastifyInstance } from 'fastify';
import { contextService } from '../services/context.service.js';
import { deepseekService } from '../services/deepseek.service.js';
import { messagesRepo } from '../db/messages.repo.js';
import { ncmService } from '../services/ncm.service.js';
import { ttsService } from '../services/tts.service.js';
import { searchService } from '../services/search.service.js';
import { memoryService } from '../services/memory.service.js';
import { formatTemporalMusicGuidance, getTemporalSearchTerms } from '../services/temporalMusic.service.js';

const AIDJ_TRACK_COUNT = 10;

/**
 * SQLite datetime('now') returns UTC without timezone indicator:
 *   "2026-05-22 02:19:56"  (UTC, but no Z → new Date() treats as LOCAL!)
 * JS new Date().toISOString() returns:
 *   "2026-05-22T02:19:56.000Z" (UTC with Z → correct)
 *
 * ALL stored timestamps are UTC. The only correct ISO representation
 * for UTC is WITH the Z suffix. Without Z, new Date() interprets as
 * local time (ES2015 §20.3.1.15), creating a UTC-offset error.
 */
function normalizeTimestamp(raw: string): string {
  if (!raw) return new Date().toISOString();
  // Normalise SQLite space-separated format to T-separated
  let iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  // Pad seconds if missing (unlikely but defensive)
  if (iso.split(':').length === 2) iso += ':00';
  // ALL timestamps are UTC — ensure Z suffix so new Date() parses correctly
  if (!iso.endsWith('Z')) iso += 'Z';
  return iso;
}

/** One-time repair: normalise all existing created_at values to ISO-UTC+Z. */
async function repairMessageTimestamps() {
  const all = await messagesRepo.getRecent(99999);
  const db = await import('../db/db.js').then((d) => d.getDb());
  let changed = 0;
  for (const m of all) {
    if (!m.created_at) continue;
    const fixed = normalizeTimestamp(m.created_at);
    if (fixed !== m.created_at) {
      db.run('UPDATE messages SET created_at = ? WHERE id = ?', [fixed, m.id]);
      changed++;
    }
  }
  if (changed > 0) {
    import('../db/db.js').then((d) => d.saveDb());
    console.log(`[repair] Fixed ${changed} message timestamps`);
  }
}

function ensureOneMinuteOpening(
  say: string,
  songs: Array<{ name: string; artist?: string; intro?: string }>,
): string {
  const cleaned = (say || '').trim();
  if (cleaned.length >= 320) return cleaned;

  const featured = songs.slice(0, 6).map((song) => {
    const by = song.artist ? ` - ${song.artist}` : '';
    return `${song.name}${by}`;
  });
  const extension = [
    '先别急着把它当作一串歌名。今晚这组歌更像一段慢慢变亮的路：有些旋律负责把人从白天的噪声里带出来，有些节拍负责提醒你，生活不是只有赶路，也可以有一点停顿。',
    featured.length
      ? `等一下你会听到 ${featured.join('、')}。它们不一定来自同一种情绪，却像同一盏灯照在不同的房间里：有人在讲爱，有人在讲告别，也有人只是把一句没说出口的话放进和弦里。`
      : '等一下这些歌会一首一首进来，不用急着判断喜不喜欢，先让第一分钟过去，让身体自己决定要不要留下。',
    '如果今天你有点累，就把这段当作一个临时的靠岸；如果你其实还精神，那就把它当作夜里的小广播，陪你把注意力从屏幕边缘拉回来。我们不需要立刻得到答案，只要让音乐先开始，把呼吸放慢一点，把心里那些太硬的部分松开一点。',
    '这里是 Claudio。接下来的时间交给歌，也交给你自己。',
  ].join('');

  return `${cleaned}${cleaned.endsWith('。') ? '' : '。'}${extension}`;
}

function normalizePlaylistOpening(
  say: string,
  songs: Array<{ name: string; artist?: string; intro?: string }>,
): string {
  const cleaned = (say || '').trim();
  if (!cleaned) {
    const featured = songs[0]?.name ? `先从《${songs[0].name}》开始。` : '';
    return `${featured}这组歌我会少说一点，把空间留给音乐本身。`;
  }
  if (cleaned.length <= 280) return cleaned;
  const clipped = cleaned.slice(0, 260);
  const end = Math.max(clipped.lastIndexOf('。'), clipped.lastIndexOf('！'), clipped.lastIndexOf('？'));
  return end > 120 ? clipped.slice(0, end + 1) : `${clipped}。`;
}

function countMentionedSongs(
  say: string,
  songs: Array<{ name: string; artist?: string; intro?: string }>,
): number {
  return songs.reduce((count, song) => {
    const name = (song.name || '').trim();
    if (!name || name.length < 2) return count;
    return say.includes(name) ? count + 1 : count;
  }, 0);
}

function countMentionedArtists(
  say: string,
  songs: Array<{ name: string; artist?: string; intro?: string }>,
): number {
  const artists = new Set(
    songs
      .map((song) => (song.artist || '').trim())
      .filter((artist) => artist.length >= 2),
  );
  let count = 0;
  for (const artist of artists) {
    if (say.includes(artist)) count++;
  }
  return count;
}

function mentionsExactClockTime(say: string): boolean {
  return /(?:凌晨|早上|上午|中午|下午|傍晚|晚上)?[零一二三四五六七八九十两\d]{1,3}点(?:[零一二三四五六七八九十两\d]{1,3}分)?/.test(say)
    || /\b\d{1,2}:\d{2}\b/.test(say);
}

function repairPlaylistOpeningIfNeeded(
  say: string,
  songs: Array<{ name: string; artist?: string; intro?: string }>,
  scene: 'daily' | 'privateFm' | 'playlist' | 'music' = 'music',
): string {
  const cleaned = normalizePlaylistOpening(say, songs);
  const songMentions = countMentionedSongs(cleaned, songs);
  const artistMentions = countMentionedArtists(cleaned, songs);
  const needsRepair = songMentions > 1 || artistMentions > 1 || mentionsExactClockTime(cleaned);
  if (!needsRepair) return cleaned;

  const featured = songs.find((song) => cleaned.includes(song.name)) || songs[0];
  const title = featured?.name ? `《${featured.name}》` : '第一首歌';
  const artist = featured?.artist ? `${featured.artist} 的` : '';
  const lane = scene === 'privateFm'
    ? '这段私人 FM'
    : scene === 'daily'
      ? '今天这组每日推荐'
      : '这组歌';
  return [
    '先不把这批歌一首一首摊开说，那样声音会变成清单。',
    `我更想把注意力放在 ${artist}${title} 上：它不是急着把情绪推高的歌，而是把人从白天的硬壳里慢慢松出来。`,
    `${lane}就沿着这种感觉往下走，有一点节奏，也留一点空白。`,
    '你不用急着判断哪首最好，先让房间安静一点，让第一段旋律把门打开。这里是 Claudio，我们慢慢听。',
  ].join('');
}

function buildPlaylistOpeningPrompt(userInput: string, songInfoStr: string, currentTime: string, mode: 'music' | 'aidj' | 'privateFm') {
  const temporalGuidance = formatTemporalMusicGuidance(currentTime);
  const sceneRule = mode === 'privateFm'
    ? 'This is a private FM request. Say it as a personal radio flow, not "daily recommendation".'
    : mode === 'aidj'
      ? 'This is an AIDJ radio request.'
      : 'This is a music playlist request.';
  return `User request: ${userInput}
Current local time: ${currentTime}
Mode: ${mode}
Scene: ${sceneRule}

Time-of-day music guidance:
${temporalGuidance}

Songs that will play next:
${songInfoStr}

Write one continuous Mandarin FM opening for this playlist.
Hard rules:
- The "say" field must be 150-240 Chinese characters.
- Mention at most one song name total. Choose one strongest recommendation and focus on it.
- Do not mention multiple artists as a roll call. Do not say "后面还有..." followed by other songs or artists.
- Do not list the playlist. Do not introduce songs one by one. Do not write per-song intros.
- Apply the time-of-day music guidance to every generated playlist. It is a soft musical prior, not a hard ban: night and late-night sets should feel more eased and less jarring by default, but should not all collapse into sleepy low-energy music.
- Match the current time exactly. If it is noon or afternoon, do not say "night", "late night", or "夜里的小广播".
- Do not say exact clock time such as "晚上九点四十二分" or "21:42". Use only a broad feeling of the time when it is truly relevant.
- Avoid reusable template phrases, especially: "把呼吸放慢一点", "交给歌，也交给你自己", "屏幕边缘", "夜里的小广播", "不需要立刻得到答案".
- Use recent conversation and memory only when it is actually relevant. Single likes are weak signals, not proof of fixed taste.
- Sound like a real warm male FM host, concrete and present, not motivational, not philosophical padding.

Return strict JSON only:
{"theme":"主题","say":"150-240字中文电台开场，只重点讲1首歌，只自然提到1首歌名","songs":[{"id":"歌曲id","name":"歌名","artist":"歌手"}]}`;
}

async function collectAidjSongs(targetCount = AIDJ_TRACK_COUNT, currentTime = '', excludeSongIds: string[] = []) {
  const songs: Array<{ id: string; name: string; artist: string; album?: string; duration?: number; coverUrl?: string }> = [];
  const seen = new Set<string>(excludeSongIds.filter(Boolean));
  const pushUnique = (items: Array<{ id: string; name: string; artist: string; album?: string; duration?: number; coverUrl?: string }>) => {
    for (const song of items) {
      if (!song?.id || seen.has(song.id)) continue;
      seen.add(song.id);
      songs.push(song);
      if (songs.length >= targetCount) break;
    }
  };

  for (const query of getTemporalSearchTerms(currentTime).slice(0, 2)) {
    if (songs.length >= Math.ceil(targetCount / 2)) break;
    const temporalSongs = await ncmService.search(query, 6);
    pushUnique(temporalSongs);
  }

  for (let attempt = 0; attempt < 4 && songs.length < targetCount; attempt++) {
    const fmSongs = await ncmService.getPersonalFm();
    pushUnique(fmSongs);
  }

  if (songs.length < targetCount) {
    pushUnique(contextService.getCandidates(targetCount * 3).map((s) => ({
      id: s.id,
      name: s.name,
      artist: s.artist,
      album: s.album,
      duration: 0,
    })));
  }

  return songs.slice(0, targetCount);
}

let repaired = false;

export function registerChatRoutes(app: FastifyInstance) {
  if (!repaired) { repaired = true; repairMessageTimestamps(); }

  app.post('/api/chat', async (req, reply) => {
    const body = req.body as { message?: string } | null;
    const message = body?.message?.trim();
    if (!message) {
      return reply.status(400).send({ error: 'message is required' });
    }

    const userMsgId = crypto.randomUUID();
    const userTimestamp = new Date().toISOString();
    await messagesRepo.insert({
      id: userMsgId, role: 'user', content: message, tts_url: null, played: 1, created_at: userTimestamp,
    });

    const msg = message.toLowerCase();

    // Simple intent routing
    if (/^(暂停|停止|pause|stop)$/i.test(msg)) {
      return { type: 'command', action: 'pause' };
    }
    if (/^(继续|播放|resume|play)$/i.test(msg)) {
      return { type: 'command', action: 'play' };
    }
    if (/^(下一首|切歌|跳过|next|skip)$/i.test(msg)) {
      return { type: 'command', action: 'next' };
    }

    const playableSearch = await searchService.searchPlayable(message, AIDJ_TRACK_COUNT);
    if (playableSearch.intent.kind === 'music') {
      const songs = playableSearch.songs.map((s) => ({
        id: s.id,
        name: s.name,
        artist: s.artist || '未知',
      }));
      if (songs.length === 0) {
        return { type: 'chat', say: `我认真找了「${playableSearch.keyword}」，但现在没有拿到可播放的版本。` };
      }

      const ctx = await contextService.assembleContext(message, 'music');
      const candidateStr = songs.map((s, i) => `${i + 1}. [${s.id}] ${s.name} - ${s.artist}`).join('\n');
      const openingPrompt = [
        { role: 'system' as const, content: ctx.systemPrompt.replace('{{chatHistory}}', '（本轮是明确搜歌/放歌请求）') },
        { role: 'user' as const, content: `用户明确想听: ${message}\n\n后端已经找到这些可播放歌曲:\n${candidateStr}\n\n只从这些歌里组织一个 10 首以内歌单。写一段完整中文 FM intro，不要逐首介绍。返回严格 JSON: {"theme":"主题","say":"180-280字中文开场，只重点解读其中一首最推荐的歌","songs":[{"id":"歌曲id","name":"歌名","artist":"歌手"}]}` },
      ];
      openingPrompt[1] = { role: 'user' as const, content: buildPlaylistOpeningPrompt(message, candidateStr, ctx.time, 'music') };
      const output = await deepseekService.chatComplete(openingPrompt);
      const say = normalizePlaylistOpening(output.say || `找到 ${playableSearch.keyword} 了，我们慢慢听。`, songs);
      const ttsResult = await ttsService.synthesize(say);
      if ((output as any).mood && typeof (output as any).mood === 'string') {
        await memoryService.updateMood((output as any).mood);
      }
      const djMsgId = crypto.randomUUID();
      const djTimestamp = new Date().toISOString();
      await messagesRepo.insert({
        id: djMsgId,
        role: 'dj',
        content: say,
        tts_url: ttsResult.audioUrl || null,
        played: 0,
        created_at: djTimestamp,
      });
      return {
        type: 'playlist',
        id: djMsgId,
        say,
        ttsUrl: ttsResult.audioUrl,
        alignment: ttsResult.alignment,
        theme: output.theme || playableSearch.keyword,
        songs,
        songIntros: {},
        songIntroAlignments: {},
        source: playableSearch.source,
        userTimestamp,
        djTimestamp,
      };
    }

    // --- Semantic intent detection (BEFORE opening SSE) ---
    const ctx = await contextService.assembleContext(message, 'chat');
    const userMsg = message.trim();
    const wantsPrivateFm = /私人\s*fm|私人\s*FM|私人漫游|personal\s*fm/i.test(userMsg);
    const wantsDaily = /每日推荐|今日推荐|日推|daily/.test(userMsg);
    const wantsPlaylist = /歌单|收藏|我的.*歌|红心|我喜欢|我.*喜欢/.test(userMsg);

    let candidates = contextService.getCandidates(200);
    let candidateStr = '';
    let userPrompt = '';
    let playlistScene: 'daily' | 'privateFm' | 'playlist' | 'music' = 'music';

    // Only call NCM when clearly matching intent
    if (wantsPrivateFm) {
      playlistScene = 'privateFm';
      try {
        const fmSongs = await collectAidjSongs(AIDJ_TRACK_COUNT, ctx.time);
        if (fmSongs.length > 0) {
          candidates = fmSongs.map((song) => ({
            id: song.id,
            name: song.name,
            artist: song.artist,
            album: song.album || '',
          }));
          candidateStr = fmSongs.map((s) => `[${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n');
          userPrompt = `她说: ${message}\n\n这是私人 FM 队列，从里面选 10 首推给她。`;
        }
      } catch { /* fall through to local candidates */ }
    } else if (wantsDaily) {
      playlistScene = 'daily';
      try {
        const daily = await ncmService.getDailyRecommend();
        if (daily.length > 0) {
          candidates = daily;
          candidateStr = daily.map((s) => `[${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n');
          userPrompt = `她说: ${message}\n\n这是今日推荐的歌曲，从里面选 10-20 首推给她。`;
        }
      } catch { /* fall through to local candidates */ }
    } else if (wantsPlaylist) {
      playlistScene = 'playlist';
      try {
        const playlists = await ncmService.getUserPlaylists();
        if (playlists.length > 0) {
          const plNames = playlists.map((p) => `- ${p.name} (id:${p.id}, ${p.trackCount}首)`).join('\n');
          const matched = playlists.find((p) => userMsg.includes(p.name));
          if (matched) {
            const tracks = await ncmService.getPlaylistTracks(matched.id, 100);
            if (tracks.length > 0) {
              candidates = tracks;
              candidateStr = tracks.map((s) => `[${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n');
              userPrompt = `她说: ${message}\n\n这是她歌单「${matched.name}」里的歌曲，推 10-20 首。`;
            }
          }
          if (!candidateStr) {
            candidateStr = candidates.length > 0
              ? candidates.map((s: any) => `[${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n')
              : '';
            userPrompt = `她说: ${message}\n\n她的歌单列表:\n${plNames}\n\n从候选或本地曲库选歌推给她。`;
          }
        }
      } catch { /* fall through */ }
    }

    // Fallback
    if (!candidateStr) {
      candidateStr = candidates.length > 0
        ? candidates.map((s: any) => `[${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n')
        : '暂无候选歌曲';
    }
    if (!userPrompt) {
      userPrompt = `她说: ${message}\n\n判断她只是想聊天还是想听歌。聊天就不放歌，想听歌就选 10-20 首推。`;
    }

    // Conversation history
    const recentHistory = await messagesRepo.getRecent(12);
    const historyStr = recentHistory
      .filter((m) => m.role !== 'system' && !m.content?.startsWith('['))
      .slice(-6)
      .map((m) => `${m.role === 'user' ? '她' : '你'}: ${(m.content || '').slice(0, 80)}`)
      .join('\n');
    const systemPrompt = ctx.systemPrompt.replace('{{chatHistory}}', historyStr || '（第一次对话）');

    // NATURAL LANGUAGE → DeepSeek with SSE stream
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let clientGone = false;
    const onClose = () => { clientGone = true; };
    req.raw.on('close', onClose);

    try {
      const playlistRequest = wantsPrivateFm || wantsDaily || wantsPlaylist;
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: playlistRequest
            ? buildPlaylistOpeningPrompt(message, candidateStr, ctx.time, wantsPrivateFm ? 'privateFm' : 'music')
            : `候选歌曲:\n${candidateStr}\n\n${userPrompt}`,
        },
      ];

      let fullOutput = '';
      for await (const chunk of deepseekService.chat(messages)) {
        if (clientGone) break;
        fullOutput += chunk;
        reply.raw.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      if (clientGone) { req.raw.removeListener('close', onClose); reply.raw.end(); return reply; }

      // Parse output: may or may not have songs
      let output: { theme?: string; say: string; songs?: Array<{ id: string; name: string; artist: string; coverUrl?: string }>; play?: Array<{ id: string; name: string; artist: string; coverUrl?: string }> };
      try {
        output = JSON.parse(fullOutput);
      } catch {
        const match = fullOutput.match(/\{[\s\S]*\}/);
        output = match ? JSON.parse(match[0]) : { say: fullOutput.trim() || '嗯，我在听。' };
      }

      const songs = (output.songs || output.play || []).map((song) => ({
        ...song,
        coverUrl: song.coverUrl || (candidates.find((candidate) => candidate.id === song.id) as { coverUrl?: string } | undefined)?.coverUrl,
      }));
      const hasSongs = songs.length > 0;
      const say = hasSongs ? repairPlaylistOpeningIfNeeded(output.say, songs, playlistScene) : output.say;
      const ttsResult = await ttsService.synthesize(say);

      // Save detected mood
      if ((output as any).mood && typeof (output as any).mood === 'string') {
        await memoryService.updateMood((output as any).mood);
      }

      const djMsgId = crypto.randomUUID();
      const djTimestamp = new Date().toISOString();
      await messagesRepo.insert({
        id: djMsgId, role: 'dj', content: say, tts_url: ttsResult.audioUrl || null, played: 0, created_at: djTimestamp,
      });

      reply.raw.write(`data: ${JSON.stringify({
        done: true, id: djMsgId, say, ttsUrl: ttsResult.audioUrl,
        alignment: ttsResult.alignment,
        theme: output.theme || '',
        songs: songs.map(s => ({ id: s.id, name: s.name, artist: s.artist, coverUrl: s.coverUrl })),
        songIntros: {},
        songIntroAlignments: {},
        chatOnly: !hasSongs,
        userTimestamp,
        djTimestamp,
      })}\n\n`);
    } catch (err: any) {
      if (!clientGone) {
        reply.raw.write(`data: ${JSON.stringify({ error: err.message || 'Unknown error' })}\n\n`);
      }
    }

    req.raw.removeListener('close', onClose);
    reply.raw.end();
    return reply;
  });

  // AIDJ: NCM personal FM recommendations + DeepSeek opening + MiMo TTS
  app.post('/api/aidj', async (req, reply) => {
    const { message, excludeSongIds = [] } = req.body as { message: string; excludeSongIds?: string[] };
    const userInput = (message || '来点音乐').trim();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const aidjUserMsgId = crypto.randomUUID();
    const aidjUserTimestamp = new Date().toISOString();
    await messagesRepo.insert({
      id: aidjUserMsgId, role: 'user', content: userInput, tts_url: null, played: 1, created_at: aidjUserTimestamp,
    });

    try {
      const ctx = await contextService.assembleContext(userInput, 'aidj');
      // 1. Get a stable 10-song AIDJ queue. Personal FM often returns 3 songs per call.
      const songList = await collectAidjSongs(AIDJ_TRACK_COUNT, ctx.time, excludeSongIds);

      // 2. DeepSeek opening monologue
      const recentHistory = await messagesRepo.getRecent(12);
      const historyStr = recentHistory
        .filter((m) => m.role !== 'system' && !m.content?.startsWith('['))
        .slice(-8)
        .map((m) => `${m.role === 'user' ? 'USER' : 'CLAUDIO'}: ${(m.content || '').slice(0, 120)}`)
        .join('\n');
      const systemPrompt = ctx.systemPrompt.replace('{{chatHistory}}', historyStr || 'No previous conversation yet.');
      const songInfoStr = songList.length > 0
        ? songList.map((s, i) => `${i + 1}. [${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n')
        : '暂无歌曲';

      const openingPrompt = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: buildPlaylistOpeningPrompt(userInput, songInfoStr, ctx.time, 'aidj') },
      ];

      let fullOutput = '';
      for await (const chunk of deepseekService.chat(openingPrompt)) {
        fullOutput += chunk;
        reply.raw.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      // Parse opening
      let opening: { theme?: string; say: string; songs?: Array<{ id: string; name: string; artist: string; intro: string }> } = { say: '来听歌吧。' };
      try {
        opening = JSON.parse(fullOutput);
      } catch {
        const match = fullOutput.match(/\{[\s\S]*\}/);
        opening = match ? JSON.parse(match[0]) : { say: fullOutput.trim() || '来听歌吧。' };
      }

      const songs = songList.map((s) => ({
        id: s.id, name: s.name, artist: s.artist, coverUrl: s.coverUrl,
      }));
      opening.say = normalizePlaylistOpening(opening.say, songs);
      const ttsResult = await ttsService.synthesize(opening.say);

      const djMsgId = crypto.randomUUID();
      const djTimestamp = new Date().toISOString();
      await messagesRepo.insert({
        id: djMsgId, role: 'dj', content: opening.say, tts_url: ttsResult.audioUrl || null, played: 0, created_at: djTimestamp,
      });

      reply.raw.write(`data: ${JSON.stringify({
        done: true,
        id: djMsgId,
        say: opening.say,
        ttsUrl: ttsResult.audioUrl,
        alignment: ttsResult.alignment,
        theme: opening.theme || '私人漫游',
        songs: songs.map(s => ({ id: s.id, name: s.name, artist: s.artist, coverUrl: s.coverUrl })),
        songIntros: {},
        songIntroAlignments: {},
        source: 'aidj',
        userTimestamp: aidjUserTimestamp,
        djTimestamp,
      })}\n\n`);
    } catch (err: any) {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message || 'AIDJ failed' })}\n\n`);
    }

    reply.raw.end();
    return reply;
  });

  app.get('/api/chat/history', async (req) => {
    const query = req.query as { limit?: string };
    const limit = parseInt(query.limit || '50');
    const msgs = await messagesRepo.getRecent(limit);
    return { messages: msgs.reverse().map((m) => ({
      ...m,
      timestamp: normalizeTimestamp(m.created_at),
    })) };
  });
}
