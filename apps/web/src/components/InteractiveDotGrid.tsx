import { useRef, useEffect } from 'react';

export default function InteractiveDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const SPACING = 32;
    const RADIUS = 100;
    const DOT_R = 1.2;

    let mouseX = -999;
    let mouseY = -999;
    let raf = 0;

    function resize() {
      const w = canvas!.parentElement!.clientWidth;
      const h = canvas!.parentElement!.clientHeight;
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

      const startCol = Math.floor(-SPACING / 2);
      const endCol = Math.ceil(w / SPACING) + 1;
      const startRow = Math.floor(-SPACING / 2);
      const endRow = Math.ceil(h / SPACING) + 1;

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const x = col * SPACING + SPACING / 2;
          const y = row * SPACING + SPACING / 2;

          const dx = x - mouseX;
          const dy = y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < RADIUS) {
            const t = 1 - dist / RADIUS;
            const alpha = 0.10 + t * 0.40;
            ctx!.fillStyle = `rgba(0,255,65,${alpha.toFixed(2)})`;
            ctx!.beginPath();
            ctx!.arc(x, y, DOT_R + t * 1.2, 0, Math.PI * 2);
            ctx!.fill();

            // Outer glow
            ctx!.fillStyle = `rgba(0,255,65,${(t * 0.03).toFixed(2)})`;
            ctx!.beginPath();
            ctx!.arc(x, y, DOT_R + 3 * t, 0, Math.PI * 2);
            ctx!.fill();
          } else {
            // Regular dot — slightly brighter
            ctx!.fillStyle = 'rgba(255,255,255,0.16)';
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
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };
    const onLeave = () => { mouseX = -999; mouseY = -999; };
    const onResize = () => resize();

    window.addEventListener('mousemove', onMove, { passive: true });
    canvas.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
