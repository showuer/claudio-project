export function BackgroundGeometry() {
  return (
    <div className="station-geometry" aria-hidden="true">
      <div className="station-geo-lens station-geo-lens--back" />
      <div className="station-geo-lens station-geo-lens--front" />
      <div className="station-geo-ring station-geo-ring--large" />
      <div className="station-geo-ring station-geo-ring--small" />
      <div className="station-geo-frame" />
      <div className="station-geo-line station-geo-line--one" />
      <div className="station-geo-line station-geo-line--two" />
      <div className="station-geo-poly" />
      <div className="station-geo-block" />
    </div>
  );
}
