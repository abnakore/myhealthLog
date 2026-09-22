/**
 * A dependency-free QR code encoder — byte mode, ECC levels L/M/Q/H, versions 1–10.
 *
 * The app's only QR need is the emergency link (Phase 3.1): a short URL that must be
 * *genuinely scannable* off a printed card or a phone lock screen, with no new runtime
 * dependency and no network call. This implements the QR specification directly:
 * byte-mode segments, Reed–Solomon error correction over GF(256), function patterns,
 * format/version info, zigzag placement, and the eight masks scored by the standard
 * penalty rules.
 *
 * Version 10 in byte mode carries ~217 characters at ECC M (more at L), which is far
 * more than any emergency URL needs; longer input throws rather than silently
 * producing an unreadable code. On the backend's arrival this file can retire in
 * favour of a server-generated image — the component API stays the same.
 *
 * Structure and tables follow Nayuki's public-domain QR Code generator.
 */

export type QrEccLevel = "L" | "M" | "Q" | "H";

/** The spec's four-module margin, in modules. The renderer adds it around the symbol. */
export const QUIET_ZONE = 4;

export interface QrMatrix {
  /** Modules per side (21 for version 1, +4 per version). */
  size: number;
  /** Row-major cells, `1` = dark, `0` = light. Quiet zone is added at render time. */
  modules: Uint8Array;
}

/** Format-information bits per level, per the spec. */
const ECC_FORMAT_BITS: Record<QrEccLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** ECC codewords per block, versions 1–10, indexed [level][version − 1]. */
const ECC_CODEWORDS_PER_BLOCK: Record<QrEccLevel, readonly number[]> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};

/** ECC blocks per version, versions 1–10, indexed [level][version − 1]. */
const NUM_ECC_BLOCKS: Record<QrEccLevel, readonly number[]> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

const MAX_VERSION = 10;
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** Raw data modules a version offers, before ECC codewords and residue bits. */
function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords a version/level can carry (the rest is error correction). */
function numDataCodewords(version: number, level: QrEccLevel): number {
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[level][version - 1];
  const blocks = NUM_ECC_BLOCKS[level][version - 1];
  return Math.floor(numRawDataModules(version) / 8) - eccPerBlock * blocks;
}

/** Centre coordinates of alignment patterns for a version (empty for version 1). */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  // The last position is fixed by the version and the rest step back from it. The
  // division is the spec's integer division — a rounded-up step puts the pattern on
  // the wrong module and the symbol stops decoding. (Version 32 is the one version
  // whose spacing the spec sets explicitly; out of range at our version cap, kept so
  // the formula stays the spec's rather than this file's.)
  const step =
    version === 32
      ? 26
      : Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
  const positions = [6];
  for (let i = 0, pos = version * 4 + 10; i < numAlign - 1; i += 1, pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

/* --------------------------------------------------------------- GF(256) -- */

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Generator polynomial of the given degree for Reed–Solomon division. */
function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** ECC codewords for one block of data, under the given generator polynomial. */
function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, i) => {
      result[i] ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
}

/* ------------------------------------------------------------ codewords -- */

/** Segment the text (UTF-8, byte mode) and pad it into data codewords. */
function buildDataCodewords(text: string, version: number, level: QrEccLevel): number[] {
  const bytes = new TextEncoder().encode(text);
  const capacityBits = numDataCodewords(version, level) * 8;
  const countBits = version <= 9 ? 8 : 16;
  if (4 + countBits + bytes.length * 8 > capacityBits) {
    throw new Error(`Text too long for a version ${version} QR code at ECC ${level}`);
  }

  const bits: boolean[] = [];
  const appendBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push(((value >>> i) & 1) !== 0);
  };

  appendBits(0x4, 4); // byte mode
  appendBits(bytes.length, countBits);
  for (const byte of bytes) appendBits(byte, 8);
  appendBits(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(false);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    codewords.push(byte);
  }
  return codewords;
}

/** Split data into blocks, compute each block's ECC, and interleave everything. */
function interleaveWithEcc(data: readonly number[], version: number, level: QrEccLevel): number[] {
  const numBlocks = NUM_ECC_BLOCKS[level][version - 1];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[level][version - 1];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const blockData = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += blockData.length;
    const ecc = rsRemainder(blockData, divisor);
    const padded = [...blockData];
    if (i < numShortBlocks) padded.push(0); // room for the extra data byte, dropped below
    blocks.push([...padded, ...ecc]);
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

/* -------------------------------------------------------------- the grid -- */

interface QrGrid {
  size: number;
  /** 1 = dark, 0 = light. */
  modules: Uint8Array;
  /** 1 = function pattern, format or version info — data never lands here. */
  reserved: Uint8Array;
}

function setFunctionModule(grid: QrGrid, x: number, y: number, dark: boolean): void {
  const i = y * grid.size + x;
  grid.modules[i] = dark ? 1 : 0;
  grid.reserved[i] = 1;
}

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

function drawFunctionPatterns(grid: QrGrid, version: number, level: QrEccLevel): void {
  const { size } = grid;
  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    setFunctionModule(grid, 6, i, i % 2 === 0);
    setFunctionModule(grid, i, 6, i % 2 === 0);
  }
  // Finder patterns and their separators.
  drawFinderPattern(grid, 3, 3);
  drawFinderPattern(grid, size - 4, 3);
  drawFinderPattern(grid, 3, size - 4);
  // Alignment patterns (skipping the three finder corners).
  const positions = alignmentPositions(version);
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === positions.length - 1) ||
        (i === positions.length - 1 && j === 0);
      if (!corner) drawAlignmentPattern(grid, positions[i], positions[j]);
    }
  }
  // Format bits (placeholder mask; redrawn per mask) and version info.
  drawFormatBits(grid, level, 0);
  drawVersionInfo(grid, version);
}

function drawFinderPattern(grid: QrGrid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= grid.size || y < 0 || y >= grid.size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(grid, x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignmentPattern(grid: QrGrid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(grid, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/** 15-bit BCH format info: level + mask, XORed with the spec's 0x5412 mask. */
function drawFormatBits(grid: QrGrid, level: QrEccLevel, mask: number): void {
  const data = (ECC_FORMAT_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const { size } = grid;

  // First copy — around the top-left finder.
  for (let i = 0; i <= 5; i += 1) setFunctionModule(grid, 8, i, getBit(bits, i));
  setFunctionModule(grid, 8, 7, getBit(bits, 6));
  setFunctionModule(grid, 8, 8, getBit(bits, 7));
  setFunctionModule(grid, 7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) setFunctionModule(grid, 14 - i, 8, getBit(bits, i));

  // Second copy — split across the top-right and bottom-left.
  for (let i = 0; i < 8; i += 1) setFunctionModule(grid, size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i += 1) setFunctionModule(grid, 8, size - 15 + i, getBit(bits, i));
  setFunctionModule(grid, 8, size - 8, true); // the always-dark module
}

/** 18-bit BCH version info — versions 7 and up only. */
function drawVersionInfo(grid: QrGrid, version: number): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  const { size } = grid;
  for (let i = 0; i < 18; i += 1) {
    const dark = getBit(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(grid, a, b, dark);
    setFunctionModule(grid, b, a, dark);
  }
}

/** Lay codewords into the non-function modules, in the spec's two-column zigzag. */
function drawCodewords(grid: QrGrid, codewords: readonly number[]): void {
  const { size } = grid;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // step around the vertical timing pattern
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        const idx = y * size + x;
        if (!grid.reserved[idx] && i < codewords.length * 8) {
          grid.modules[idx] = getBit(codewords[i >>> 3], 7 - (i & 7)) ? 1 : 0;
          i += 1;
        }
      }
    }
  }
}

/** XOR the chosen mask pattern over the data modules (never over function modules). */
function applyMask(grid: QrGrid, mask: number): void {
  const { size, modules, reserved } = grid;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      if (reserved[idx]) continue;
      let invert: boolean;
      switch (mask) {
        case 0:
          invert = (x + y) % 2 === 0;
          break;
        case 1:
          invert = y % 2 === 0;
          break;
        case 2:
          invert = x % 3 === 0;
          break;
        case 3:
          invert = (x + y) % 3 === 0;
          break;
        case 4:
          invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
          break;
        case 5:
          invert = ((x * y) % 2) + ((x * y) % 3) === 0;
          break;
        case 6:
          invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
          break;
        default:
          invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
          break;
      }
      if (invert) modules[idx] ^= 1;
    }
  }
}

/* ------------------------------------------------------------- penalties -- */
/* The spec's four penalty rules, which together decide which mask reads most
   cleanly. A scanner can read any of the eight; this picks the one least likely to
   be confused by the finder patterns or a printer's dot gain. */

/** Track the last seven run lengths while scanning a row or column. */
function finderPenaltyAddHistory(runLength: number, runHistory: number[], size: number): void {
  let current = runLength;
  if (runHistory[0] === 0) current += size; // treat the outside of the symbol as light
  runHistory.pop();
  runHistory.unshift(current);
}

/** 1:1:3:1:1 (plus a wide light run on one side) is a finder pattern in disguise. */
function countFinderLikePatterns(runHistory: readonly number[]): number {
  const n = runHistory[1];
  const core =
    n > 0 &&
    runHistory[2] === n &&
    runHistory[3] === n * 3 &&
    runHistory[4] === n &&
    runHistory[5] === n;
  return (
    (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
    (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
  );
}

/** Flush the run in progress at the end of a row/column and score what it completed. */
function finderPenaltyTerminateAndCount(
  currentRunColor: boolean,
  currentRunLength: number,
  runHistory: number[],
  size: number,
): number {
  let runLength = currentRunLength;
  if (currentRunColor) {
    finderPenaltyAddHistory(runLength, runHistory, size);
    runLength = 0;
  }
  runLength += size;
  finderPenaltyAddHistory(runLength, runHistory, size);
  return countFinderLikePatterns(runHistory);
}

function getPenaltyScore(grid: QrGrid): number {
  const { size, modules } = grid;
  let result = 0;

  // N1 (runs of five or more) and N3 (finder-like bands), per row then per column.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let line = 0; line < size; line += 1) {
      let runColor = false;
      let runLength = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < size; i += 1) {
        const dark = (pass === 0 ? modules[line * size + i] : modules[i * size + line]) === 1;
        if (dark === runColor) {
          runLength += 1;
          if (runLength === 5) result += PENALTY_N1;
          else if (runLength > 5) result += 1;
        } else {
          finderPenaltyAddHistory(runLength, runHistory, size);
          if (!runColor) result += countFinderLikePatterns(runHistory) * PENALTY_N3;
          runColor = dark;
          runLength = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runLength, runHistory, size) * PENALTY_N3;
    }
  }

  // N2: every 2×2 block of one colour.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const colour = modules[y * size + x];
      if (
        colour === modules[y * size + x + 1] &&
        colour === modules[(y + 1) * size + x] &&
        colour === modules[(y + 1) * size + x + 1]
      ) {
        result += PENALTY_N2;
      }
    }
  }

  // N4: how far the dark/light balance is from an even split.
  let dark = 0;
  for (let i = 0; i < modules.length; i += 1) dark += modules[i];
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return result + k * PENALTY_N4;
}

/* ------------------------------------------------------------- the maker -- */

/**
 * Encode `text` as a QR code and return the module grid. The quiet zone is not
 * included — the renderer adds it, because a printed card needs clean space around
 * the code and a scanner needs that space to be part of the "paper", not the SVG's
 * own edge.
 *
 * The smallest version that fits is used, so the code stays as coarse as possible
 * for its content and therefore scans well at small printed sizes.
 */
export function qrMatrix(text: string, level: QrEccLevel = "M"): QrMatrix {
  const byteLength = new TextEncoder().encode(text).length;
  let version = 1;
  while (
    version <= MAX_VERSION &&
    numDataCodewords(version, level) * 8 < 4 + (version <= 9 ? 8 : 16) + byteLength * 8
  ) {
    version += 1;
  }
  if (version > MAX_VERSION) {
    throw new Error(
      `Text is too long for a version ${MAX_VERSION} QR code at ECC ${level} (${byteLength} bytes)`,
    );
  }

  const size = version * 4 + 17;
  const grid: QrGrid = {
    size,
    modules: new Uint8Array(size * size),
    reserved: new Uint8Array(size * size),
  };

  drawFunctionPatterns(grid, version, level);
  drawCodewords(grid, interleaveWithEcc(buildDataCodewords(text, version, level), version, level));

  // Try all eight masks and keep the lowest-penalty one — ties go to the lower
  // index, matching the reference implementations.
  let bestPenalty = Infinity;
  let bestModules = grid.modules.slice();
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(grid, mask);
    drawFormatBits(grid, level, mask);
    const penalty = getPenaltyScore(grid);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestModules = grid.modules.slice();
    }
    applyMask(grid, mask); // XOR again to undo it
  }

  return { size, modules: bestModules };
}

/** A standalone SVG document for download or print — white quiet zone, dark modules.
    The same symbol the component draws, as a file a printer or a lock screen can
    hold without the app anywhere nearby. */
export function qrSvgMarkup(text: string, px = 512, level: QrEccLevel = "M"): string {
  const matrix = qrMatrix(text, level);
  const span = matrix.size + QUIET_ZONE * 2;
  let path = "";
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y * matrix.size + x] === 1) {
        path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
    `viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">` +
    `<rect width="${span}" height="${span}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#1a1512"/>` +
    `</svg>`
  );
}
