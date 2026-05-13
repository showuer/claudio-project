type Song = { song_id: string; song_name: string; artist: string; url: string; duration_ms: number };
type Listener = () => void;

class GlobalMusicController {
  private ttsAudio: HTMLAudioElement | null = null;
  private musicAudio: HTMLAudioElement | null = null;
  private _playlist: Song[] = [];
  private _currentIndex = -1;
  private _musicPlaying = false;
  private _progress = 0;
  private _duration = 240;
  private _djNarrating = false;

  private stateListeners = new Set<Listener>();
  private progressListeners = new Set<Listener>();
  private musicInterval = 0;
  private _switching = false; // prevent race conditions during track switch
  private STORAGE_KEY = 'claudio_playlist';
  private _instanceId = 0; // increment on each load to invalidate stale callbacks

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this._playlist = data.playlist || [];
        this._currentIndex = data.currentIndex ?? -1;
      }
    } catch { /* */ }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        playlist: this._playlist, currentIndex: this._currentIndex,
      }));
    } catch { /* */ }
  }

  get playlist(): Song[] { return this._playlist; }
  get currentIndex(): number { return this._currentIndex; }
  get musicPlaying(): boolean { return this._musicPlaying; }
  get progress(): number { return this._progress; }
  get duration(): number { return this._duration; }
  get ttsActive(): boolean { return !!(this.ttsAudio && !this.ttsAudio.paused); }
  get djNarrating(): boolean { return this._djNarrating; }
  get currentSong(): Song | null { return this._playlist[this._currentIndex] || null; }

  subscribe(fn: Listener) { this.stateListeners.add(fn); return () => this.stateListeners.delete(fn); }
  subscribeProgress(fn: Listener) { this.progressListeners.add(fn); return () => this.progressListeners.delete(fn); }

  private notifyState() { this.stateListeners.forEach((fn) => fn()); }
  private notifyProgress() { this.progressListeners.forEach((fn) => fn()); }

  // ═══════════ TRACK A: TTS ═══════════
  playTts(url: string) {
    this.stopTts();
    this._djNarrating = true;
    this.notifyState();
    if (this.musicAudio) this.fadeVolume(this.musicAudio, 0.2, 400);

    const a = new Audio(url);
    a.preload = 'auto';
    a.volume = 1;
    const id = ++this._instanceId;
    const done = () => { if (id === this._instanceId) this.onTtsEnded(); };
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('error', done, { once: true });
    this.ttsAudio = a;
    a.play().catch(() => done());
  }

  private stopTts() {
    if (this.ttsAudio) {
      this.ttsAudio.pause();
      this.ttsAudio.src = '';
      this.ttsAudio = null;
    }
  }

  private onTtsEnded() {
    this.stopTts();
    this._djNarrating = false;
    if (this.musicAudio) this.fadeVolume(this.musicAudio, 0.8, 600);
    // Auto-play song at current position
    if (this._playlist.length > 0) {
      const idx = this._currentIndex >= 0 ? this._currentIndex : 0;
      this.playTrackInternal(idx);
    }
    this.notifyState();
  }

  // ═══════════ TRACK B: MUSIC ═══════════
  setPlaylist(songs: Song[]) {
    this._switching = true;
    this._playlist = songs;
    this._currentIndex = 0;
    this._progress = 0;
    this._musicPlaying = false;
    this.saveToStorage();
    this.notifyState();

    if (songs.length > 0) {
      this.loadAudio(songs[0].url);
    }
    this._switching = false;
  }

  private loadAudio(url: string) {
    this.stopAudio();
    const a = new Audio(url);
    a.preload = 'auto';
    a.volume = 0.8;
    const id = ++this._instanceId;
    const onEnd = () => { if (id === this._instanceId && !this._switching) this.nextTrack(); };
    const onErr = () => { if (id === this._instanceId && !this._switching) this.nextTrack(); };
    a.addEventListener('ended', onEnd, { once: true });
    a.addEventListener('error', onErr, { once: true });
    this.musicAudio = a;
    this._duration = 240;

    clearInterval(this.musicInterval);
    this.musicInterval = window.setInterval(() => {
      if (this.musicAudio && !this.musicAudio.paused) {
        this._progress = this.musicAudio.currentTime;
        this._duration = this.musicAudio.duration || 240;
        this.notifyProgress();
      }
    }, 250);
  }

  private stopAudio() {
    clearInterval(this.musicInterval);
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.src = '';
      this.musicAudio = null;
    }
  }

  playTrack(index: number) {
    this.playTrackInternal(index);
  }

  private playTrackInternal(index: number) {
    if (index < 0 || index >= this._playlist.length) return;
    const song = this._playlist[index];
    const sameTrack = index === this._currentIndex;
    this._currentIndex = index;
    this._progress = 0;
    this._duration = song.duration_ms / 1000;
    this.saveToStorage();
    this.notifyState();

    if (!sameTrack) {
      this.loadAudio(song.url);
    }

    setTimeout(() => {
      if (this.musicAudio && index === this._currentIndex) {
        this.musicAudio.play().catch(() => {});
        this._musicPlaying = true;
        this.notifyState();
      }
    }, 100);
  }

  toggleMusic() {
    if (!this.musicAudio) return;
    if (this._musicPlaying) {
      this.musicAudio.pause();
      this._musicPlaying = false;
    } else {
      this.musicAudio.play().catch(() => {});
      this._musicPlaying = true;
    }
    this.notifyState();
  }

  nextTrack() {
    if (this._playlist.length === 0) return;
    const next = (this._currentIndex + 1) % this._playlist.length;
    this.playTrackInternal(next);
  }

  prevTrack() {
    if (this._playlist.length === 0) return;
    const prev = this._currentIndex <= 0 ? this._playlist.length - 1 : this._currentIndex - 1;
    this.playTrackInternal(prev);
  }

  seekTo(pct: number) {
    if (this.musicAudio && this.musicAudio.duration) {
      this.musicAudio.currentTime = pct * this.musicAudio.duration;
      this._progress = this.musicAudio.currentTime;
      this.notifyProgress();
    }
  }

  setVolume(vol: number) {
    if (this.musicAudio) this.musicAudio.volume = Math.max(0, Math.min(1, vol));
  }

  private fadeVolume(audio: HTMLAudioElement, target: number, ms: number) {
    const start = audio.volume;
    const startTime = performance.now();
    const step = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = start + (target - start) * eased;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  destroy() {
    this.stopTts();
    this.stopAudio();
    this.stateListeners.clear();
    this.progressListeners.clear();
  }
}

export const globalMusic = new GlobalMusicController();
