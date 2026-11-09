/**
 * The physical emergency card.
 *
 * What a person downloads or prints is not a screenshot of the app: it is the same
 * card the dashboard shows — dark panel, shield and "Emergency card" at the top, the
 * QR in a white tile on the left and the revealed facts beside it — drawn at the real
 * proportions of a bank card, 85.6 × 54 mm, so it prints at actual size and fits a
 * wallet. The SVG below is the single source for every export: the PNG the browser
 * saves, the sheet the printer receives, and the preview in the dialog are one drawing.
 *
 * The QR on it always carries the emergency view URL — the person's compiled
 * "first sixty seconds" summary — never the bare token and never this card.
 */
import { qrMatrix, QUIET_ZONE } from "@/lib/qrcode";
import type { AppMode } from "@/lib/appModes";

/** 85.6 mm at 300 dpi, to the nearest pixel. Print-accurate by construction. */
export const CARD_WIDTH = 1011;
export const CARD_HEIGHT = 638;
/** 85.6 × 54 mm — the size the printer dialog is asked for. */
export const CARD_SIZE_MM = { width: 85.6, height: 54 };

/** The inks the card is drawn in — the app's emergency register. */
const INK = "#f8f3ea";
const MUTED = "#cbb9a9";
const FAINT = "#ab9584";
const AMBER = "#f2c79e";
const ALERT = "#f0998a";
const QR_INK = "#171310";

/** `.mhl-emerg-card` per mode, in hex — the export keeps the mode's own surface. */
const SURFACE: Record<AppMode, string> = {
  standard: "#231b16",
  elderly: "#1a2b21",
  critical: "#211713",
  pregnancy: "#231a16",
};

export interface EmergencyCardInput {
  /** Who the card is for. */
  name: string;
  /** "34 yrs · Female · born 3 Apr 1992", already composed. */
  meta: string;
  bloodType?: string;
  genotype?: string;
  /** Severe / anaphylactic substances, in the record's order. */
  allergies: string[];
  /** Active medicines. */
  medications: string[];
  /** Ongoing conditions. */
  conditions: string[];
  /** "Ibrahim Yusuf · 0803 555 7788" */
  contact?: string;
  note?: string;
  /** The full emergency-view URL the QR encodes. */
  url: string;
  /** Printed only when the card is PIN-gated, so it can actually be used. */
  pin?: string;
  /** Last four of the code, for identifying a printed card after a regeneration. */
  tokenLabel: string;
  /** The mode the card was made in, so its surface matches the one on screen. */
  mode?: AppMode;
  /** Which sections the owner chose to reveal. Hidden sections are absent here. */
  show: {
    bloodType: boolean;
    allergies: boolean;
    medications: boolean;
    conditions: boolean;
    contacts: boolean;
    note: boolean;
  };
}

const FONT = "Helvetica, Arial, sans-serif";
let measureCtx: CanvasRenderingContext2D | null | undefined;

/** One shared canvas for measuring — used only to fit text, never to paint. */
function context(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    measureCtx = document.createElement("canvas").getContext("2d");
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

function widthOf(text: string, font: string): number {
  const ctx = context();
  if (!ctx) {
    const px = Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
    // A conservative average glyph width when no canvas is available.
    return text.length * px * 0.55;
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** One line that fits the box: shortened with an ellipsis, never overflowing. */
function fit(text: string, maxWidth: number, font: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  if (widthOf(clean, font) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && widthOf(`${out}…`, font) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

/** Break a value onto at most `maxLines` lines, ellipsis on the last if it spills. */
function wrap(text: string, maxWidth: number, font: string, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim() || "—";
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = line ? `${line} ${word}` : word;
    if (!line || widthOf(candidate, font) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      // Out of lines: the rest joins this one and is shortened to fit.
      lines.push(fit(`${line} ${words.slice(index).join(" ")}`, maxWidth, font));
      return lines;
    }
    lines.push(fit(line, maxWidth, font));
    line = word;
  }
  if (line) lines.push(fit(line, maxWidth, font));
  return lines;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Fact {
  label: string;
  value: string;
  tone?: "alert";
}

/** The QR as a path, inside the white tile the dashboard shows it in. */
function qrTile(url: string, x: number, y: number, size: number): string {
  const matrix = qrMatrix(url, "M");
  const span = matrix.size + QUIET_ZONE * 2;
  let d = "";
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.modules[row * matrix.size + col] === 1) {
        d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }
  const pad = 14;
  return (
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="24" fill="#ffffff"/>` +
    `<g transform="translate(${x + pad} ${y + pad}) scale(${(size - pad * 2) / span})">` +
    `<path d="${d}" fill="${QR_INK}"/></g>`
  );
}

/** Shield mark, straight from the app's icon set. */
function shieldMark(x: number, y: number, size: number): string {
  return (
    `<path d="M12 3.5 5 6v6c0 4.5 3.2 7.3 7 8.5 3.8-1.2 7-4 7-8.5V6l-7-2.5Z" ` +
    `transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${AMBER}" ` +
    `stroke-width="${(1.9 * 24) / size}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** Lock mark, from the same set, sized to the pill it sits in. */
function lockMark(x: number, y: number, size: number, colour: string): string {
  return (
    `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${colour}" ` +
    `stroke-width="${(2 * 24) / size}" stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="5" y="10.5" width="14" height="9.5" rx="2.3"/>` +
    `<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></g>`
  );
}

/**
 * Draw the card. Pure: same input, same SVG — which is what makes the preview, the
 * PNG and the printed sheet identical rather than three near-copies.
 */
export function buildEmergencyCardSvg(input: EmergencyCardInput): string {
  const surface = SURFACE[input.mode ?? "standard"] ?? SURFACE.standard;
  const pad = 48;
  const qrSize = 232;
  const tileX = pad;
  const tileY = 178;
  const factsX = tileX + qrSize + 32;
  const factsW = CARD_WIDTH - pad - factsX;

  const facts: Fact[] = [];
  if (input.show.bloodType && (input.bloodType || input.genotype)) {
    facts.push({
      label: "Blood & genotype",
      value: `${input.bloodType || "—"} · ${input.genotype || "—"}`,
    });
  }
  if (input.show.allergies) {
    facts.push({
      label: "Critical allergies",
      value: input.allergies.length > 0 ? input.allergies.join(", ") : "None recorded",
      tone: input.allergies.length > 0 ? "alert" : undefined,
    });
  }
  if (input.show.medications && input.medications.length > 0) {
    facts.push({ label: "Current medications", value: input.medications.join(", ") });
  }
  if (input.show.conditions) {
    facts.push({
      label: "Active conditions",
      value:
        input.conditions.length > 0 ? input.conditions.join(", ") : "None recorded",
    });
  }
  if (input.show.contacts && input.contact) {
    facts.push({ label: "Emergency contact", value: input.contact });
  }

  const note = input.show.note ? input.note?.trim() ?? "" : "";
  const noteTop = 512;
  const factsTop = 192;
  const factsBottom = note ? noteTop - 16 : 566;

  // Fit the facts to the space beside the QR: drop the type a step at a time
  // before ever letting a value run off the card or under the note.
  const valueSizes = [30, 26, 22, 19];
  const gaps = [20, 18, 14, 10];
  /** Label baseline → last value baseline, for a value of `size` on `lines` lines. */
  const rowHeight = (size: number, lines: number) => 14 + size + 2 + (lines - 1) * (size + 6);

  let valueSize = valueSizes[0];
  let gap = gaps[0];
  let linesByFact: string[][] = [];

  for (let attempt = 0; attempt < valueSizes.length; attempt += 1) {
    valueSize = valueSizes[attempt];
    gap = gaps[attempt];
    const font = `700 ${valueSize}px ${FONT}`;
    linesByFact = facts.map((fact) => wrap(fact.value, factsW, font, 2));
    const height = linesByFact.reduce(
      (total, lines, index) =>
        total + rowHeight(valueSizes[attempt], lines.length) + (index > 0 ? gap : 0),
      0,
    );
    if (height <= factsBottom - factsTop) break;
  }

  let cursor = factsTop;
  const factMarkup = facts
    .map((fact, index) => {
      const lines = linesByFact[index] ?? [];
      const labelY = cursor + 14;
      let markup =
        `<text x="${factsX}" y="${labelY}" fill="${MUTED}" font-family="${FONT}" ` +
        `font-size="16">${esc(fact.label)}</text>`;
      lines.forEach((line, lineIndex) => {
        const valueY = labelY + valueSize + 2 + lineIndex * (valueSize + 6);
        markup +=
          `<text x="${factsX}" y="${valueY}" fill="${fact.tone === "alert" ? ALERT : INK}" ` +
          `font-family="${FONT}" font-size="${valueSize}" font-weight="700" ` +
          `style="font-variant-numeric:tabular-nums">${esc(line)}</text>`;
      });
      cursor += rowHeight(valueSize, lines.length) + (index < facts.length - 1 ? gap : 0);
      return markup;
    })
    .join("");

  // The PIN pill is part of the header, exactly as it is on screen.
  const pinLabel = input.pin ? `PIN ${input.pin}` : "";
  const pillWidth = input.pin ? 26 + 18 + widthOf(pinLabel, `700 15px ${FONT}`) + 18 : 0;
  const pill = input.pin
    ? `<rect x="${CARD_WIDTH - pad - pillWidth}" y="44" width="${pillWidth}" height="38" ` +
      `rx="19" fill="none" stroke="#ffffff33"/>` +
      lockMark(CARD_WIDTH - pad - pillWidth + 14, 55, 16, INK) +
      `<text x="${CARD_WIDTH - pad - pillWidth + 40}" y="69" fill="${INK}" font-family="${FONT}" ` +
      `font-size="15" font-weight="700">${esc(pinLabel)}</text>`
    : "";

  const nameFont = `700 44px ${FONT}`;
  const name = fit(input.name || "Emergency card", CARD_WIDTH - pad * 2, nameFont);

  const noteLines = note ? wrap(note, CARD_WIDTH - pad * 2 - 40, `400 16px ${FONT}`, 2) : [];
  const noteBlock = note
    ? `<rect x="${pad}" y="${noteTop}" width="${CARD_WIDTH - pad * 2}" height="${
        62
      }" rx="12" fill="#ffffff1a"/>` +
      noteLines
        .map(
          (line, index) =>
            `<text x="${pad + 20}" y="${noteTop + 26 + index * 22}" fill="${INK}" ` +
            `font-family="${FONT}" font-size="16">${esc(line)}</text>`,
        )
        .join("")
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" ` +
    `viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${surface}"/>` +
    // Header: shield, the card's own name, then who it is for.
    shieldMark(pad, 42, 34) +
    `<text x="${pad + 48}" y="66" fill="${AMBER}" font-family="${FONT}" font-size="13" ` +
    `font-weight="700" letter-spacing="2.8">EMERGENCY CARD</text>` +
    `<text x="${pad}" y="124" fill="${INK}" font-family="${FONT}" font-size="44" ` +
    `font-weight="700">${esc(name)}</text>` +
    `<text x="${pad}" y="152" fill="${MUTED}" font-family="${FONT}" font-size="18">` +
    `${esc(input.meta)}</text>` +
    pill +
    // The record itself: the code, then the facts beside it.
    qrTile(input.url, tileX, tileY, qrSize) +
    factMarkup +
    noteBlock +
    // Foot
    `<text x="${pad}" y="614" fill="${FAINT}" font-family="${FONT}" font-size="13">` +
    `Card ····${esc(input.tokenLabel)}</text>` +
    `<text x="${CARD_WIDTH - pad}" y="614" fill="${FAINT}" font-family="${FONT}" ` +
    `font-size="13" text-anchor="end">myHealthLog · your health, in your hand</text>` +
    `</svg>`
  );
}

/* --------------------------------------------------------------- exports -- */

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterise any square/rectangular SVG at an explicit size. */
export function svgToPngBlobAt(
  svg: string,
  width: number,
  height: number,
  scale = 1,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not render the image"));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Could not render the image"));
    image.src = svgDataUrl(svg);
  });
}

/** Rasterise at `scale`× the 300 dpi drawing — 2× is ~600 dpi, plenty for print. */
export function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  return svgToPngBlobAt(svg, CARD_WIDTH, CARD_HEIGHT, scale);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Print the card at its actual size. A dedicated iframe keeps the rest of the app
 * out of the print job and lets the page size be the card's own — so what comes out
 * is a credit-card-shaped piece of paper, not an A4 page with a card somewhere on it.
 */
export function printCard(svg: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${CARD_SIZE_MM.width}mm ${CARD_SIZE_MM.height}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    svg { display: block; width: ${CARD_SIZE_MM.width}mm; height: ${CARD_SIZE_MM.height}mm; }
  </style></head><body>${svg}</body></html>`;
  const cleanup = () => window.setTimeout(() => iframe.remove(), 1000);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    win.print();
    win.onafterprint = cleanup;
    window.setTimeout(cleanup, 30_000);
  };
  document.body.appendChild(iframe);
}
