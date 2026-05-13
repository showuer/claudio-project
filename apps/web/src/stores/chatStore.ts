import { create } from 'zustand';
import { apiClient } from '../api/client';

interface Message {
  id: string;
  role: 'user' | 'dj' | 'system';
  content: string;
  ttsUrl?: string;
  played: boolean;
  status?: 'thinking' | 'streaming' | 'done';
  timestamp: string;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentTtsWord: number;

  sendMessage: (text: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  addMessage: (msg: Message) => void;
  setTtsWord: (i: number) => void;
  markPlayed: (id: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentTtsWord: -1,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setTtsWord: (i) => set({ currentTtsWord: i }),
  markPlayed: (id) => set((s) => ({
    messages: s.messages.map((m) => (m.id === id ? { ...m, played: true } : m)),
  })),

  sendMessage: async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(), role: 'user', content: text, played: true, timestamp: new Date().toISOString(),
    };
    const djMsg: Message = {
      id: crypto.randomUUID(), role: 'dj', content: '', status: 'thinking', played: false, timestamp: new Date().toISOString(),
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
        messages: s.messages.map((m) =>
          m.id === djMsg.id ? { ...m, status: 'done', ttsUrl, content: result.say || m.content } : m
        ),
        isStreaming: false,
      }));

      // Push playlist to player — handle both old format (play[]) and new format (songs[] + songIntros)
      const songList = result.songs || result.play;
      if (songList && songList.length > 0) {
        const { usePlayerStore } = await import('./playerStore');
        const ps = usePlayerStore.getState();
        const intros = result.songIntros || {};
        ps.init();
        ps.setPlaylist(
          songList.map((s: any) => ({
            song_id: s.id, song_name: s.name, artist: s.artist,
            intro: s.intro || '', introUrl: intros[s.id] || '',
            duration_ms: 240000,
          }))
        );
        if (!ttsUrl) ps.playTrack(0);
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

  loadHistory: async () => {
    try {
      const data = await apiClient.getHistory();
      if (data.messages) {
        set({ messages: data.messages.map((m: any) => ({ ...m, status: 'done' as const, played: !!m.played })) });
      }
    } catch { /* ignore */ }
  },
}));
