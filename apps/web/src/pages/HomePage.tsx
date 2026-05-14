import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore, Song } from '../stores/playerStore';
import { useChatStore } from '../stores/chatStore';
import { wsClient } from '../api/ws';
import { DotMatrixClock } from '../components/DotMatrixDisplay';
import { ProfileCard } from '../components/ProfileCard';

const AI_AVATAR = '/avatars/claude.png';
const USER_AVATAR = '/avatars/me.png';
const TAGS = ['MORNING', 'CODING', 'NAP', 'RAIN', 'RELAX', 'QUIET'];
const AIDJ_TAG = 'AIDJ';

export default function HomePage() {
  const p = usePlayerStore((s) => s);
  const c = useChatStore((s) => s);

  const [input, setInput] = useState('');
  const [time, setTime] = useState(new Date());
  const [queueOpen, setQueueOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('claudio-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('claudio-theme', theme);
    document.querySelector('.card')?.setAttribute('data-theme', theme);
  }, [theme]);
  const chatRef = useRef<HTMLDivElement>(null);
  const ttsRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    p.init();
    c.loadHistory();
    wsClient.connect();

    wsClient.on('dj_message', (data: any) => {
      c.addMessage({
        id: data.id || crypto.randomUUID(), role: 'dj', content: data.say,
        ttsUrl: data.ttsUrl, status: 'done', played: false, timestamp: new Date().toISOString(),
      });

      if (data.songs?.length) {
        const songs = data.songs.map((s: any) => ({
          song_id: s.id, song_name: s.name, artist: s.artist,
          intro: s.intro || '', introUrl: data.songIntros?.[s.id] || '',
        }));
        p.setPlaylist(songs);
        setQueueOpen(true);

        if (data.ttsUrl) {
          p.playNarrationThenMusic(data.ttsUrl, 0);
        } else {
          p.playTrack(0);
        }
      }
      else if (data.play?.length) {
        p.setPlaylist(data.play.map((s: any) => ({
          song_id: s.id, song_name: s.name, artist: s.artist,
        })));
        setQueueOpen(true);
        if (data.ttsUrl) {
          p.playNarrationThenMusic(data.ttsUrl, 0);
        } else {
          p.playTrack(0);
        }
      }
    });
    return () => { wsClient.disconnect(); window.speechSynthesis.cancel(); };
  }, []);

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [c.messages]);

  const send = useCallback(() => {
    const t = input.trim(); if (!t || c.isStreaming) return;
    setInput(''); c.sendMessage(t);
  }, [input, c.isStreaming]);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.start();
    setListening(true);
  }, [listening]);

  const song = p.playlist.length && p.currentIndex >= 0 && p.currentIndex < p.playlist.length
    ? p.playlist[p.currentIndex] : null;
  const active = p.musicPlaying || p.djNarrating;
  const pct = p.durationMs > 0 ? (p.progressMs / p.durationMs) * 100 : 0;

  const wd = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  const msgs = c.messages.map((m: any) => {
    if (m.role === 'dj' && m.content?.includes('{') && m.status !== 'done') {
      const m2 = m.content.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      return { ...m, content: m2 ? m2[1] : '...' };
    }
    return m;
  });

  return (
    <>
      <audio ref={ttsRef} preload="auto" style={{ display: 'none' }} />

      {/* 1. HEADER — CLAUDIO brand + avatar + status */}
      <div className="page-header">
        <ProfileCard open={profileOpen} onToggle={setProfileOpen} />
        <div className="header-right">
          <div className="theme-switch">
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>DARK</button>
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>LIGHT</button>
          </div>
          <span className={`header-status ${active ? 'live' : ''}`}>
            <span className={`onair-dot ${active ? '' : 'off'}`} />
            {active ? 'ON AIR' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* 2. HERO CLOCK — giant, centered, ~40% height */}
      <div className="hero">
        <div className="hero-time">
          <DotMatrixClock value={time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })} />
        </div>
        <div className="hero-date">
          {wd[time.getDay()]} {String(time.getDate()).padStart(2,'0')} {mo[time.getMonth()]} {time.getFullYear()}
        </div>
      </div>

      {/* 3. PLAYER */}
      <div className="player-strip">
        <div className="eq-bars" style={{ opacity: p.musicPlaying ? 1 : 0.25 }}>
          <div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" />
        </div>
        <div className="player-meta">
          <div className="player-title">
            <span className="player-song">{song?.song_name || 'STANDBY'}</span>
            {song?.artist && <span className="player-artist"> — {song.artist}</span>}
          </div>
          <div className={`player-sub ${p.musicPlaying ? 'live' : ''}`}>
            {p.musicPlaying ? 'PLAYING' : p.djNarrating ? 'INTRO' : 'PAUSED'}
          </div>
        </div>
        <button className="btn-c" onClick={p.prevTrack}>&#9664;&#9664;</button>
        <button className={`btn-c ${p.musicPlaying ? 'active' : ''}`} onClick={p.toggleMusic}>
          {p.musicPlaying ? '||' : '▶'}
        </button>
        <button className="btn-c" onClick={p.nextTrack}>&#9654;&#9654;</button>
        <span className="vol-label">VOL</span>
        <div className="vol-track" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          p.setVolume((e.clientX - r.left) / r.width);
        }}>
          <div className="vol-fill" style={{ width: `${p.volume * 100}%` }} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-line" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          p.seekTo((e.clientX - r.left) / r.width);
        }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-times">
          <span>{Math.floor(p.progressMs / 60000)}:{String(Math.floor(p.progressMs % 60000 / 1000)).padStart(2, '0')}</span>
          <span>{Math.floor(p.durationMs / 60000)}:{String(Math.floor(p.durationMs % 60000 / 1000)).padStart(2, '0')}</span>
        </div>
      </div>

      {/* 4. QUEUE BAR */}
      <div className={`queue-bar ${queueOpen ? 'queue-bar--open' : ''}`}
        onClick={() => setQueueOpen(o => !o)}>
        <span>QUEUE</span>
        <span>{p.playlist.length} TRACKS {queueOpen ? '▲' : '▼'}</span>
      </div>
      {queueOpen && (
        <div className="queue-list">
          {p.playlist.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, fontFamily: 'var(--font-mono)', fontSize: 9, color: '#777', letterSpacing: '1.5px' }}>
              SAY SOMETHING TO THE DJ
            </div>
          ) : (
            p.playlist.map((s: Song, i: number) => (
              <div key={`q-${s.song_id}-${i}`}
                className={`queue-row ${i === p.currentIndex ? 'current' : ''}`}
                onClick={(e) => { e.stopPropagation(); p.playTrack(i); }}>
                <span className="queue-idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="queue-name">{s.song_name}</span>
                <span className="queue-artist">{s.artist}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 5. CHAT — CLAUDIO bar + messages + input */}
      <div className="chat-section">
        <div className="chat-bar">
          <div className="chat-bar-left">
            <span className={`chat-bar-dot ${active ? '' : ''}`} style={active ? {} : { background: '#555', boxShadow: 'none', animation: 'none' }} />
            <span>Claudio</span>
          </div>
          <span className={`chat-bar-status ${p.djNarrating ? 'live' : ''}`}>
            {p.djNarrating ? 'SPEAKING' : 'LIVE'}
          </span>
        </div>

        <div className="chat-msgs" ref={chatRef}>
          {msgs.slice(-8).map((m: any) => (
            <div key={m.id} className={`chat-msg ${m.role === 'user' ? 'user' : ''}`}>
              <div className="chat-av"
                onClick={() => { if (m.role === 'dj') setProfileOpen(true); }}
                style={{ cursor: m.role === 'dj' ? 'pointer' : 'default' }}>
                <img src={m.role === 'user' ? USER_AVATAR : AI_AVATAR} alt="" />
              </div>
              <div className="chat-body">
                <div className="chat-name">
                  {m.role === 'user' ? 'YOU' : 'CLAUDIO'}
                </div>
                <div className="chat-bubble">
                  {m.status === 'thinking' ? (
                    <span className="thinking-indicator">[THINKING]</span>
                  ) : m.content || (m.status === 'streaming' ? <span className="thinking-indicator">[...]</span> : '')}
                </div>
                {m.role === 'dj' && m.ttsUrl && m.status === 'done' && (
                  <button className="btn-replay" onClick={() => {
                    p.playNarrationThenMusic(m.ttsUrl!);
                  }}>REPLAY</button>
                )}
                <div className="chat-time">
                  {new Date(m.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="chat-input-bar">
          <div className="chat-tags">
            <button key={AIDJ_TAG} className="chip aidj" onClick={() => c.sendAidj('来点音乐')} disabled={c.isStreaming} style={{ background: 'rgba(255,255,255,0.12)' }}>{AIDJ_TAG}</button>
            {TAGS.map((t) => (
              <button key={t} className="chip" onClick={() => c.sendMessage(t)} disabled={c.isStreaming}>{t}</button>
            ))}
          </div>
          <div className="chat-input-row">
            <input className="chat-input" placeholder={listening ? 'Listening...' : 'Say something to the DJ...'}
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
              disabled={c.isStreaming || listening} />
            <button className={`btn-mic ${listening ? 'btn-mic--active' : ''}`} onClick={toggleVoice} type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </button>
            <button className="btn-send" onClick={send} disabled={c.isStreaming}>&uarr;</button>
          </div>
        </div>
      </div>

      {/* 6. FOOTER */}
      <div className="page-footer">
        <span>CLAUDIO FM</span>
        <span>CONNECTED</span>
      </div>
    </>
  );
}
