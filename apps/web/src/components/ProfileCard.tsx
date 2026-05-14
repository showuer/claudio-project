import { useState, useEffect, useRef, useCallback } from 'react';
import { DotMatrixLabel } from './DotMatrixDisplay';

const AVATAR = '/avatars/claude.png';

interface ProfileStyles {
  tags: string[];
  topArtists: string[];
  genresCount: number;
  copy: string;
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
  const [profile, setProfile] = useState<ProfileStyles | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !profile) {
      fetch('/api/profile/styles').then(r => r.json()).then(setProfile).catch(() => {});
    }
  }, [open, profile]);

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
                  <p>{profile?.copy || 'Your private AI DJ'}</p>
                </div>
              </div>
              <div className="profile-card-stats">
                <div><small>ON AIR</small><strong>24/7</strong></div>
                <div><small>GENRES</small><strong>{String(profile?.genresCount || 0).padStart(2, '0')}</strong></div>
                <div><small>STYLE</small><strong>TASTE</strong></div>
              </div>
              <div className="profile-card-tags">
                {(profile?.tags || []).slice(0, 6).map(tag => (
                  <b key={tag}>{tag}</b>
                ))}
              </div>
              {profile?.topArtists.length ? (
                <div className="profile-card-artists">
                  <small>TOP ARTISTS</small>
                  <span>{profile.topArtists.join(' · ')}</span>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
