import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore, Song } from '../stores/playerStore';
import { useChatStore } from '../stores/chatStore';
import { wsClient } from '../api/ws';

const TAGS = ['MORNING', 'CODING', 'NAP', 'RAIN', 'RELAX', 'QUIET'];

export default function HomePage() {
  const p = usePlayerStore((s) => s);
  const c = useChatStore((s) => s);

  const [input, setInput] = useState('');
  const [time, setTime] = useState(new Date());
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

      // New format: songs[] with intro, songIntros map
      if (data.songs?.length) {
        const songs = data.songs.map((s: any) => ({
          song_id: s.id, song_name: s.name, artist: s.artist,
          intro: s.intro || '', introUrl: data.songIntros?.[s.id] || '',
        }));
        p.setPlaylist(songs);

        // Play opening narration
        if (data.ttsUrl && ttsRef.current) {
          ttsRef.current.src = data.ttsUrl;
          ttsRef.current.play().catch(() => {});
          usePlayerStore.setState({ djNarrating: true });
          ttsRef.current.onended = () => {
            usePlayerStore.setState({ djNarrating: false });
            p.playTrack(0);
          };
        } else {
          p.playTrack(0);
        }
      }
      // Old format fallback: play[]
      else if (data.play?.length) {
        p.setPlaylist(data.play.map((s: any) => ({
          song_id: s.id, song_name: s.name, artist: s.artist,
        })));
        if (data.ttsUrl && ttsRef.current) {
          ttsRef.current.src = data.ttsUrl;
          ttsRef.current.play().catch(() => {});
          usePlayerStore.setState({ djNarrating: true });
          ttsRef.current.onended = () => {
            usePlayerStore.setState({ djNarrating: false });
            p.playTrack(0);
          };
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

      {/* 1. HEADER */}
      <div className="page-header">
        <div className="page-logo">CLAUDIO</div>
      </div>

      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 2. HERO CLOCK — dot matrix font, 1.5x bigger */}
        <div className="hero">
          <div className="hero-time" style={{ fontSize: 96 }}>
            {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
          <div className="hero-date-day">{wd[time.getDay()]}</div>
          <div className="hero-date-full">{time.getDate()} {mo[time.getMonth()]} {time.getFullYear()}</div>
          <div className="onair-row">
            <div className={`onair-dot ${active ? '' : 'off'}`} />
            <span className={`onair-txt ${active ? 'live' : 'off'}`}>
              {active ? 'ON AIR' : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* 3. PLAYER — glassmorphism + glow + stable grid */}
        <div className="player-panel">
          <div className="player-grid">
            <div className="player-left">
              <div className="eq-bars" style={{ opacity: p.musicPlaying ? 1 : 0.25 }}>
                <div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" />
              </div>
              <div className="player-meta">
                <div className="player-title">{song?.song_name || 'STANDBY'}</div>
                <div className={`player-sub ${p.musicPlaying ? 'live' : ''}`}>
                  {p.musicPlaying ? 'PLAYING' : p.djNarrating ? 'INTRO' : 'PAUSED'}
                </div>
              </div>
            </div>

            <div className="player-center">
              <button className="btn-c" onClick={p.prevTrack}>&#9664;&#9664;</button>
              <button className={`btn-c ${p.musicPlaying ? 'active' : ''}`} onClick={p.toggleMusic}>
                {p.musicPlaying ? '||' : '▶'}
              </button>
              <button className="btn-c" onClick={p.nextTrack}>&#9654;&#9654;</button>
            </div>

            <div className="player-right">
              <span className="vol-label">VOL</span>
              <div className="vol-track" onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                p.setVolume((e.clientX - r.left) / r.width);
              }}>
                <div className="vol-fill" style={{ width: `${p.volume * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="progress-row">
            <div className="progress-line" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              p.seekTo((e.clientX - r.left) / r.width);
            }}>
              <div className="progress-fill" style={{ width: `${pct}%`, boxShadow: '0 0 8px rgba(0,255,65,0.3)' }} />
            </div>
            <div className="progress-times">
              <span>{Math.floor(p.progressMs / 60000)}:{String(Math.floor(p.progressMs % 60000 / 1000)).padStart(2, '0')}</span>
              <span>{Math.floor(p.durationMs / 60000)}:{String(Math.floor(p.durationMs % 60000 / 1000)).padStart(2, '0')}</span>
            </div>
          </div>
        </div>

        {/* 4. QUEUE */}
        <div className="sec-head"><span>QUEUE</span><span>{p.playlist.length} TRACKS</span></div>
        <div className="queue-list no-scroll">
          {p.playlist.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-disabled)', letterSpacing: '0.1em' }}>
              SAY SOMETHING TO THE DJ
            </div>
          ) : (
            p.playlist.map((s: Song, i: number) => (
              <div key={`q-${s.song_id}-${i}`}
                className={`queue-row ${i === p.currentIndex ? 'current' : ''}`}
                onClick={() => p.playTrack(i)}
                style={i === p.currentIndex ? {
                  boxShadow: '0 0 12px rgba(0,255,65,0.15)', borderLeft: '2px solid var(--accent)',
                } : {}}>
                <span className="queue-idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="queue-name">{s.song_name}</span>
                <span className="queue-artist">{s.artist}</span>
              </div>
            ))
          )}
        </div>

        {/* 5. CHAT — rounded-2xl bubbles, no top-left radius */}
        <div className="chat-section">
          <div className="sec-head">
            <span>CLAUDIO</span>
            <span style={{ color: p.djNarrating ? 'var(--accent)' : 'var(--text-disabled)' }}>
              {p.djNarrating ? 'SPEAKING' : 'ONLINE'}
            </span>
          </div>

          <div className="chat-msgs" ref={chatRef}>
            {msgs.slice(-8).map((m: any) => (
              <div key={m.id} className={`chat-msg ${m.role === 'user' ? 'user' : ''}`}>
                <div className="chat-av" style={m.role === 'dj' ? {
                  boxShadow: '0 0 10px rgba(0,255,65,0.2)', borderColor: 'rgba(0,255,65,0.3)',
                } : {}}>
                  {m.role === 'user' ? 'U' : 'C'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="chat-name">
                    <span>{m.role === 'user' ? 'YOU' : 'CLAUDIO'}</span>
                  </div>
                  <div className="chat-bubble">
                    {m.status === 'thinking' ? (
                      <span className="thinking-indicator">[THINKING]</span>
                    ) : m.content || (m.status === 'streaming' ? <span className="thinking-indicator">[...]</span> : '')}
                  </div>
                  <div className="chat-time">
                    {new Date(m.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {m.role === 'dj' && m.ttsUrl && m.status === 'done' && (
                      <button className="btn-replay" onClick={() => {
                        if (ttsRef.current) { ttsRef.current.src = m.ttsUrl; ttsRef.current.play().catch(() => {}); }
                      }}>REPLAY</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="chat-tags">
            {TAGS.map((t) => (
              <button key={t} className="chip" onClick={() => c.sendMessage(t)} disabled={c.isStreaming}>{t}</button>
            ))}
          </div>
          <div className="chat-input-bar">
            <input className="chat-input" placeholder="Say something to the DJ..."
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
              disabled={c.isStreaming} />
            <button className="btn-send" onClick={send} disabled={c.isStreaming}>&uarr;</button>
          </div>
        </div>

        {/* 6. FOOTER */}
        <div className="page-footer">
          <span>CLAUDIO FM</span>
          <span>CONNECTED</span>
        </div>
      </div>
    </>
  );
}
