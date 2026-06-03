import { useEffect, useState } from 'react';

interface CoverAmbientBackgroundProps {
  songId?: string;
  coverUrl?: string;
  mode: string;
  active?: boolean;
}

type AmbientLayer = {
  key: string;
  coverUrl?: string;
  mode: string;
  leaving?: boolean;
};

function toCoverSrc(coverUrl?: string) {
  if (!coverUrl) return '';
  return /^https?:\/\//.test(coverUrl) ? `/api/cover-proxy?url=${encodeURIComponent(coverUrl)}` : coverUrl;
}

export function CoverAmbientBackground({ songId, coverUrl, mode, active = true }: CoverAmbientBackgroundProps) {
  const safeMode = mode || 'default';
  const layerKey = `${safeMode}-${songId || 'empty'}-${coverUrl || 'fallback'}`;
  const [layers, setLayers] = useState<AmbientLayer[]>(() => [{
    key: layerKey,
    coverUrl,
    mode: safeMode,
  }]);

  useEffect(() => {
    setLayers((prev) => {
      const current = prev[prev.length - 1];
      if (current?.key === layerKey) return prev;
      return [
        ...(current ? [{ ...current, leaving: true }] : []),
        { key: layerKey, coverUrl, mode: safeMode },
      ];
    });

    const timer = window.setTimeout(() => {
      setLayers((prev) => prev.filter((layer) => layer.key === layerKey));
    }, 760);

    return () => window.clearTimeout(timer);
  }, [coverUrl, layerKey, safeMode]);

  return (
    <div className={`station-ambient station-ambient--${safeMode} ${active ? 'is-active' : 'is-inactive'}`} aria-hidden="true">
      {layers.map((layer) => (
        <div
          key={layer.key}
          className={`station-ambient-layer station-ambient-layer--${layer.mode} ${layer.leaving ? 'is-leaving' : 'is-entering'}`}
        >
          {layer.coverUrl && (
            <div className="station-ambient-cover">
              <img className="station-ambient-cover__fill" src={toCoverSrc(layer.coverUrl)} alt="" decoding="async" />
              <img className="station-ambient-cover__map" src={toCoverSrc(layer.coverUrl)} alt="" decoding="async" />
            </div>
          )}
        </div>
      ))}
      <div className="station-ambient-mesh">
        <span /><span /><span />
        <span /><span /><span />
        <span /><span /><span />
        <span /><span /><span />
      </div>
      <div className="station-ambient-fallback" />
    </div>
  );
}
