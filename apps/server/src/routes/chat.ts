import { FastifyInstance } from 'fastify';
import { contextService } from '../services/context.service.js';
import { deepseekService } from '../services/deepseek.service.js';
import { messagesRepo } from '../db/messages.repo.js';
import { ncmService } from '../services/ncm.service.js';
import { ttsService } from '../services/tts.service.js';
import { searchService } from '../services/search.service.js';
import { memoryService } from '../services/memory.service.js';

const AIDJ_TRACK_COUNT = 10;

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

async function collectAidjSongs(targetCount = AIDJ_TRACK_COUNT) {
  const songs: Array<{ id: string; name: string; artist: string; album?: string; duration?: number }> = [];
  const seen = new Set<string>();
  const pushUnique = (items: Array<{ id: string; name: string; artist: string; album?: string; duration?: number }>) => {
    for (const song of items) {
      if (!song?.id || seen.has(song.id)) continue;
      seen.add(song.id);
      songs.push(song);
      if (songs.length >= targetCount) break;
    }
  };

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

export function registerChatRoutes(app: FastifyInstance) {
  app.post('/api/chat', async (req, reply) => {
    const { message } = req.body as { message: string };

    const userMsgId = crypto.randomUUID();
    await messagesRepo.insert({
      id: userMsgId, role: 'user', content: message, tts_url: null, played: 1,
    });

    const msg = message.trim().toLowerCase();

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
      const output = await deepseekService.chatComplete(openingPrompt);
      const say = ensureOneMinuteOpening(output.say || `找到 ${playableSearch.keyword} 了，我们慢慢听。`, songs);
      const ttsResult = await ttsService.synthesize(say);
      if ((output as any).mood && typeof (output as any).mood === 'string') {
        await memoryService.updateMood((output as any).mood);
      }
      const djMsgId = crypto.randomUUID();
      await messagesRepo.insert({
        id: djMsgId,
        role: 'dj',
        content: say,
        tts_url: ttsResult.audioUrl || null,
        played: 0,
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
      };
    }

    // --- Semantic intent detection (BEFORE opening SSE) ---
    const ctx = await contextService.assembleContext(message, 'chat');
    const userMsg = message.trim();
    const wantsDaily = /每日推荐|今日推荐|日推|daily/.test(userMsg);
    const wantsPlaylist = /歌单|收藏|我的.*歌|红心|我喜欢|我.*喜欢/.test(userMsg);

    let candidates = contextService.getCandidates(200);
    let candidateStr = '';
    let userPrompt = '';

    // Only call NCM when clearly matching intent
    if (wantsDaily) {
      try {
        const daily = await ncmService.getDailyRecommend();
        if (daily.length > 0) {
          candidates = daily;
          candidateStr = daily.map((s) => `[${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n');
          userPrompt = `她说: ${message}\n\n这是今日推荐的歌曲，从里面选 10-20 首推给她。`;
        }
      } catch { /* fall through to local candidates */ }
    } else if (wantsPlaylist) {
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

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `候选歌曲:\n${candidateStr}\n\n${userPrompt}` },
      ];

      let fullOutput = '';
      for await (const chunk of deepseekService.chat(messages)) {
        fullOutput += chunk;
        reply.raw.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      // Parse output: may or may not have songs
      let output: { theme?: string; say: string; songs?: Array<{ id: string; name: string; artist: string }>; play?: Array<{ id: string; name: string; artist: string }> };
      try {
        output = JSON.parse(fullOutput);
      } catch {
        const match = fullOutput.match(/\{[\s\S]*\}/);
        output = match ? JSON.parse(match[0]) : { say: fullOutput.trim() || '嗯，我在听。' };
      }

      const songs = output.songs || output.play || [];
      const hasSongs = songs.length > 0;
      const ttsResult = await ttsService.synthesize(output.say);

      // Save detected mood
      if ((output as any).mood && typeof (output as any).mood === 'string') {
        await memoryService.updateMood((output as any).mood);
      }

      const djMsgId = crypto.randomUUID();
      await messagesRepo.insert({
        id: djMsgId, role: 'dj', content: output.say, tts_url: ttsResult.audioUrl || null, played: 0,
      });

      reply.raw.write(`data: ${JSON.stringify({
        done: true, id: djMsgId, say: output.say, ttsUrl: ttsResult.audioUrl,
        alignment: ttsResult.alignment,
        theme: output.theme || '',
        songs: songs.map(s => ({ id: s.id, name: s.name, artist: s.artist })),
        songIntros: {},
        songIntroAlignments: {},
        chatOnly: !hasSongs,
      })}\n\n`);
    } catch (err: any) {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message || 'Unknown error' })}\n\n`);
    }

    reply.raw.end();
    return reply;
  });

  // AIDJ: NCM personal FM recommendations + DeepSeek opening + MiMo TTS
  app.post('/api/aidj', async (req, reply) => {
    const { message } = req.body as { message: string };
    const userInput = (message || '来点音乐').trim();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      // 1. Get a stable 10-song AIDJ queue. Personal FM often returns 3 songs per call.
      const songList = await collectAidjSongs(AIDJ_TRACK_COUNT);

      // 2. DeepSeek opening monologue
      const ctx = await contextService.assembleContext(userInput, 'aidj');
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
        { role: 'user' as const, content: `用户说: ${userInput}\n\n接下来要播放的歌曲:\n${songInfoStr}\n\n请为这批歌曲写开场白和每首歌的简短介绍。返回JSON:\n{"theme":"主题","say":"60-120字开场白,必须提到下面这些歌","songs":[{"id":"歌曲id","name":"歌名","artist":"歌手","intro":"15-25字,结合用户心情介绍这首歌"}]}` },
      ];

      let fullOutput = '';
      openingPrompt[1] = { role: 'user' as const, content: `User request: ${userInput}

Songs that will play next:
${songInfoStr}

Write one continuous private Mandarin FM radio opening for the whole playlist. Do not write per-song intros. The opening must respond to the recent conversation context, then connect these songs to ordinary life, time, breath, loneliness, love, choice, or small freedom. Do not sound like a playlist announcement, encyclopedia, motivational quote, or template. Vary sentence rhythm each time, but make the paragraph feel like one continuous thought rather than separate stitched sentences. The voice should be a warm Chinese male radio host.

The opening "say" must be long enough for at least 60 seconds of spoken audio: write 360-480 Chinese characters, with natural pauses and enough atmosphere before the first song fades in.

The "songs" array is only metadata for the playlist. Do not include or write intro text for individual songs.

Return strict JSON only:
{"theme":"主题","say":"360-480字中文电台开场白。必须自然提到几首歌，但重点是把这批歌和一种生活/哲学感受连起来。要像真正 FM 开场，说完可以直接放歌。","songs":[{"id":"歌曲id","name":"歌名","artist":"歌手","intro":"35-60字中文。结合这首歌、用户此刻和一点生活感/哲学感，不要像百科介绍。"}]}` };

      openingPrompt[1] = { role: 'user' as const, content: `User request: ${userInput}

Songs that will play next:
${songInfoStr}

Write one continuous Mandarin FM opening for the whole playlist. Do not introduce every song. Choose exactly one strongest recommendation from the list and spend most of the monologue interpreting it: why this song fits this moment, what emotion or life texture it carries, and how it opens a doorway into the rest of the playlist. You may briefly mention at most two other songs only if they help the emotional thread. Sound like a warm male radio host and an emotional companion, not a catalogue, not a music encyclopedia, not a motivational quote.

The opening "say" should be 360-480 Chinese characters. It must feel like one connected paragraph: each sentence should inherit the breath and meaning of the previous sentence. Avoid stitched, standalone sentence rhythm. Use natural pauses, but keep the emotional line continuous.

Return strict JSON only:
{"theme":"主题","say":"360-480字中文电台开场白，只深入解读一首最推荐的歌，同时把它和生活、关系、夜晚、呼吸、选择或自由中的一种感受连起来。不要逐首点名歌单。","songs":[{"id":"歌曲id","name":"歌名","artist":"歌手"}]}` };

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
        id: s.id, name: s.name, artist: s.artist,
      }));
      opening.say = ensureOneMinuteOpening(opening.say, songs);
      const ttsResult = await ttsService.synthesize(opening.say);

      const djMsgId = crypto.randomUUID();
      await messagesRepo.insert({
        id: djMsgId, role: 'dj', content: opening.say, tts_url: ttsResult.audioUrl || null, played: 0,
      });

      reply.raw.write(`data: ${JSON.stringify({
        done: true,
        id: djMsgId,
        say: opening.say,
        ttsUrl: ttsResult.audioUrl,
        alignment: ttsResult.alignment,
        theme: opening.theme || '私人漫游',
        songs: songs.map(s => ({ id: s.id, name: s.name, artist: s.artist })),
        songIntros: {},
        songIntroAlignments: {},
        source: 'aidj',
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
    return { messages: msgs.reverse().map((m) => ({ ...m, timestamp: m.created_at })) };
  });
}
