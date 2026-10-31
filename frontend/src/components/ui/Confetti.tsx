import { useEffect, useRef, useState, type CSSProperties } from "react";

const COLORS = [
  "#ff4d4f", "#faad14", "#52c41a", "#1890ff", "#722ed1", "#eb2f96",
];

interface Piece {
  id: number;
  /** Travel distance in px, applied through the --tx/--ty custom properties. */
  tx: number;
  ty: number;
  color: string;
}

interface ConfettiProps {
  active: boolean;
  /** Number of pieces to emit. */
  count?: number;
}

/**
 * One-shot confetti burst. Emits coloured squares that fly outward and fade.
 *
 * The burst is a celebration, never the only signal that something happened —
 * the confirmation text carries the meaning on its own. It renders nothing when
 * the visitor prefers reduced motion.
 */
export function Confetti({ active, count = 30 }: ConfettiProps) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!active) return;

    // A burst of moving pieces is exactly what reduced-motion asks us to skip.
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const next: Piece[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      tx: Math.round((Math.random() - 0.5) * 180),
      ty: Math.round((Math.random() - 0.5) * 180),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    setPieces(next);
    frame.current = window.setTimeout(() => setPieces([]), 800);
    return () => {
      if (frame.current !== undefined) window.clearTimeout(frame.current);
    };
  }, [active, count]);

  if (pieces.length === 0) return null;

  return (
    <div className="mhl-confetti pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="mhl-confetti-piece absolute"
          style={
            {
              "--tx": `${p.tx}px`,
              "--ty": `${p.ty}px`,
              backgroundColor: p.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}