import { create } from 'zustand';

export interface Song {
  song_id: string; song_name: string; artist: string; intro?: string; introUrl?: string;
}

let audio: HTMLAudioElement | null = null;
let introAudio: HTMLAudioElement | null = null;
let progressTimer = 0;
let errorCount = 0;

function ensureAudio() {
  if (!audio) {
    audio = new Audio();
    audio.volume = 0.7;
    audio.addEventListener('error', () => {
      errorCount++;
      if (errorCount <= 1) {
        // Try next track on first error, but don't loop infinitely
        usePlayerStore.getState().nextTrack();
      } else {
        usePlayerStore.setState({ musicPlaying: false, djNarrating: false });
      }
    });
    audio.addEventListener('ended', () => {
      usePlayerStore.getState().nextTrack();
    });
  }
  if (!introAudio) {
    introAudio = new Audio();
    introAudio.volume = 1;
  }
  return { audio, introAudio };
}

function startProgress() {
  clearInterval(progressTimer);
  progressTimer = window.setInterval(() => {
    if (audio && !audio.paused) {
      usePlayerStore.setState({
        progressMs: audio.currentTime * 1000,
        durationMs: (audio.duration || 240) * 1000,
      });
    }
  }, 250);
}

let narrationAudio: HTMLAudioElement | null = null;

interface PlayerState {
  playlist: Song[];
  currentIndex: number;
  musicPlaying: boolean;
  progressMs: number;
  durationMs: number;
  djNarrating: boolean;
  volume: number;
  lyricLrc: string;
  lyricKlyric: string;
  isLiked: boolean;

  setPlaylist: (s: Song[]) => void;
  playTrack: (i: number) => void;
  toggleMusic: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (pct: number) => void;
  setVolume: (v: number) => void;
  playNarrationThenMusic: (narrationUrl: string, startIndex?: number) => void;
  fetchLyric: (songId: string) => Promise<void>;
  fetchLikeStatus: (songId: string) => Promise<void>;
  toggleLike: (songId: string) => Promise<void>;
  init: () => void;
}

const STORAGE = 'claudio_playlist';

export const usePlayerStore = create<PlayerState>((set, get) => ({
  playlist: (() => { try { const d = JSON.parse(localStorage.getItem(STORAGE) || '{}'); return d.playlist || []; } catch { return []; } })(),
  currentIndex: -1,
  musicPlaying: false,
  progressMs: 0,
  durationMs: 240000,
  djNarrating: false,
  volume: 0.7,
  lyricLrc: '',
  lyricKlyric: '',
  isLiked: false,

  init: () => {
    ensureAudio();
    startProgress();
  },

  setPlaylist: (songs) => {
    set({ playlist: songs, currentIndex: 0, musicPlaying: false, progressMs: 0 });
    localStorage.setItem(STORAGE, JSON.stringify({ playlist: songs, currentIndex: 0 }));
  },

  playTrack: (i) => {
    const { playlist, volume } = get();
    if (i < 0 || i >= playlist.length) return;
    const song = playlist[i];
    const a = ensureAudio().audio!;
    a.volume = volume;
    a.pause();

    errorCount = 0;
    set({ currentIndex: i, musicPlaying: false, progressMs: 0 });
    localStorage.setItem(STORAGE, JSON.stringify({ playlist, currentIndex: i }));

    // Intro first, then song
    const playSong = () => {
      a.src = `/api/stream/${song.song_id}`;
      a.play().catch(() => {});
      set({ musicPlaying: true, djNarrating: false });
    };

    if (song.introUrl) {
      const ia = ensureAudio().introAudio!;
      ia.pause();
      set({ djNarrating: true });
      ia.src = song.introUrl;
      ia.onended = playSong;
      ia.onerror = playSong;
      ia.play().catch(playSong);
    } else {
      playSong();
    }
  },

  toggleMusic: () => {
    const a = audio; if (!a) return;
    if (get().musicPlaying) { a.pause(); set({ musicPlaying: false }); }
    else if (a.src) { a.play().catch(() => {}); set({ musicPlaying: true }); }
  },

  nextTrack: () => {
    const { playlist, currentIndex } = get();
    if (playlist.length <= 1) return;
    get().playTrack((currentIndex + 1) % playlist.length);
  },

  prevTrack: () => {
    const { playlist, currentIndex } = get();
    if (playlist.length <= 1) return;
    get().playTrack(currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1);
  },

  seekTo: (pct) => { if (audio && audio.duration) audio.currentTime = pct * audio.duration; },
  setVolume: (v) => { set({ volume: v }); if (audio) audio.volume = v; },

  playNarrationThenMusic: (narrationUrl: string, startIndex?: number) => {
    const savedVolume = get().volume;
    if (narrationAudio) {
      narrationAudio.pause();
      narrationAudio.src = '';
    }
    narrationAudio = new Audio(narrationUrl);
    narrationAudio.volume = 1;

    let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
    let fadeInterval: ReturnType<typeof setInterval> | null = null;
    let musicStarted = false;

    const cleanup = () => {
      if (crossfadeTimer) clearTimeout(crossfadeTimer);
      // Don't clear fadeInterval — it continues after narration ends
      narrationAudio = null;
    };

    // Start music 7s before narration ends at volume 0, fade up over 10s
    const startMusicCrossfade = () => {
      if (musicStarted || startIndex === undefined) return;
      musicStarted = true;
      get().playTrack(startIndex);
      if (audio) {
        audio.volume = 0;
        const steps = 40;
        const delta = savedVolume / steps;
        let step = 0;
        fadeInterval = setInterval(() => {
          step++;
          if (audio && step <= steps) {
            audio.volume = Math.min(savedVolume, delta * step);
          } else {
            if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
            set({ djNarrating: false });
          }
        }, 250);
      }
    };

    narrationAudio.onloadedmetadata = () => {
      const dur = narrationAudio?.duration || 0;
      if (dur > 10 && startIndex !== undefined) {
        const delay = Math.max(0, (dur - 7) * 1000);
        crossfadeTimer = setTimeout(startMusicCrossfade, delay);
      }
    };

    narrationAudio.onended = () => {
      if (crossfadeTimer) clearTimeout(crossfadeTimer);
      narrationAudio = null;
      // If narration was too short, start music now; otherwise fade is already running
      if (!musicStarted && startIndex !== undefined) {
        startMusicCrossfade();
      }
    };
    narrationAudio.onerror = () => {
      if (crossfadeTimer) clearTimeout(crossfadeTimer);
      narrationAudio = null;
      if (!musicStarted && startIndex !== undefined) {
        startMusicCrossfade();
      } else {
        set({ djNarrating: false });
      }
    };

    set({ djNarrating: true });
    narrationAudio.play().catch(() => {
      set({ djNarrating: false });
      if (startIndex !== undefined) get().playTrack(startIndex);
    });
  },

  fetchLyric: async (songId) => {
    try {
      const resp = await fetch(`/api/lyric/${songId}`);
      const json = await resp.json();
      set({ lyricLrc: json.lrc || '', lyricKlyric: json.klyric || '' });
    } catch {
      set({ lyricLrc: '', lyricKlyric: '' });
    }
  },

  fetchLikeStatus: async (songId) => {
    try {
      const resp = await fetch(`/api/like/check/${songId}`);
      const json = await resp.json();
      set({ isLiked: json.liked || false });
    } catch {
      set({ isLiked: false });
    }
  },

  toggleLike: async (songId) => {
    const next = !get().isLiked;
    set({ isLiked: next });
    try {
      await fetch(`/api/like/${songId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ like: next }),
      });
    } catch {
      set({ isLiked: !next });
    }
  },
}));
