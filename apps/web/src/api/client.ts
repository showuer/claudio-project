const BASE = '';

export const apiClient = {
  async chat(text: string, onToken: (t: string) => void): Promise<any> {
    const resp = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });

    const contentType = resp.headers.get('content-type') || '';

    // SSE stream
    if (contentType.includes('text/event-stream')) {
      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let result: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          if (data.done) {
            result = data;
          } else if (data.token) {
            onToken(data.token);
          }
        }
      }
      return result || { say: '', play: [], ttsUrl: '' };
    }

    // JSON response (command/search)
    return resp.json();
  },

  async getHistory(): Promise<{ messages: any[] }> {
    const resp = await fetch(`${BASE}/api/chat/history?limit=50`);
    return resp.json();
  },

  async getPlaylists(): Promise<{ playlists: any[] }> {
    const resp = await fetch(`${BASE}/api/playlists`);
    return resp.json();
  },

  async syncPlaylists(): Promise<{ imported: number }> {
    const resp = await fetch(`${BASE}/api/playlists/sync`, { method: 'POST' });
    return resp.json();
  },

  async stationStart(mode: string, excludeSongIds: string[] = []): Promise<any> {
    const resp = await fetch(`${BASE}/api/modes/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, excludeSongIds }),
    });
    return resp.json();
  },

  async stationNext(mode: string, cursor: string, excludeSongIds: string[] = []): Promise<any> {
    const resp = await fetch(`${BASE}/api/modes/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, cursor, excludeSongIds }),
    });
    return resp.json();
  },

  async aidj(text: string, onToken: (t: string) => void, excludeSongIds: string[] = []): Promise<any> {
    const resp = await fetch(`${BASE}/api/aidj`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, excludeSongIds }),
    });
    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    let result: any = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.done) { result = data; }
        else if (data.token) { onToken(data.token); }
      }
    }
    return result || { say: '', songs: [], ttsUrl: '', songIntros: {} };
  },

  async getProfile(): Promise<{ totalHours: number; totalPlays: number; topArtists: any[] }> {
    const resp = await fetch(`${BASE}/api/profile`);
    return resp.json();
  },

  async getTaste(): Promise<{ content: string }> {
    const resp = await fetch(`${BASE}/api/profile/taste`);
    return resp.json();
  },

  async saveTaste(content: string): Promise<void> {
    await fetch(`${BASE}/api/profile/taste`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  },

  async getMemory(): Promise<{ content: string }> {
    const resp = await fetch(`${BASE}/api/profile/memory`);
    return resp.json();
  },

  async saveMemory(content: string): Promise<{ saved: boolean }> {
    const resp = await fetch(`${BASE}/api/profile/memory`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return resp.json();
  },

  async getMemorySummary(): Promise<{
    tags: string[];
    topArtists: string[];
    mood: string;
    copy: string;
    philosophy: string;
    totalHours: number;
    totalPlays: number;
    avoid: string[];
    routines: string[];
  }> {
    const resp = await fetch(`${BASE}/api/profile/memory/summary`);
    return resp.json();
  },

  async getSettings(): Promise<Record<string, string>> {
    const resp = await fetch(`${BASE}/api/settings`);
    return resp.json();
  },

  async updateSetting(key: string, value: string): Promise<void> {
    await fetch(`${BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  },
};
