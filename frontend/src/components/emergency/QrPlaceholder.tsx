import { useMemo } from "react";

/**
 * A deterministic QR-*shaped* placeholder. It is NOT a scannable code — the real,
 * revocable emergency token is minted by the backend (see docs/data-model.md). This
 * draws a stable module grid seeded from the token plus the three finder squares, so
 * the Dashboard has something honest and consistent to show until that endpoint lands.
 */

const N = 25; // modules per side

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMatrix(token: string): boolean[][] {
  const rng = mulberry32(hashString(token));
  const m: boolean[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => rng() > 0.52),
  );

  // Stamp a 7×7 finder pattern (with a 1-module light separator) at an origin.
  const stamp = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const gx = ox + x;
        const gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
        let on = false;
        if (x >= 0 && x < 7 && y >= 0 && y < 7) {
          const edge = x === 0 || x === 6 || y === 0 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          on = edge || core;
        }
        m[gy][gx] = on;
      }
    }
  };
  stamp(0, 0);
  stamp(N - 7, 0);
  stamp(0, N - 7);
  return m;
}

interface QrPlaceholderProps {
  token: string;
  size?: number;
  className?: string;
}

/** Renders the placeholder as inline SVG. Modules use `currentColor`, so the parent
    sets the ink; place it on a light tile for the usual dark-on-light QR look. */
export function QrPlaceholder({ token, size = 116, className }: QrPlaceholderProps) {
  const matrix = useMemo(() => buildMatrix(token), [token]);
  return (
    <svg
      viewBox={`0 0 ${N} ${N}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Emergency code preview"
      shapeRendering="crispEdges"
    >
      {matrix.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** A standalone SVG document string for download (white quiet zone + dark modules). */
export function qrSvgMarkup(token: string, px = 512): string {
  const matrix = buildMatrix(token);
  const q = 2; // quiet-zone modules
  const span = N + q * 2;
  const rects: string[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (matrix[y][x]) rects.push(`<rect x="${x + q}" y="${y + q}" width="1" height="1"/>`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">` +
    `<rect width="${span}" height="${span}" fill="#ffffff"/>` +
    `<g fill="#1a1512">${rects.join("")}</g>` +
    `</svg>`
  );
}
