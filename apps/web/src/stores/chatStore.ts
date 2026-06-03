import { create } from 'zustand';
import { apiClient } from '../api/client';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface Message {
  id: string;
  role: 'user' | 'dj' | 'system';
  content: string;
  ttsUrl?: string;
  alignment?: { segments: Array<{ text: string; start: number; end: number }> };
  played: boolean;
  status?: 'thinking' | 'streaming' | 'done';
  timestamp: string;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentTtsWord: number;

  sendMessage: (text: string) => Promise<void>;
  sendAidj: (text: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  addMessage: (msg: Message) => void;
  attachTts: (id: string, ttsUrl: string, alignment?: Message['alignment']) => void;
  setTtsWord: (i: number) => void;
  markPlayed: (id: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentTtsWord: -1,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  attachTts: (id, ttsUrl, alignment) => set((s) => ({
    messages: s.messages.map((m) =>
      m.id === id ? { ...m, ttsUrl, alignment, status: 'done', played: false } : m
    ),
  })),
  setTtsWord: (i) => set({ currentTtsWord: i }),
  markPlayed: (id) => set((s) => {
    const target = s.messages.find((m) => m.id === id);
    if (!target || target.played) return s;
    return {
      messages: s.messages.map((m) => (m.id === id ? { ...m, played: true } : m)),
    };
  }),

  sendMessage: async (text: string) => {
    const userMsg: Message = {
      id: uuid(), role: 'user', content: text, played: true, timestamp: new Date().toISOString(),
    };
    const djMsg: Message = {
      id: uuid(), role: 'dj', content: '', status: 'thinking', played: false, timestamp: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, userMsg, djMsg], isStreaming: true }));

    try {
      const result = await apiClient.chat(text, (token) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === djMsg.id ? { ...m, content: m.content + token, status: 'streaming' } : m
          ),
        }));
      });

      // Command responses
      if (result.type === 'command') {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === djMsg.id ? { ...m, content: `[${result.action}]`, status: 'done', played: true } : m
          ),
          isStreaming: false,
        }));
        return;
      }
      if (result.type === 'search') {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === djMsg.id ? { ...m, content: `Found ${result.results?.length || 0} songs`, status: 'done', played: true } : m
          ),
          isStreaming: false,
        }));
        return;
      }

      // Natural language response with playlist
      const ttsUrl = result.ttsUrl || '';
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id === djMsg.id) {
            return { ...m, status: 'done', ttsUrl, alignment: result.alignment, content: result.say || m.content, timestamp: result.djTimestamp || m.timestamp };
          }
          if (m.id === userMsg.id && result.userTimestamp) {
            return { ...m, timestamp: result.userTimestamp };
          }
          return m;
        }),
        isStreaming: false,
      }));

      // Push playlist to player
      const songList = result.songs || result.play;
      if (songList && songList.length > 0) {
        const { usePlayerStore } = await import('./playerStore');
        const ps = usePlayerStore.getState();
        ps.init();
        ps.queuePlaylist(
          songList.map((s: any) => ({
            song_id: s.id, song_name: s.name, artist: s.artist,
            coverUrl: s.coverUrl,
            duration_ms: 240000,
          })),
          ttsUrl,
        );
      }
    } catch (err: any) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === djMsg.id ? { ...m, content: `[ERROR: Retry]`, status: 'done' } : m
        ),
        isStreaming: false,
      }));
    }
  },

  /** AIDJ: NCM personal FM + DeepSeek opening + MiMo TTS */
  sendAidj: async (text: string) => {
    const userMsg: Message = {
      id: uuid(), role: 'user', content: text || '私人漫游', played: true, timestamp: new Date().toISOString(),
    };
    const djMsg: Message = {
      id: uuid(), role: 'dj', content: '', status: 'thinking', played: false, timestamp: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, userMsg, djMsg], isStreaming: true }));

    try {
      const { usePlayerStore } = await import('./playerStore');
      const excludeSongIds = usePlayerStore.getState().playlist.map((song) => song.song_id);
      const result = await apiClient.aidj(text, (token) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === djMsg.id ? { ...m, content: m.content + token, status: 'streaming' } : m
          ),
        }));
      }, excludeSongIds);

      if (result.error) throw new Error(result.error);

      const ttsUrl = result.ttsUrl || '';
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id === djMsg.id) {
            return { ...m, status: 'done', ttsUrl, alignment: result.alignment, content: result.say || m.content, timestamp: result.djTimestamp || m.timestamp };
          }
          if (m.id === userMsg.id && result.userTimestamp) {
            return { ...m, timestamp: result.userTimestamp };
          }
          return m;
        }),
        isStreaming: false,
      }));

      if (result.songs?.length) {
        const ps = usePlayerStore.getState();
        ps.init();
        ps.queuePlaylist(
          result.songs.map((s: any) => ({
            song_id: s.id, song_name: s.name, artist: s.artist,
            coverUrl: s.coverUrl,
            duration_ms: 240000,
          })),
          ttsUrl,
        );
      }
    } catch (err: any) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === djMsg.id ? { ...m, content: `[AIDJ: Retry]`, status: 'done' } : m
        ),
        isStreaming: false,
      }));
    }
  },

  loadHistory: async () => {
    try {
      const data = await apiClient.getHistory();
      if (data.messages) {
        set({ messages: data.messages.map((m: any) => ({
          ...m,
          status: 'done' as const,
          played: !!m.played,
          // All stored timestamps are UTC. Normalise SQLite format to ISO+Z.
          timestamp: !m.timestamp ? new Date().toISOString()
            : !m.timestamp.includes('T') ? m.timestamp.replace(' ', 'T') + 'Z'
            : m.timestamp.endsWith('Z') ? m.timestamp
            : m.timestamp + 'Z',
        })) });
      }
    } catch { /* ignore */ }
  },
}));
