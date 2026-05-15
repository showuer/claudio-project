import { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextService } from '../services/context.service.js';
import { deepseekService } from '../services/deepseek.service.js';
import { messagesRepo } from '../db/messages.repo.js';
import { ncmService } from '../services/ncm.service.js';
import { ttsService } from '../services/tts.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

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

    // --- Semantic intent detection (BEFORE opening SSE) ---
    const ctx = await contextService.assembleContext(message);
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
      let output: { theme?: string; say: string; songs?: Array<{ id: string; name: string; artist: string; intro: string }>; play?: Array<{ id: string; name: string; artist: string }> };
      try {
        output = JSON.parse(fullOutput);
      } catch {
        const match = fullOutput.match(/\{[\s\S]*\}/);
        output = match ? JSON.parse(match[0]) : { say: fullOutput.trim() || '嗯，我在听。' };
      }

      const songs = output.songs || output.play?.map(s => ({ ...s, intro: '' })) || [];
      const hasSongs = songs.length > 0;

      // TTS for DJ reply
      const ttsResult = await ttsService.synthesize(output.say);
      const songIntros: Record<string, string> = {};

      // Save detected mood
      if ((output as any).mood && typeof (output as any).mood === 'string') {
        try {
          fs.mkdirSync(path.join(rootDir, 'user'), { recursive: true });
          fs.writeFileSync(path.join(rootDir, 'user', 'mood.md'), (output as any).mood.trim(), 'utf-8');
        } catch { /* non-critical */ }
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
    });

    try {
      // 1. Get NCM personal FM songs
      const fmSongs = await ncmService.getPersonalFm();
      const songList = fmSongs.length > 0 ? fmSongs : [];

      // 2. DeepSeek opening monologue
      const ctx = await contextService.assembleContext(userInput);
      const openingPrompt = [
        { role: 'system' as const, content: ctx.systemPrompt },
        { role: 'user' as const, content: `用户说: ${userInput}\n\n请写开场白，返回JSON: {"theme":"主题","say":"80-150字开场白"}` },
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

      // 3. TTS for opening
      const ttsResult = await ttsService.synthesize(opening.say);

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
        songIntros: {},
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
