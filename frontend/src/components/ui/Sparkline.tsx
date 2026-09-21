/**
 * A tiny dependency-free trend line. Takes values in chronological order (oldest
 * first) and draws them left-to-right, scaled to the box. Purely a supporting cue —
 * the number beside it always carries the meaning, so it's aria-hidden. A flat or
 * single-point series draws a centred line rather than nothing.
 */
interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  values,
  width = 76,
  height = 26,
  strokeWidth = 1.75,
  className = "text-mhl-accent",
}: SparklineProps) {
  if (values.length === 0) return null;

  const pad = strokeWidth;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : pad + (innerW * i) / (values.length - 1);
      const y = pad + innerH * (1 - (v - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
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
