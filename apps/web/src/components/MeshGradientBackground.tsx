import type { CoverPalette } from '../hooks/useCoverPalette';

interface MeshGradientBackgroundProps {
  palette: CoverPalette;
  trackId?: string;
  coverUrl?: string;
  loading?: boolean;
}

function toCoverSrc(coverUrl?: string) {
  if (!coverUrl) return '';
  return /^https?:\/\//.test(coverUrl) ? `/api/cover-proxy?url=${encodeURIComponent(coverUrl)}` : coverUrl;
}

export function MeshGradientBackground({ palette, trackId, coverUrl, loading }: MeshGradientBackgroundProps) {
  const coverSrc = toCoverSrc(coverUrl);
  const paletteMatchesTrack = !trackId || palette.trackId === trackId;
  return (
    <div className={`mesh-background ${loading ? 'is-loading' : ''}`} aria-hidden="true">
      {coverSrc && (
        <div className="mesh-cover-prism">
          <img className="mesh-cover-prism__slice mesh-cover-prism__slice--a" src={coverSrc} alt="" decoding="async" />
          <img className="mesh-cover-prism__slice mesh-cover-prism__slice--b" src={coverSrc} alt="" decoding="async" />
          <img className="mesh-cover-prism__slice mesh-cover-prism__slice--c" src={coverSrc} alt="" decoding="async" />
          <img className="mesh-cover-prism__slice mesh-cover-prism__slice--d" src={coverSrc} alt="" decoding="async" />
        </div>
      )}
      <div className="mesh-background-field">
        {Array.from({ length: 9 }, (_, index) => (
          <i key={index} className={`mesh-blob mesh-blob--${index + 1}`} />
        ))}
      </div>
      <div className="mesh-rhythm-map">
        <span /><span /><span /><span /><span />
      </div>
      <div className="mesh-vignette" />
      <div className="mesh-noise" />
      <span style={{ display: 'none' }}>{paletteMatchesTrack ? palette.dark : ''}</span>
    </div>
  );
}
