import { create } from 'zustand';

export interface Song {
  song_id: string; song_name: string; artist: string; intro?: string; introUrl?: string;
}

let audio: HTMLAudioElement | null = null;
let introAudio: HTMLAudioElement | null = null;
let progressTimer = 0;
let errorCount = 0;
let fadeInterval: ReturnType<typeof setInterval> | null = null;

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

    const ducked = volume * 0.2;

    const trackPlay = () => {
      fetch('/api/plays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.song_id, songName: song.song_name, artist: song.artist }),
      }).catch(() => {});
    };

    const playSong = async () => {
      try {
        const resp = await fetch(`/api/player/url/${song.song_id}`);
        const { url } = await resp.json();
        a.src = url || `/api/stream/${song.song_id}`;
      } catch {
        a.src = `/api/stream/${song.song_id}`;
      }
      a.play().catch(() => {});
      set({ musicPlaying: true, djNarrating: false });
      trackPlay();
    };

    if (song.introUrl) {
      const ia = ensureAudio().introAudio!;
      ia.pause();
      set({ djNarrating: true });
      ia.src = song.introUrl;

      let introDone = false;
      let musicReady = false;

      // Fetch and start music immediately at ducked volume during intro
      const loadAndPlay = async () => {
        try {
          const resp = await fetch(`/api/player/url/${song.song_id}`);
          const { url } = await resp.json();
          a.src = url || `/api/stream/${song.song_id}`;
        } catch {
          a.src = `/api/stream/${song.song_id}`;
        }
        musicReady = true;
        if (!introDone) {
          a.volume = 0;
          a.play().catch(() => {});
          fadeMusicTo(ducked, 500);
          set({ musicPlaying: true });
          trackPlay();
        }
      };

      const onIntroDone = () => {
        introDone = true;
        if (musicReady) {
          fadeMusicTo(volume, 3000, () => set({ djNarrating: false }));
        } else {
          playSong();
        }
      };

      ia.onended = onIntroDone;
      ia.onerror = onIntroDone;
      ia.play().catch(onIntroDone);
      loadAndPlay();
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
    let musicStarted = false;

    const duckRatio = 0.2;
    const duckedVolume = savedVolume * duckRatio;

    // Start music 7s before narration ends at volume 0, fade up to ducked volume while narrating
    const startMusicCrossfade = () => {
      if (musicStarted || startIndex === undefined) return;
      musicStarted = true;
      // Opening narration serves as intro for the first track — skip per-song intro
      const firstSong = get().playlist[startIndex];
      const savedIntro = firstSong?.introUrl;
      if (firstSong && savedIntro) {
        firstSong.introUrl = '';
      }
      get().playTrack(startIndex);
      if (firstSong && savedIntro) {
        firstSong.introUrl = savedIntro;
      }
      if (audio) {
        audio.volume = 0;
        fadeMusicTo(duckedVolume, 3000);
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
      if (!musicStarted && startIndex !== undefined) {
        // Narration too short — start music directly, opening is the intro
        musicStarted = true;
        const firstSong = get().playlist[startIndex];
        const savedIntro = firstSong?.introUrl;
        if (firstSong && savedIntro) firstSong.introUrl = '';
        get().playTrack(startIndex);
        if (firstSong && savedIntro) firstSong.introUrl = savedIntro;
        if (audio) {
          audio.volume = 0;
          fadeMusicTo(savedVolume, 3000, () => set({ djNarrating: false }));
        } else {
          set({ djNarrating: false });
        }
      } else if (musicStarted && audio) {
        // Music is at ducked volume — fade up to full
        fadeMusicTo(savedVolume, 3000, () => set({ djNarrating: false }));
      } else {
        set({ djNarrating: false });
      }
    };
    narrationAudio.onerror = () => {
      if (crossfadeTimer) clearTimeout(crossfadeTimer);
      narrationAudio = null;
      if (!musicStarted && startIndex !== undefined) {
        musicStarted = true;
        const firstSong = get().playlist[startIndex];
        const savedIntro = firstSong?.introUrl;
        if (firstSong && savedIntro) firstSong.introUrl = '';
        get().playTrack(startIndex);
        if (firstSong && savedIntro) firstSong.introUrl = savedIntro;
        if (audio) {
          audio.volume = 0;
          fadeMusicTo(savedVolume, 2000, () => set({ djNarrating: false }));
        } else {
          set({ djNarrating: false });
        }
      } else if (musicStarted && audio) {
        fadeMusicTo(savedVolume, 2000, () => set({ djNarrating: false }));
      } else {
        set({ djNarrating: false });
      }
    };

    set({ djNarrating: true });
    // Duck currently playing music immediately when narration starts
    if (audio && !audio.paused && startIndex !== undefined) {
      fadeMusicTo(duckedVolume, 500);
    }
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
