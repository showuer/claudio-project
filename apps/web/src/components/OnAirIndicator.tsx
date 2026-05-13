export default function OnAirIndicator({ active }: { active: boolean }) {
  return (
    <div className="on-air-wrap">
      <div className={`on-air-dot ${active ? '' : 'off'}`} />
      <span className={`on-air-label ${active ? '' : 'off'}`}>
        {active ? 'ON AIR' : 'STANDBY'}
      </span>
    </div>
  );
}
