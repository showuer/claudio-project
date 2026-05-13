import { useState, useEffect } from 'react';
import OnAirIndicator from './OnAirIndicator';
import WaveformCanvas from './WaveformCanvas';
import { usePlayerStore } from '../stores/playerStore';

export default function CardHeader() {
  const [time, setTime] = useState(new Date());
  const isPlaying = usePlayerStore((s) => s.musicPlaying || s.djNarrating);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const weekdays = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const dateStr = `${weekdays[time.getDay()]} ${time.getFullYear()}.${String(time.getMonth()+1).padStart(2,'0')}.${String(time.getDate()).padStart(2,'0')}`;

  return (
    <div className="card-header">
      <div className="header-top">
        <div className="station-name">CLAUDIO FM</div>
      </div>

      {/* Giant Dot-Matrix Clock */}
      <div className="header-clock">
        <div className="header-clock-time">
          {time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </div>
        <div className="header-clock-date">{dateStr}</div>
      </div>

      <OnAirIndicator active={isPlaying} />

      <div className="waveform-wrap">
        <WaveformCanvas active={isPlaying} />
      </div>
    </div>
  );
}
