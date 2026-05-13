import { create } from 'zustand';

export interface Song {
  song_id: string; song_name: string; artist: string; intro?: string; introUrl?: string;
}

let audio: HTMLAudioElement | null = null;
let introAudio: HTMLAudioElement | null = null;
let progressTimer = 0;

function ensureAudio() {
  if (!audio) {
    audio = new Audio();
    audio.volume = 0.7;
    audio.addEventListener('error', () => usePlayerStore.getState().nextTrack());
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

interface PlayerState {
  playlist: Song[];
  currentIndex: number;
  musicPlaying: boolean;
  progressMs: number;
  durationMs: number;
  djNarrating: boolean;
  volume: number;

  setPlaylist: (s: Song[]) => void;
  playTrack: (i: number) => void;
  toggleMusic: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (pct: number) => void;
  setVolume: (v: number) => void;
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
      set({ djNarrating: true });
      ia.src = song.introUrl;
      ia.onended = playSong;
      ia.onerror = playSong;
      ia.play().catch(playSong);
      audio!.volume = volume * 0.3; // duck during intro
      audio!.play().catch(() => {}); // keep playing current if there is one
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
}));
