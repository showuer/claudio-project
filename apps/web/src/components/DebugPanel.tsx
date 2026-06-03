import { useState, useEffect } from 'react';

const CONTROLS = [
  { label: 'Card Width', prop: '--card-w', min: 500, max: 800, step: 2, unit: 'px', def: 650 },
  { label: 'Card MaxH', prop: '--card-maxh', min: 800, max: 1200, step: 10, unit: 'px', def: 1200 },
  { label: 'Header Pad T', prop: '--head-pt', min: 0, max: 60, step: 1, unit: 'px', def: 40 },
  { label: 'Header Pad X', prop: '--head-px', min: 10, max: 60, step: 1, unit: 'px', def: 41 },
  { label: 'Hero Height %', prop: '--hero-h', min: 15, max: 50, step: 1, unit: '%', def: 25 },
  { label: 'Player Pad Y', prop: '--player-py', min: 4, max: 30, step: 1, unit: 'px', def: 14 },
  { label: 'Player Pad X', prop: '--player-px', min: 10, max: 50, step: 1, unit: 'px', def: 28 },
  { label: 'Queue Margin X', prop: '--queue-px', min: 0, max: 80, step: 1, unit: 'px', def: 0 },
  { label: 'Queue Inner Pad', prop: '--queue-pad', min: 0, max: 30, step: 1, unit: 'px', def: 17 },
  { label: 'Queue Pad Y', prop: '--queue-py', min: 4, max: 24, step: 1, unit: 'px', def: 8 },
  { label: 'Claudio Margin X', prop: '--chatbar-px', min: 0, max: 80, step: 1, unit: 'px', def: 8 },
  { label: 'Claudio Inner Pad', prop: '--chatbar-pad', min: 0, max: 30, step: 1, unit: 'px', def: 16 },
  { label: 'Chat Bar Pad Y', prop: '--chatbar-py', min: 8, max: 36, step: 1, unit: 'px', def: 16 },
  { label: 'Input Margin X', prop: '--input-px', min: 0, max: 80, step: 1, unit: 'px', def: 11 },
  { label: 'Input Inner Pad', prop: '--input-pad', min: 10, max: 60, step: 1, unit: 'px', def: 36 },
  { label: 'Input Bar Pad Y', prop: '--input-py', min: 4, max: 24, step: 1, unit: 'px', def: 7 },
  { label: 'Footer Pad Y', prop: '--footer-py', min: 4, max: 30, step: 1, unit: 'px', def: 20 },
  { label: 'Footer Pad X', prop: '--footer-px', min: 4, max: 120, step: 1, unit: 'px', def: 69 },
  { label: 'Footer Font Sz', prop: '--footer-fs', min: 6, max: 16, step: 1, unit: 'px', def: 8 },
  { label: 'Footer LtrSpc', prop: '--footer-ls', min: 0, max: 5, step: 0.1, unit: 'px', def: 1.5 },
  { label: 'G3 Curve H', prop: '--g3-h', min: 10, max: 100, step: 1, unit: 'px', def: 87 },
  { label: 'G3 Curve V', prop: '--g3-v', min: 4, max: 100, step: 1, unit: 'px', def: 85 },
  { label: 'Song Font Sz', prop: '--song-fs', min: 14, max: 36, step: 1, unit: 'px', def: 22 },
  { label: 'Artist Font Sz', prop: '--artist-fs', min: 10, max: 22, step: 1, unit: 'px', def: 14 },
  { label: 'Dot Spacing', prop: '--dot-space', min: 12, max: 40, step: 1, unit: 'px', def: 22 },
  { label: 'Dot Opacity', prop: '--dot-op', min: 5, max: 50, step: 1, unit: '%', def: 18 },
];

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    CONTROLS.forEach(c => {
      init[c.prop] = c.def;
    });
    return init;
  });

  const apply = (prop: string, val: number) => {
    const unit = CONTROLS.find(c => c.prop === prop)?.unit || 'px';
    const v = unit === '%' ? `${val}%` : `${val}${unit}`;
    document.documentElement.style.setProperty(prop, v);
    setValues(prev => ({ ...prev, [prop]: val }));
  };

  // Apply all defaults on mount
  useEffect(() => {
    CONTROLS.forEach(c => {
      const unit = c.unit;
      const v = unit === '%' ? `${c.def}%` : `${c.def}${unit}`;
      document.documentElement.style.setProperty(c.prop, v);
    });
  }, []);

  const exportVals = () => {
    const out = CONTROLS.map(c => `${c.label}: ${values[c.prop]}${c.unit}`).join('\n');
    navigator.clipboard.writeText(out);
    alert('已复制到剪贴板！发给开发者。\n\n' + out);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
          background: '#00FF41', color: '#000', border: 'none',
          borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
          fontFamily: 'Space Mono, monospace', fontSize: 11, fontWeight: 700,
        }}
      >
        DEBUG
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 300, zIndex: 9999,
      background: 'rgba(10,10,18,0.97)', borderLeft: '2px solid #00FF41',
      overflowY: 'auto', padding: 16,
      fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#CCC',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ color: '#00FF41', fontSize: 12 }}>UI DEBUG</strong>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #555', color: '#999', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>X</button>
      </div>
      {CONTROLS.map(c => (
        <div key={c.prop} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span>{c.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#00FF41' }}>{values[c.prop]}{c.unit}</span>
              <button
                onClick={() => apply(c.prop, c.def)}
                style={{
                  background: 'none', border: '1px solid #444', color: '#888',
                  borderRadius: 3, cursor: 'pointer', fontSize: 8, padding: '1px 5px',
                  fontFamily: 'Space Mono, monospace',
                }}
                title="Reset"
              >↺</button>
            </span>
          </div>
          <input
            type="range"
            min={c.min} max={c.max} step={c.step}
            value={values[c.prop]}
            onChange={e => apply(c.prop, Number(e.target.value))}
            style={{ width: '100%', accentColor: '#00FF41' }}
          />
        </div>
      ))}
      <button onClick={exportVals} style={{
        width: '100%', marginTop: 8, padding: '8px', cursor: 'pointer',
        background: '#00FF41', color: '#000', border: 'none', borderRadius: 6,
        fontFamily: 'Space Mono, monospace', fontSize: 11, fontWeight: 700,
      }}>
        COPY VALUES
      </button>
    </div>
  );
}
