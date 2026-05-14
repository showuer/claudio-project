import { FastifyInstance } from 'fastify';
import { contextService } from '../services/context.service.js';
import { deepseekService } from '../services/deepseek.service.js';
import { messagesRepo } from '../db/messages.repo.js';
import { ncmService } from '../services/ncm.service.js';
import { ttsService } from '../services/tts.service.js';

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

    // Search intent
    const searchMatch = message.match(/^(搜索|找|搜|有没有)\s*(.+)/i);
    if (searchMatch) {
      const results = await ncmService.search(searchMatch[2], 10);
      return { type: 'search', results };
    }

    // NATURAL LANGUAGE → DeepSeek with SSE stream
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      const ctx = await contextService.assembleContext(message);
      const candidates = contextService.getCandidates(200);

      const candidateStr = candidates.length > 0
        ? candidates.map((s) => `[${s.id}] ${s.name} - ${s.artist || '未知'}`).join('\n')
        : '暂无候选歌曲，请从用户输入自由推荐';

      const messages = [
        { role: 'system' as const, content: ctx.systemPrompt },
        { role: 'user' as const, content: `候选歌曲:\n${candidateStr}\n\n她说: ${message}\n\n请选歌，写串词，返回JSON。` },
      ];

      let fullOutput = '';
      for await (const chunk of deepseekService.chat(messages)) {
        fullOutput += chunk;
        reply.raw.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      // Parse new format: {theme, say, songs:[{id,name,artist,intro}]} or old: {say, play:[]}
      let output: { theme?: string; say: string; songs?: Array<{ id: string; name: string; artist: string; intro: string }>; play?: Array<{ id: string; name: string; artist: string }> };
      try {
        output = JSON.parse(fullOutput);
      } catch {
        const match = fullOutput.match(/\{[\s\S]*\}/);
        output = match ? JSON.parse(match[0]) : { say: '来听几首歌吧。' };
      }

      // Normalize: ensure songs array exists
      const songs = output.songs || output.play?.map(s => ({ ...s, intro: '' })) || [];

      // TTS for opening narration + per-song intros (parallel)
      const introTasks = songs
        .filter((s) => s.intro)
        .map(async (s) => {
          const introTts = await ttsService.synthesize(s.intro);
          return { id: s.id, url: introTts.audioUrl };
        });
      const [ttsResult, ...introResults] = await Promise.all([
        ttsService.synthesize(output.say),
        ...introTasks,
      ]);
      const songIntros: Record<string, string> = {};
      for (const r of introResults) {
        if (r.url) songIntros[r.id] = r.url;
      }

      const djMsgId = crypto.randomUUID();
      await messagesRepo.insert({
        id: djMsgId, role: 'dj', content: output.say, tts_url: ttsResult.audioUrl || null, played: 0,
      });

      reply.raw.write(`data: ${JSON.stringify({
        done: true, id: djMsgId, say: output.say, ttsUrl: ttsResult.audioUrl,
        theme: output.theme || '',
        songs: songs.map(s => ({ id: s.id, name: s.name, artist: s.artist, intro: s.intro || '' })),
        songIntros,
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
    });

    try {
      // 1. Get NCM personal FM songs (fast, pre-personalized)
      const fmSongs = await ncmService.getPersonalFm();
      const songList = fmSongs.length > 0 ? fmSongs : [];

      reply.raw.write(`data: ${JSON.stringify({ token: `[AIDJ] 私人漫游找到 ${songList.length} 首歌` })}\n\n`);

      // 2. DeepSeek opening monologue based on user input + weather + time + song context
      const ctx = await contextService.assembleContext(userInput);
      const songContext = songList.slice(0, 10).map((s, i) => `${i + 1}. ${s.name} - ${s.artist}`).join('\n');
      const openingPrompt = [
        { role: 'system' as const, content: ctx.systemPrompt },
        { role: 'user' as const, content: `网易云私人漫游推荐了以下歌曲:\n${songContext}\n\n用户说: ${userInput}\n\n请为这段音乐旅程写一段开场白（say字段），200-300字。不需要选歌（歌曲已经定好了），只需要写开场独白。返回JSON: {"theme":"主题","say":"开场白200-300字"}` },
      ];

      let fullOutput = '';
      for await (const chunk of deepseekService.chat(openingPrompt)) {
        fullOutput += chunk;
        reply.raw.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      // Parse opening
      let opening: { theme?: string; say: string } = { say: '来听歌吧。' };
      try {
        opening = JSON.parse(fullOutput);
      } catch {
        const match = fullOutput.match(/\{[\s\S]*\}/);
        opening = match ? JSON.parse(match[0]) : { say: fullOutput.trim() || '来听歌吧。' };
      }

      // 3. TTS for opening (parallel with song intros if songs have them)
      const ttsResult = await ttsService.synthesize(opening.say);

      // 4. Get song playback URLs
      const songIntros: Record<string, string> = {};
      const songs = songList.map((s) => ({
        id: s.id, name: s.name, artist: s.artist, intro: '',
      }));

      reply.raw.write(`data: ${JSON.stringify({
        done: true,
        id: crypto.randomUUID(),
        say: opening.say,
        ttsUrl: ttsResult.audioUrl,
        theme: opening.theme || '私人漫游',
        songs,
        songIntros,
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
    return { messages: msgs.reverse() };
  });
}
