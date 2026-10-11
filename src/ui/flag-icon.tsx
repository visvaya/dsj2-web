import { FLAG_HEIGHT_PX, FLAG_WIDTH_PX, COUNTRY_NAME_PL, flagPixels, unknownFlagPixels, type CountryCode } from "../render/flags";

/** CSS pixels per flag pixel. */
const FLAG_SCALE = 2;

/** A pixel flag, or a grey one with a question mark when the country is unknown; rows are merged into runs of one colour. */
export function FlagIcon({ country }: { country: CountryCode | null }) {
  const width = FLAG_WIDTH_PX * FLAG_SCALE;
  const height = FLAG_HEIGHT_PX * FLAG_SCALE;
  const runs: { x: number; y: number; w: number; c: string }[] = [];
  (country === null ? unknownFlagPixels() : flagPixels(country)).forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x] ?? "";
      let w = 1;
      while (row[x + w] === c) w++;
      runs.push({ x, y, w, c });
      x += w;
    }
  });
  return (
    <svg
      className="flag-icon"
      viewBox={`0 0 ${FLAG_WIDTH_PX} ${FLAG_HEIGHT_PX}`}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      role="img"
      aria-label={country === null ? "Kraj nieznany" : COUNTRY_NAME_PL[country]}
    >
      {runs.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  );
}
