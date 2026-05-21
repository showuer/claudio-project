import { create } from 'zustand';

export interface Song {
  song_id: string; song_name: string; artist: string; intro?: string; introUrl?: string;
}

let audio: HTMLAudioElement | null = null;
let introAudio: HTMLAudioElement | null = null;
let progressTimer = 0;
let errorCount = 0;
let fadeInterval: ReturnType<typeof setInterval> | null = null;
let playbackSession = 0;
let narrationSession = 0;
let narrationTimer: ReturnType<typeof setInterval> | null = null;
let narrationAudio: HTMLAudioElement | null = null;
let pendingPlaylistIntroUrl = '';
let pendingPlaylistStartIndex = -1;

function getMusicStreamUrl(songId: string) {
  return `/api/stream/${encodeURIComponent(songId)}`;
}

function withoutSongIntro(song: Song): Song {
  return { ...song, intro: '', introUrl: '' };
}

function fadeMusicTo(target: number, durationMs: number, onDone?: () => void) {
  if (!audio) return;
  if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
  const startVol = audio.volume;
  const steps = Math.round(durationMs / 250);
  if (steps <= 0) {
    audio.volume = target;
    onDone?.();
    return;
  }
  const delta = (target - startVol) / steps;
  let step = 0;
  fadeInterval = setInterval(() => {
    step++;
    if (audio && step <= steps) {
      audio.volume = Math.min(1, Math.max(0, startVol + delta * step));
    } else {
      if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
      if (audio) audio.volume = target;
      onDone?.();
    }
  }, 250);
}

function ensureAudio() {
  if (!audio) {
    audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.volume = 0.72;
    audio.addEventListener('error', () => {
      errorCount++;
      usePlayerStore.setState({ musicPlaying: false });
    });
    audio.addEventListener('ended', () => {
      usePlayerStore.getState().nextTrack();
    });
  }
  if (!introAudio) {
    introAudio = new Audio();
    introAudio.crossOrigin = 'anonymous';
    introAudio.volume = 1;
  }
  return { audio, introAudio };
}

export function getMusicAudioElement(): HTMLAudioElement | null {
  return ensureAudio().audio;
}

export function getNarrationAudioElement(): HTMLAudioElement | null {
  return narrationAudio;
}

function stopNarrationAudio(clearState = true) {
  narrationSession++;
  if (narrationTimer) {
    clearInterval(narrationTimer);
    narrationTimer = null;
  }
  if (narrationAudio) {
    narrationAudio.pause();
    narrationAudio.src = '';
    if (clearState) narrationAudio = null;
  }
  if (clearState) {
    usePlayerStore.setState({
      narrationUrl: '',
      narrationTimeMs: 0,
      narrationDurationMs: 0,
      narrationPlaying: false,
      djNarrating: false,
    });
  }
}

function startNarrationClock(session: number) {
  if (narrationTimer) clearInterval(narrationTimer);
  narrationTimer = setInterval(() => {
    if (session !== narrationSession || !narrationAudio) return;
    usePlayerStore.setState({
      narrationTimeMs: (narrationAudio.currentTime || 0) * 1000,
      narrationDurationMs: (narrationAudio.duration || 0) * 1000,
      narrationPlaying: !narrationAudio.paused,
    });
  }, 100);
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
  narrationUrl: string;
  narrationTimeMs: number;
  narrationDurationMs: number;
  narrationPlaying: boolean;

  setPlaylist: (s: Song[]) => void;
  queuePlaylist: (s: Song[], narrationUrl?: string) => void;
  playTrack: (i: number, options?: { skipIntro?: boolean; keepNarration?: boolean }) => void;
  toggleMusic: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (pct: number) => void;
  setVolume: (v: number) => void;
  preparePlayback: () => void;
  playNarrationThenMusic: (narrationUrl: string, startIndex?: number) => void;
  toggleNarration: () => void;
  stopNarration: () => void;
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
  volume: 0.72,
  lyricLrc: '',
  lyricKlyric: '',
  isLiked: false,
  narrationUrl: '',
  narrationTimeMs: 0,
  narrationDurationMs: 0,
  narrationPlaying: false,

  init: () => {
    ensureAudio();
    startProgress();
  },

  setPlaylist: (songs) => {
    const nextSongs = songs.map(withoutSongIntro);
    pendingPlaylistIntroUrl = '';
    pendingPlaylistStartIndex = -1;
    set({ playlist: nextSongs, currentIndex: 0, musicPlaying: false, progressMs: 0 });
    localStorage.setItem(STORAGE, JSON.stringify({ playlist: nextSongs, currentIndex: 0 }));
  },

  queuePlaylist: (songs, narrationUrl = '') => {
    const { playlist, currentIndex } = get();
    const currentSong = playlist[currentIndex];
    const nextSongs = songs.map(withoutSongIntro);
    const isCurrentSongPlaying = !!currentSong && !!audio && !audio.paused;

    if (isCurrentSongPlaying) {
      const merged = [withoutSongIntro(currentSong), ...nextSongs.filter((song) => song.song_id !== currentSong.song_id)];
      pendingPlaylistIntroUrl = narrationUrl;
      pendingPlaylistStartIndex = merged.length > 1 ? 1 : -1;
      set({ playlist: merged, currentIndex: 0 });
      localStorage.setItem(STORAGE, JSON.stringify({ playlist: merged, currentIndex: 0 }));
      return;
    }

    get().setPlaylist(nextSongs);
    if (!nextSongs.length) return;
    if (narrationUrl) {
      get().playNarrationThenMusic(narrationUrl, 0);
    } else {
      get().playTrack(0);
    }
  },

  playTrack: (i, options = {}) => {
    const { playlist, volume } = get();
    if (i < 0 || i >= playlist.length) return;
    const session = ++playbackSession;
    const song = playlist[i];
    const { audio: a, introAudio: ia } = ensureAudio();
    a.volume = volume;
    a.pause();
    if (!options.keepNarration) stopNarrationAudio();
    ia.pause();
    ia.src = '';
    ia.onended = null;
    ia.onerror = null;

    errorCount = 0;
    set({ currentIndex: i, musicPlaying: false, progressMs: 0 });
    localStorage.setItem(STORAGE, JSON.stringify({ playlist, currentIndex: i }));

    const trackPlay = () => {
      fetch('/api/plays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.song_id, songName: song.song_name, artist: song.artist }),
      }).catch(() => {});
    };

    const playSong = async () => {
      if (session !== playbackSession) return;
      const url = getMusicStreamUrl(song.song_id);
      a.src = url;
      a.play().catch(() => {});
      set({ musicPlaying: true, djNarrating: false });
      trackPlay();
    };

    playSong();
  },

  toggleMusic: () => {
    const a = audio; if (!a) return;
    if (get().musicPlaying) { a.pause(); set({ musicPlaying: false }); }
    else if (a.src) { a.play().catch(() => {}); set({ musicPlaying: true }); }
  },

  nextTrack: () => {
    const { playlist, currentIndex } = get();
    if (playlist.length <= 1) return;
    if (pendingPlaylistStartIndex >= 0) {
      const startIndex = pendingPlaylistStartIndex;
      const introUrl = pendingPlaylistIntroUrl;
      pendingPlaylistIntroUrl = '';
      pendingPlaylistStartIndex = -1;
      if (introUrl) {
        get().playNarrationThenMusic(introUrl, startIndex);
      } else {
        get().playTrack(startIndex);
      }
      return;
    }
    get().playTrack((currentIndex + 1) % playlist.length);
  },

  prevTrack: () => {
    const { playlist, currentIndex } = get();
    if (playlist.length <= 1) return;
    get().playTrack(currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1);
  },

  seekTo: (pct) => { if (audio && audio.duration) audio.currentTime = pct * audio.duration; },
  setVolume: (v) => { set({ volume: v }); if (audio) audio.volume = v; },

  preparePlayback: () => {
    const { audio: a, introAudio: ia } = ensureAudio();
    a.load();
    ia.load();
    if (!narrationAudio) {
      narrationAudio = new Audio();
      narrationAudio.volume = 1;
    }
    narrationAudio.load();
  },

  playNarrationThenMusic: (narrationUrl: string, startIndex?: number) => {
    const savedVolume = get().volume;
    const { introAudio: ia } = ensureAudio();
    ia.pause();
    ia.src = '';
    ia.onended = null;
    ia.onerror = null;

    if (narrationAudio && narrationAudio.src.endsWith(narrationUrl) && !narrationAudio.paused) {
      return;
    }
    stopNarrationAudio(false);
    narrationAudio = narrationAudio || new Audio();
    narrationAudio.src = narrationUrl;
    narrationAudio.volume = 1;
    const session = ++narrationSession;

    let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
    let musicStarted = false;

    const duckRatio = 0.05;
    const duckedVolume = savedVolume * duckRatio;

    // Start music 7s before narration ends at volume 0, fade up to ducked volume while narrating
    const startMusicCrossfade = () => {
      if (musicStarted || startIndex === undefined) return;
      musicStarted = true;
      get().playTrack(startIndex, { skipIntro: true, keepNarration: true });
      if (audio) {
        audio.volume = 0;
        fadeMusicTo(duckedVolume, 3000);
      }
    };

    narrationAudio.onloadedmetadata = () => {
      if (session !== narrationSession) return;
      const dur = narrationAudio?.duration || 0;
      set({ narrationDurationMs: dur * 1000 });
      if (dur > 10 && startIndex !== undefined) {
        const delay = Math.max(0, (dur - 7) * 1000);
        crossfadeTimer = setTimeout(startMusicCrossfade, delay);
      }
    };

    narrationAudio.onended = () => {
      if (session !== narrationSession) return;
      if (crossfadeTimer) clearTimeout(crossfadeTimer);
      if (narrationTimer) {
        clearInterval(narrationTimer);
        narrationTimer = null;
      }
      narrationAudio = null;
      if (!musicStarted && startIndex !== undefined) {
        // Narration too short — start music directly, opening is the intro
        musicStarted = true;
        get().playTrack(startIndex, { skipIntro: true, keepNarration: true });
        if (audio) {
          audio.volume = 0;
          fadeMusicTo(savedVolume, 3000, () => set({ djNarrating: false, narrationPlaying: false }));
        } else {
          set({ djNarrating: false, narrationPlaying: false });
        }
      } else if (musicStarted && audio) {
        // Music is at ducked volume — fade up to full
        fadeMusicTo(savedVolume, 3000, () => set({ djNarrating: false, narrationPlaying: false }));
      } else if (audio && !audio.paused) {
        fadeMusicTo(savedVolume, 3000, () => set({ djNarrating: false, narrationPlaying: false }));
      } else {
        set({ djNarrating: false, narrationPlaying: false });
      }
    };
    narrationAudio.onerror = () => {
      if (session !== narrationSession) return;
      if (crossfadeTimer) clearTimeout(crossfadeTimer);
      if (narrationTimer) {
        clearInterval(narrationTimer);
        narrationTimer = null;
      }
      narrationAudio = null;
      if (!musicStarted && startIndex !== undefined) {
        musicStarted = true;
        get().playTrack(startIndex, { skipIntro: true, keepNarration: true });
        if (audio) {
          audio.volume = 0;
          fadeMusicTo(savedVolume, 2000, () => set({ djNarrating: false, narrationPlaying: false }));
        } else {
          set({ djNarrating: false, narrationPlaying: false });
        }
      } else if (musicStarted && audio) {
        fadeMusicTo(savedVolume, 2000, () => set({ djNarrating: false, narrationPlaying: false }));
      } else if (audio && !audio.paused) {
        fadeMusicTo(savedVolume, 2000, () => set({ djNarrating: false, narrationPlaying: false }));
      } else {
        set({ djNarrating: false, narrationPlaying: false });
      }
    };

    set({ djNarrating: true, narrationUrl, narrationTimeMs: 0, narrationDurationMs: 0, narrationPlaying: true });
    startNarrationClock(session);
    // Duck currently playing music immediately when narration starts
    if (audio && !audio.paused) {
      fadeMusicTo(duckedVolume, 500);
    }
    narrationAudio.play().catch(() => {
      if (session !== narrationSession) return;
      set({ djNarrating: false, narrationPlaying: false });
      if (startIndex !== undefined) get().playTrack(startIndex, { skipIntro: true });
    });
  },

  toggleNarration: () => {
    if (!narrationAudio) return;
    if (narrationAudio.paused) {
      narrationAudio.play().catch(() => {});
      set({ narrationPlaying: true, djNarrating: true });
    } else {
      narrationAudio.pause();
      set({ narrationPlaying: false });
    }
  },

  stopNarration: () => stopNarrationAudio(),

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
    // Get song info from current playlist for local save + taste update
    const song = get().playlist.find((s) => s.song_id === songId);
    try {
      await fetch(`/api/like/${songId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          like: next,
          songName: song?.song_name || '',
          artist: song?.artist || '',
        }),
      });
    } catch {
      set({ isLiked: !next });
    }
  },
}));
