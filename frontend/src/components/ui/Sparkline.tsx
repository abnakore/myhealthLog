/**
 * A tiny dependency-free trend line. Takes values in chronological order (oldest
 * first) and draws them left-to-right, scaled to the box. Purely a supporting cue —
 * the number beside it always carries the meaning, so it's aria-hidden. A flat or
 * single-point series draws a centred line rather than nothing.
 *
 * `band` shades an in-range band behind the line (the vital type's normal band —
 * a gentle cue, not a clinical threshold). It stretches the y-scale, exactly
 * like the line does.
 */
interface SparklineProps {
  values: number[];
  band?: [number, number] | null;
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  values,
  band = null,
  width = 76,
  height = 26,
  strokeWidth = 1.75,
  className = "text-mhl-accent",
}: SparklineProps) {
  if (values.length === 0) return null;

  const pad = strokeWidth;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const lo = Math.min(...values, ...(band ?? []));
  const hi = Math.max(...values, ...(band ?? []));
  const span = hi - lo || 1;
  const yOf = (v: number) => pad + innerH * (1 - (v - lo) / span);

  const points = values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : pad + (innerW * i) / (values.length - 1);
      return `${x.toFixed(1)},${yOf(v).toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {band && (
        <rect
          x={pad}
          y={yOf(band[1])}
          width={Math.max(innerW, 0)}
          height={Math.max(yOf(band[0]) - yOf(band[1]), 1)}
          rx={Math.min(strokeWidth, 3)}
          className="fill-mhl-good-lo"
        />
      )}
      {values.length === 1 ? (
        <circle cx={width / 2} cy={height / 2} r={strokeWidth} fill="currentColor" />
      ) : (
        <polyline
          points={points}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
