import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { CoverPalette } from './useCoverPalette';

const colorKeys = ['primary', 'secondary', 'accent', 'dark', 'muted', 'light', 'textSafe'] as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function parseHexColor(value: string) {
  const clean = value.replace('#', '').trim();
  const hex = clean.length === 3
    ? clean.split('').map((part) => part + part).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const int = Number.parseInt(hex, 16);
  if (!Number.isFinite(int)) return { r: 0, g: 0, b: 0 };
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function toHex(value: number) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpHexColor(from: string, to: string, t: number) {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  return `#${toHex(lerp(a.r, b.r, t))}${toHex(lerp(a.g, b.g, t))}${toHex(lerp(a.b, b.b, t))}`;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - clamp(t), 3);
}

function paletteColors(palette: CoverPalette) {
  return {
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    dark: palette.dark,
    muted: palette.muted,
    light: palette.light,
    textSafe: palette.textSafe,
  };
}

function writePalette(root: HTMLElement, colors: ReturnType<typeof paletteColors>) {
  root.style.setProperty('--cover-primary', colors.primary);
  root.style.setProperty('--cover-secondary', colors.secondary);
  root.style.setProperty('--cover-accent', colors.accent);
  root.style.setProperty('--cover-dark', colors.dark);
  root.style.setProperty('--cover-muted', colors.muted);
  root.style.setProperty('--cover-light', colors.light);
  root.style.setProperty('--text-safe', colors.textSafe);

  const meshColors = [
    colors.dark,
    colors.primary,
    colors.secondary,
    colors.muted,
    colors.accent,
    colors.dark,
    colors.secondary,
    colors.primary,
    colors.muted,
  ];
  meshColors.forEach((color, index) => root.style.setProperty(`--mesh-c${index + 1}`, color));
}

export function useMeshGradient(rootRef: RefObject<HTMLElement | null>, palette: CoverPalette) {
  const lastPaletteRef = useRef<ReturnType<typeof paletteColors> | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const nextColors = paletteColors(palette);
    const fromColors = lastPaletteRef.current || nextColors;
    let raf = 0;
    let lastFrame = 0;
    const startedAt = performance.now();
    const duration = lastPaletteRef.current ? 520 : 0;

    if (!duration) {
      writePalette(root, nextColors);
      lastPaletteRef.current = nextColors;
      return undefined;
    }

    const tick = (now: number) => {
      if (now - lastFrame < 32) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastFrame = now;
      const t = easeOut((now - startedAt) / duration);
      const currentColors = Object.fromEntries(colorKeys.map((key) => [
        key,
        lerpHexColor(fromColors[key], nextColors[key], t),
      ])) as ReturnType<typeof paletteColors>;

      writePalette(root, currentColors);

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        writePalette(root, nextColors);
        lastPaletteRef.current = nextColors;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [palette, rootRef]);
}
