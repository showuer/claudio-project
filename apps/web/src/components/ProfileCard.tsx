import { useState, useEffect, useRef, useCallback } from 'react';
import { DotMatrixLabel } from './DotMatrixDisplay';

const AVATAR = '/avatars/codex.png';

interface ProfileData {
  tags: string[];
  topArtists: string[];
  genresCount: number;
  copy: string;
  mood: string;
  philosophy: string;
  totalHours: number;
  totalPlays: number;
}

interface Props {
  open: boolean;
  onToggle: (v: boolean) => void;
}

function ProfileDotCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -999, y: -999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const SPACING = 16;
    const RADIUS = 70;
    const DOT_R = 1.0;
    let raf = 0;

    function resize() {
      const parent = canvas!.parentElement!;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + 'px';
      canvas!.style.height = h + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      ctx!.clearRect(0, 0, w, h);

      const startCol = Math.floor(0);
      const endCol = Math.ceil(w / SPACING);
      const startRow = Math.floor(0);
      const endRow = Math.ceil(h / SPACING);

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const x = col * SPACING;
          const y = row * SPACING;

          const dx = x - mouseRef.current.x;
          const dy = y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < RADIUS) {
            const t = 1 - dist / RADIUS;
            const size = DOT_R + t * 2.5;
            const alpha = 0.20 + t * 0.40;
            ctx!.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx!.beginPath();
            ctx!.arc(x, y, size, 0, Math.PI * 2);
            ctx!.fill();
          } else {
            ctx!.fillStyle = 'rgba(255,255,255,0.08)';
            ctx!.beginPath();
            ctx!.arc(x, y, DOT_R, 0, Math.PI * 2);
            ctx!.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();

    const onMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { mouseRef.current = { x: -999, y: -999 }; };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="profile-dot-canvas" />;
}

export function ProfileCard({ open, onToggle }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const [editingTag, setEditingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetch('/api/profile/memory/summary').then(r => r.json()).then(setProfile).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onToggle(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onToggle]);

  const saveTags = useCallback(async (tags: string[]) => {
    setSaving(true);
    try {
      const resp = await fetch('/api/profile/styles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      const json = await resp.json();
      if (json.saved) {
        setProfile((p) => p ? { ...p, tags: json.tags, genresCount: json.tags.length } : p);
      }
    } catch { /* ignore */ }
    setSaving(false);
  }, []);

  const removeTag = (tag: string) => {
    if (!profile) return;
    saveTags(profile.tags.filter((t) => t !== tag));
  };

  const addTag = () => {
    if (!profile || !newTag.trim()) return;
    const tag = newTag.trim().toUpperCase();
    if (profile.tags.includes(tag)) { setNewTag(''); return; }
    saveTags([...profile.tags, tag]);
    setNewTag('');
    setEditingTag(false);
  };

  const tags = profile?.tags || [];

  return (
    <div className="profile-trigger">
      <div className="page-logo" onClick={() => onToggle(!open)} style={{ cursor: 'pointer' }}>
        <span className="av av--sm">
          {imgErr ? (
            <span className="profile-fallback">C</span>
          ) : (
            <img src={AVATAR} alt="" onError={() => setImgErr(true)} />
          )}
        </span>
        <span>Claudio</span>
      </div>

      {open && (
        <div className="profile-overlay" onClick={() => onToggle(false)}>
          <aside className="profile-card" ref={cardRef} onClick={e => e.stopPropagation()}>
            <ProfileDotCanvas />
            <div className="profile-card-inner">
              <button className="profile-card-close" onClick={() => onToggle(false)}>CLOSE</button>
              <div className="profile-card-head">
                <span className="profile-card-avatar">
                  {imgErr ? (
                    <span className="profile-fallback-lg">C</span>
                  ) : (
                    <img src={AVATAR} alt="" />
                  )}
                </span>
                <div>
                  <strong>CLAUDIO</strong>
                </div>
              </div>
              <div className="profile-card-stats">
                <div><small>收听时长</small><strong>{profile?.totalHours ? Math.floor(profile.totalHours) + 'H' : '0H'}</strong></div>
                <div><small>播放次数</small><strong>{profile?.totalPlays || 0}</strong></div>
                <div><small>心情</small><strong>{profile?.mood ? profile.mood.slice(0, 4) : '···'}</strong></div>
              </div>

              {/* Editable tags */}
              <div className="profile-card-tags">
                {tags.map(tag => (
                  <b key={tag} onClick={() => removeTag(tag)} title="点击删除">
                    {tag} <span className="tag-x">×</span>
                  </b>
                ))}
                {editingTag ? (
                  <b className="tag-add">
                    <input
                      className="tag-input"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setEditingTag(false); }}
                      onBlur={() => { addTag(); setEditingTag(false); }}
                      placeholder="新标签..."
                      autoFocus
                      maxLength={20}
                    />
                  </b>
                ) : (
                  <b className="tag-add" onClick={() => setEditingTag(true)}>+</b>
                )}
                {saving && <span className="tag-saving">···</span>}
              </div>

              {profile?.philosophy ? (
                <div className="profile-card-philosophy">
                  <p>"{profile.philosophy}"</p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
