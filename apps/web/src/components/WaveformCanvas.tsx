import { useRef, useEffect } from 'react';

export default function WaveformCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bars = useRef<number[]>(Array(100).fill(2));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barCount = 100;
    const barW = Math.max(1, (w / barCount) * 0.6);
    const gap = w / barCount;

    function draw() {
      ctx!.clearRect(0, 0, w, h);

      for (let i = 0; i < barCount; i++) {
        const prev = bars.current[i];
        let target: number;

        if (active) {
          const distFromMid = Math.abs(i - barCount / 2) / (barCount / 2);
          const baseH = 3 + (1 - distFromMid * distFromMid) * h * 0.75;
          target = baseH * (0.3 + Math.random() * 0.7);
        } else {
          target = h * 0.03;
        }

        const attack = 0.85;
        const release = 0.12;
        const coeff = target > prev ? attack : release;
        bars.current[i] = prev + (target - prev) * coeff;

        const barH = Math.max(1, bars.current[i]);
        const x = i * gap;
        const y = h - barH;

        // Bright neon green, more opaque for taller bars
        const alpha = 0.1 + (barH / h) * 0.9;
        ctx!.fillStyle = `rgba(0, 255, 65, ${alpha.toFixed(2)})`;
        ctx!.fillRect(x, y, barW, barH);
      }

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
