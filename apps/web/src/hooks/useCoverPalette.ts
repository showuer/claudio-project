import { useEffect, useMemo, useState } from 'react';

export type CoverPalette = {
  trackId: string;
  coverUrl: string;
  source: 'extracted' | 'fallback';
  primary: string;
  secondary: string;
  accent: string;
  dark: string;
  muted: string;
  light: string;
  textSafe: string;
};

const fallbackPalette: CoverPalette = {
  trackId: '',
  coverUrl: '',
  source: 'fallback',
  primary: '#32415F',
  secondary: '#0F766E',
  accent: '#A7F3D0',
  dark: '#05070D',
  muted: '#182033',
  light: '#DDE7F6',
  textSafe: '#F8FAFC',
};

const paletteCache = new Map<string, CoverPalette>();
const seedPaletteCache = new Map<string, CoverPalette>();
const paletteInflightCache = new Map<string, Promise<CoverPalette>>();

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHex({ r, g, b }: RGB) {
  return `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === nr) h = (ng - nb) / d + (ng < nb ? 6 : 0);
  else if (max === ng) h = (nb - nr) / d + 2;
  else h = (nr - ng) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) {
    const n = l * 255;
    return { r: n, g: n, b: n };
  }
  const hue = (p: number, q: number, t: number) => {
    let nt = t;
    if (nt < 0) nt += 1;
    if (nt > 1) nt -= 1;
    if (nt < 1 / 6) return p + (q - p) * 6 * nt;
    if (nt < 1 / 2) return q;
    if (nt < 2 / 3) return p + (q - p) * (2 / 3 - nt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

function tune(color: RGB, lightness: number, saturation = 0.72) {
  const hsl = rgbToHsl(color);
  return rgbToHex(hslToRgb({
    h: hsl.h,
    s: clamp(hsl.s * saturation, 0.18, 0.72),
    l: clamp(lightness, 0.05, 0.86),
  }));
}

function scoreColor(color: RGB, targetL: number, saturationWeight = 1) {
  const hsl = rgbToHsl(color);
  return hsl.s * saturationWeight - Math.abs(hsl.l - targetL) * 0.85;
}

function deriveHueColor(color: RGB, hueShift: number, lightness: number, saturation = 0.62) {
  const hsl = rgbToHsl(color);
  return hslToRgb({
    h: (hsl.h + hueShift) % 1,
    s: clamp((hsl.s * saturation) + 0.12, 0.22, 0.68),
    l: clamp(lightness, 0.12, 0.78),
  });
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededColor(seed: number, index: number): RGB {
  const hueBand = ((seed >>> ((index % 4) * 8)) & 255) / 255;
  const h = (0.54 + hueBand * 0.18 + index * 0.035) % 1;
  const s = 0.30 + (((seed >>> ((index % 3) * 6)) & 31) / 31) * 0.16;
  const l = 0.30 + (((seed >>> ((index % 5) * 5)) & 31) / 31) * 0.12;
  return hslToRgb({ h, s, l });
}

function createSeedPalette(key: string, trackId = '', coverUrl = ''): CoverPalette {
  const cached = seedPaletteCache.get(key);
  if (cached) return cached;
  const seed = hashString(key);
  const primary = seededColor(seed, 0);
  const secondary = seededColor(seed, 1);
  const accent = seededColor(seed, 2);
  const palette: CoverPalette = {
    trackId,
    coverUrl,
    source: 'fallback',
    primary: tune(primary, 0.34, 0.86),
    secondary: tune(secondary, 0.28, 0.74),
    accent: tune(accent, 0.62, 0.98),
    dark: tune(primary, 0.07, 0.62),
    muted: tune(secondary, 0.16, 0.50),
    light: tune(accent, 0.78, 0.52),
    textSafe: '#F8FAFC',
  };
  seedPaletteCache.set(key, palette);
  return palette;
}

function normalizePalette(samples: RGB[], trackId: string, coverUrl: string): CoverPalette {
  if (!samples.length) return createSeedPalette(`${trackId || 'unknown-track'}::${coverUrl || 'no-cover'}`, trackId, coverUrl);
  const sortedByVibrance = [...samples].sort((a, b) => scoreColor(b, 0.48, 1.45) - scoreColor(a, 0.48, 1.45));
  const primaryHue = rgbToHsl(sortedByVibrance[0] || samples[0]).h;
  const hueDistance = (color: RGB) => {
    const d = Math.abs(rgbToHsl(color).h - primaryHue);
    return Math.min(d, 1 - d);
  };
  const sortedByMuted = [...samples].sort((a, b) => (
    scoreColor(b, 0.42, 0.55) + hueDistance(b) * 0.42
  ) - (
    scoreColor(a, 0.42, 0.55) + hueDistance(a) * 0.42
  ));
  const sortedByLight = [...samples].sort((a, b) => rgbToHsl(b).l - rgbToHsl(a).l);
  const sortedByDark = [...samples].sort((a, b) => rgbToHsl(a).l - rgbToHsl(b).l);
  const primary = sortedByVibrance[0] || samples[0];
  const secondaryCandidate = sortedByMuted.find((color) => {
    const distance = hueDistance(color);
    return distance > 0.04 && distance < 0.24;
  }) || sortedByMuted[0] || primary;
  const accentCandidate = sortedByVibrance.find((color) => {
    const distance = hueDistance(color);
    return distance > 0.04 && distance < 0.20;
  }) || secondaryCandidate;
  const secondary = hueDistance(secondaryCandidate) > 0.04 && hueDistance(secondaryCandidate) < 0.24
    ? secondaryCandidate
    : deriveHueColor(primary, 0.12, clamp(rgbToHsl(primary).l - 0.02, 0.20, 0.40), 0.58);
  const accent = hueDistance(accentCandidate) > 0.04 && hueDistance(accentCandidate) < 0.20
    ? accentCandidate
    : deriveHueColor(primary, 0.08, clamp(rgbToHsl(primary).l + 0.26, 0.48, 0.72), 0.82);
  const dark = sortedByDark.find((color) => rgbToHsl(color).l < 0.35) || sortedByDark[0] || primary;
  const light = sortedByLight.find((color) => rgbToHsl(color).l > 0.48) || sortedByLight[0] || primary;
  return {
    trackId,
    coverUrl,
    source: 'extracted',
    primary: tune(primary, clamp(rgbToHsl(primary).l, 0.24, 0.44), 0.82),
    secondary: tune(secondary, clamp(rgbToHsl(secondary).l, 0.20, 0.40), 0.68),
    accent: tune(accent, clamp(rgbToHsl(accent).l, 0.48, 0.72), 0.98),
    dark: tune(dark, 0.075, 0.58),
    muted: tune(secondary, 0.18, 0.44),
    light: tune(light, 0.78, 0.48),
    textSafe: '#F8FAFC',
  };
}

async function extractCoverPalette(coverUrl: string, trackId: string): Promise<CoverPalette> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = /^https?:\/\//.test(coverUrl) ? `/api/cover-proxy?url=${encodeURIComponent(coverUrl)}` : coverUrl;
  await image.decode();
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return createSeedPalette(`${trackId || 'unknown-track'}::${coverUrl || 'no-cover'}`, trackId, coverUrl);
  }
  const canvas = document.createElement('canvas');
  const size = 48;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return createSeedPalette(`${trackId || 'unknown-track'}::${coverUrl || 'no-cover'}`, trackId, coverUrl);
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { color: RGB; count: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const alpha = data[i + 3];
    if (alpha < 220) continue;
    const color = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const hsl = rgbToHsl(color);
    if (hsl.l < 0.03 || hsl.l > 0.96) continue;
    const key = `${Math.round(color.r / 20)}-${Math.round(color.g / 20)}-${Math.round(color.b / 20)}`;
    const prev = buckets.get(key);
    if (prev) prev.count += 1;
    else buckets.set(key, { color, count: 1 });
  }
  const samples = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 54)
    .map((bucket) => bucket.color);
  return normalizePalette(samples, trackId, coverUrl);
}

function schedulePaletteExtraction(key: string, coverUrl: string, trackId: string) {
  const cached = paletteCache.get(key);
  if (cached) return Promise.resolve(cached);

  const inflight = paletteInflightCache.get(key);
  if (inflight) return inflight;

  const request = new Promise<CoverPalette>((resolve) => {
    const run = () => {
      extractCoverPalette(coverUrl, trackId).then(resolve).catch(() => resolve(createSeedPalette(key, trackId, coverUrl)));
    };
    const requestIdle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback.bind(window)
      : null;
    if (requestIdle) {
      requestIdle(run, { timeout: 420 });
    } else {
      globalThis.setTimeout(run, 16);
    }
  }).then((nextPalette) => {
    paletteCache.set(key, nextPalette);
    paletteInflightCache.delete(key);
    return nextPalette;
  });

  paletteInflightCache.set(key, request);
  return request;
}

export function useCoverPalette(coverUrl?: string, trackId?: string) {
  const key = `${trackId || 'unknown-track'}::${coverUrl || 'no-cover'}`;
  const [palette, setPalette] = useState<CoverPalette>(() => paletteCache.get(key) || createSeedPalette(key, trackId || '', coverUrl || ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = paletteCache.get(key);
    if (cached) {
      setPalette(cached);
      setLoading(false);
      setError(false);
      return () => { cancelled = true; };
    }
    const seedPalette = createSeedPalette(key, trackId || '', coverUrl || '');
    setPalette(seedPalette);
    if (!coverUrl) {
      setLoading(false);
      setError(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(false);
    schedulePaletteExtraction(key, coverUrl, trackId || '')
      .then((nextPalette) => {
        if (cancelled) return;
        if (nextPalette.trackId !== (trackId || '') || nextPalette.coverUrl !== (coverUrl || '')) return;
        setPalette(nextPalette);
      })
      .catch(() => {
        if (cancelled) return;
        paletteCache.set(key, seedPalette);
        setPalette(seedPalette);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [coverUrl, key]);

  return useMemo(() => ({ palette, loading, error }), [palette, loading, error]);
}
