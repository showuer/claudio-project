export class AudioEngine {
  // Track A: DJ TTS narration
  private ttsAudio: HTMLAudioElement | null = null;
  // Track B: Music
  private musicAudio: HTMLAudioElement | null = null;

  private _onMusicEnded: (() => void) | null = null;
  private _onMusicTime: ((ms: number) => void) | null = null;
  private _onTtsEnded: (() => void) | null = null;
  private _onTtsProgress: ((pct: number) => void) | null = null;

  private musicInterval = 0;
  private ttsInterval = 0;
  private duckingRaf = 0;

  // ═══════════ TRACK A: DJ TTS ═══════════
  playTts(url: string) {
    this.stopTts();
    const a = new Audio(url);
    a.preload = 'auto';
    a.volume = 1.0;
    a.addEventListener('ended', () => this._onTtsEnded?.());
    a.addEventListener('error', () => this._onTtsEnded?.());
    this.ttsAudio = a;

    // Duck music to 20%
    this.duckMusic(0.2);

    a.play().catch(() => this._onTtsEnded?.());

    // Track progress for pipeline prefetch
    this.ttsInterval = window.setInterval(() => {
      if (this.ttsAudio && this.ttsAudio.duration) {
        const pct = this.ttsAudio.currentTime / this.ttsAudio.duration;
        this._onTtsProgress?.(pct);
      }
    }, 200);
  }

  stopTts() {
    clearInterval(this.ttsInterval);
    if (this.ttsAudio) {
      this.ttsAudio.pause();
      this.ttsAudio.src = '';
      this.ttsAudio = null;
    }
    // Restore music volume
    this.unduckMusic();
  }

  get ttsRemaining(): number {
    if (!this.ttsAudio || !this.ttsAudio.duration) return 0;
    return (this.ttsAudio.duration - this.ttsAudio.currentTime) * 1000;
  }

  // ═══════════ TRACK B: MUSIC ═══════════
  loadMusic(url: string) {
    this.stopMusic();
    const a = new Audio(url);
    a.preload = 'auto';
    a.volume = 0.8;
    a.addEventListener('ended', () => this._onMusicEnded?.());
    a.addEventListener('error', () => this._onMusicEnded?.());
    this.musicAudio = a;
  }

  playMusic() {
    if (!this.musicAudio) return;
    this.musicAudio.play().catch(() => {});
    this.musicInterval = window.setInterval(() => {
      if (this.musicAudio) {
        this._onMusicTime?.(this.musicAudio.currentTime * 1000);
      }
    }, 300);
  }

  pauseMusic() {
    this.musicAudio?.pause();
    clearInterval(this.musicInterval);
  }

  switchMusic(url: string) {
    const wasPlaying = this.musicAudio && !this.musicAudio.paused;
    this.stopMusic();
    this.loadMusic(url);
    if (wasPlaying) this.playMusic();
  }

  seekMusic(ms: number) {
    if (this.musicAudio) this.musicAudio.currentTime = ms / 1000;
  }

  private stopMusic() {
    clearInterval(this.musicInterval);
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.src = '';
      this.musicAudio = null;
    }
  }

  // ═══════════ DUCKING ═══════════
  private duckMusic(targetVol: number) {
    cancelAnimationFrame(this.duckingRaf);
    if (!this.musicAudio) return;
    const startVol = this.musicAudio.volume;
    const startTime = performance.now();
    const duration = 400;

    const step = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      this.musicAudio!.volume = startVol + (targetVol - startVol) * eased;
      if (t < 1) this.duckingRaf = requestAnimationFrame(step);
    };
    this.duckingRaf = requestAnimationFrame(step);
  }

  private unduckMusic() {
    cancelAnimationFrame(this.duckingRaf);
    if (!this.musicAudio) return;
    const startVol = this.musicAudio.volume;
    const startTime = performance.now();
    const duration = 600;

    const step = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.musicAudio!.volume = startVol + (0.8 - startVol) * eased;
      if (t < 1) this.duckingRaf = requestAnimationFrame(step);
    };
    this.duckingRaf = requestAnimationFrame(step);
  }

  // ═══════════ LIFECYCLE ═══════════
  get musicProgress(): number { return this.musicAudio?.currentTime ?? 0; }
  get musicDuration(): number { return this.musicAudio?.duration ?? 0; }
  get musicPlaying(): boolean { return !!(this.musicAudio && !this.musicAudio.paused); }
  get ttsPlaying(): boolean { return !!(this.ttsAudio && !this.ttsAudio.paused); }

  set onMusicEnded(fn: () => void) { this._onMusicEnded = fn; }
  set onMusicTime(fn: (ms: number) => void) { this._onMusicTime = fn; }
  set onTtsEnded(fn: () => void) { this._onTtsEnded = fn; }
  set onTtsProgress(fn: (pct: number) => void) { this._onTtsProgress = fn; }

  destroy() {
    this.stopMusic();
    this.stopTts();
    cancelAnimationFrame(this.duckingRaf);
  }
}
