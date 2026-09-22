/**
 * The QR code, drawn from the in-repo encoder (lib/qrcode.ts) and nothing else.
 *
 * Two shapes of the same thing: `<QrCode>` renders it inline, `qrSvgMarkup` (in the
 * encoder module) returns a standalone SVG document for the "save this to your phone
 * or print it" path. Both add the four-module quiet zone the spec requires — without
 * it a scanner can't find the symbol's edges, which is exactly the kind of thing that
 * makes a printed card silently unusable.
 */
import { useMemo } from "react";
import { qrMatrix, QUIET_ZONE, type QrEccLevel } from "@/lib/qrcode";

interface QrCodeProps {
  /** What the code carries — here, always the emergency URL, never the bare token. */
  value: string;
  /** Rendered size in pixels (square). */
  size?: number;
  level?: QrEccLevel;
  className?: string;
  /** Accessible name; the code is meaningless to a screen reader, so it needs words. */
  label?: string;
}

export function QrCode({
  value,
  size = 128,
  level = "M",
  className,
  label = "QR code",
}: QrCodeProps) {
  const matrix = useMemo(() => qrMatrix(value, level), [value, level]);
  const span = matrix.size + QUIET_ZONE * 2;

  // One path for every dark module: a fraction of the DOM nodes of one rect per
  // module, and it scales cleanly at any printed size.
  const path = useMemo(() => {
    let d = "";
    for (let y = 0; y < matrix.size; y += 1) {
      for (let x = 0; x < matrix.size; x += 1) {
        if (matrix.modules[y * matrix.size + x] === 1) {
          d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
        }
      }
    }
    return d;
  }, [matrix]);

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#ffffff" />
      <path d={path} fill="currentColor" />
    </svg>
  );
}
