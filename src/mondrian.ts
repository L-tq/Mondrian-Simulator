import { Grid } from './automata';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

export type RNG = () => number;

export function createRNG(seed: number): RNG {
  let s = seed | 0;
  return function mulberry32(): number {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LifeColor = 'empty' | 'line' | 'red' | 'blue' | 'yellow' | 'white' | 'black';

export interface MondrianParams {
  targetRectCount: number;
  minRectSize: number;
  /** Minimum gap (in cells) between parallel lines. Default 1, use 2+ to prevent thick lines. */
  lineGap: number;
  lineThickChance: number;
  /** 0-1 probability of extending line segments into adjacent rectangles to create T-junctions. */
  tJunctionRate: number;
  /** 0-1 bias toward aesthetically pleasing proportions (golden ratio, 2:3, etc.) vs random. */
  proportionalBias: number;
  /** Whether to draw a black frame around the canvas. Default false. */
  blackFrame: boolean;
  /** Whether lines stop short of canvas edges (leaving small gaps). Default true. */
  lineEdgeGap: boolean;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Rect {
  r: number; c: number; h: number; w: number;
}

function pickRectToSplit(rects: Rect[], minSize: number, rng: RNG): number {
  const candidates: number[] = [];
  for (let i = 0; i < rects.length; i++) {
    if (rects[i].h >= minSize * 2 + 1 || rects[i].w >= minSize * 2 + 1) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return -1;

  // Weight by area — prefer larger rectangles
  let totalArea = 0;
  const weights: number[] = [];
  for (const i of candidates) {
    const area = rects[i].h * rects[i].w;
    weights.push(area);
    totalArea += area;
  }
  let v = rng() * totalArea;
  for (let j = 0; j < candidates.length; j++) {
    v -= weights[j];
    if (v <= 0) return candidates[j];
  }
  return candidates[candidates.length - 1];
}

/**
 * True if there is an existing parallel line (2+ consecutive line cells)
 * in the given row, spanning at least part of cols [c0,c1).
 */
function rowHasLineSegment(grid: Grid<LifeColor>, checkRow: number, c0: number, c1: number): boolean {
  if (checkRow < 0 || checkRow >= grid.rows) return false;
  let run = 0;
  for (let c = c0; c < c1; c++) {
    if (grid.get(checkRow, c) === 'line') {
      run++;
      if (run >= 2) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function colHasLineSegment(grid: Grid<LifeColor>, checkCol: number, r0: number, r1: number): boolean {
  if (checkCol < 0 || checkCol >= grid.cols) return false;
  let run = 0;
  for (let r = r0; r < r1; r++) {
    if (grid.get(r, checkCol) === 'line') {
      run++;
      if (run >= 2) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/** Check if placing a horizontal line at lineR would be too close to an */
/** existing parallel line within the gap.                               */
function isHorizPositionValid(grid: Grid<LifeColor>, lineR: number, c0: number, c1: number, gap: number): boolean {
  for (let d = 1; d <= gap; d++) {
    if (rowHasLineSegment(grid, lineR - d, c0, c1)) return false;
    if (rowHasLineSegment(grid, lineR + d, c0, c1)) return false;
  }
  return true;
}

function isVertPositionValid(grid: Grid<LifeColor>, lineC: number, r0: number, r1: number, gap: number): boolean {
  for (let d = 1; d <= gap; d++) {
    if (colHasLineSegment(grid, lineC - d, r0, r1)) return false;
    if (colHasLineSegment(grid, lineC + d, r0, r1)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Proportional scoring for aesthetically pleasing splits
// ---------------------------------------------------------------------------

/** Good ratios in Mondrian's work: golden ratio, simple fractions. */
const GOOD_RATIOS = [1.0, 0.618, 0.5, 2/3, 3/5, 3/8];

/** Score how close a ratio is to aesthetically pleasing proportions. 1 = perfect, 0 = poor. */
function proportionScore(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  const r = Math.min(a, b) / Math.max(a, b);
  let best = Infinity;
  for (const gr of GOOD_RATIOS) {
    const d = Math.abs(r - gr);
    if (d < best) best = d;
  }
  return Math.max(0, 1 - best / 0.25);
}

/** Pick a position from candidates, weighted by proportion score when bias > 0. */
function pickWeightedPosition(candidates: number[], minPos: number, maxPos: number, bias: number, rng: RNG): number {
  if (bias <= 0 || candidates.length <= 1) {
    return candidates[Math.floor(rng() * candidates.length)];
  }
  const weights = candidates.map(pos => {
    const sizeA = pos - minPos;
    const sizeB = maxPos - pos;
    const score = proportionScore(sizeA, sizeB);
    return 1 - bias + bias * score; // blend: 1-bias random, bias proportional
  });
  let total = 0;
  for (const w of weights) total += w;
  let v = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    v -= weights[i];
    if (v <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// ---------------------------------------------------------------------------
// Line extension — T-junctions
// ---------------------------------------------------------------------------

/**
 * Extend existing line segments into adjacent colored rectangles to create
 * T-junctions. A line extends until it hits a perpendicular line or the frame edge.
 * Only original (pre-extension) line segments are considered for extension to avoid
 * cascading artifacts.
 */
export function extendLines(grid: Grid<LifeColor>, rate: number, rng: RNG, lineEdgeGap = false, edgeGapCells = 0): void {
  if (rate <= 0) return;
  const size = grid.rows;
  const edgeStop = lineEdgeGap ? edgeGapCells : 0;

  // Snapshot original line cells so extensions don't cascade
  const original: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => grid.get(r, c) === 'line'),
  );

  // Extend horizontal lines left/right (only from original segments)
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!original[r][c]) { c++; continue; }
      const c0 = c;
      while (c < size && original[r][c]) c++;
      const c1 = c;
      if (c1 - c0 < 2) continue; // skip single-cell artifacts

      // Try extend left
      if (c0 > edgeStop && grid.get(r, c0 - 1) !== 'line' && rng() < rate) {
        let ec = c0 - 1;
        while (ec >= edgeStop && grid.get(r, ec) !== 'line') {
          grid.set(r, ec, 'line');
          ec--;
        }
      }
      // Try extend right
      if (c1 < size - edgeStop && grid.get(r, c1) !== 'line' && rng() < rate) {
        let ec = c1;
        while (ec < size - edgeStop && grid.get(r, ec) !== 'line') {
          grid.set(r, ec, 'line');
          ec++;
        }
      }
    }
  }

  // Extend vertical lines up/down (only from original segments)
  for (let c = 0; c < size; c++) {
    let r = 0;
    while (r < size) {
      if (!original[r][c]) { r++; continue; }
      const r0 = r;
      while (r < size && original[r][c]) r++;
      const r1 = r;
      if (r1 - r0 < 2) continue; // skip single-cell artifacts

      // Try extend up
      if (r0 > edgeStop && grid.get(r0 - 1, c) !== 'line' && rng() < rate) {
        let er = r0 - 1;
        while (er >= edgeStop && grid.get(er, c) !== 'line') {
          grid.set(er, c, 'line');
          er--;
        }
      }
      // Try extend down
      if (r1 < size - edgeStop && grid.get(r1, c) !== 'line' && rng() < rate) {
        let er = r1;
        while (er < size - edgeStop && grid.get(er, c) !== 'line') {
          grid.set(er, c, 'line');
          er++;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step-by-step generator
// ---------------------------------------------------------------------------

export interface MondrianState {
  grid: Grid<LifeColor>;
  rects: Rect[];
  phase: 'splitting' | 'coloring' | 'balancing' | 'done';
  params: MondrianParams;
  minRSize: number;
  gap: number;
  rng: RNG;
  seed: number;
  /** Color assigned to each rect (populated when phase transitions to 'coloring'). */
  assignedColors: (LifeColor | null)[];
  /** Indices of non-white rects to animate during 'coloring' phase. */
  paintQueue: number[];
  /** Index into paintQueue of the next rect to flood-fill. */
  colorIndex: number;
  /** Number of swap attempts made during 'balancing' phase. */
  balanceTried: number;
}

export function initMondrianState(size: number, params: MondrianParams, seed?: number): MondrianState {
  const s = seed ?? (Math.random() * 2147483647) | 0;
  return {
    grid: new Grid<LifeColor>(size, size, 'empty'),
    rects: [{ r: 0, c: 0, h: size, w: size }],
    phase: 'splitting',
    params,
    minRSize: Math.max(2, Math.round(params.minRectSize), Math.round(params.lineGap) + 1),
    gap: Math.max(1, Math.round(params.lineGap)),
    rng: createRNG(s),
    seed: s,
    assignedColors: [],
    paintQueue: [],
    colorIndex: 0,
    balanceTried: 0,
  };
}

/** Perform one split, coloring step, or balancing step. Returns true if more steps remain. */
export function stepMondrian(state: MondrianState): boolean {
  if (state.phase === 'done') return false;
  if (state.phase === 'coloring') return stepColoring(state);
  if (state.phase === 'balancing') return stepBalancing(state);

  const size = state.grid.rows;

  if (state.rects.length >= state.params.targetRectCount) {
    return finishMondrian(state);
  }

  const idx = pickRectToSplit(state.rects, state.minRSize, state.rng);
  if (idx < 0) return finishMondrian(state);

  const rect = state.rects[idx];
  state.rects.splice(idx, 1);

  const canSplitH = rect.h >= state.minRSize * 2 + 1;
  const canSplitV = rect.w >= state.minRSize * 2 + 1;

  if (!canSplitH && !canSplitV) {
    state.rects.push(rect);
    return true; // can't split this one, move on
  }

  // Try horizontal first, then vertical, then give up
  type Orientation = 'h' | 'v';
  const prefs: Orientation[] = [];
  if (canSplitH) prefs.push('h');
  if (canSplitV) prefs.push('v');
  // Shuffle
  if (prefs.length === 2 && state.rng() < 0.5) {
    [prefs[0], prefs[1]] = [prefs[1], prefs[0]];
  }

  let placed = false;

  for (const orient of prefs) {
    if (orient === 'h') {
      const maxPos = rect.h - state.minRSize - 1;
      const minPos = state.minRSize;
      const candidates: number[] = [];
      for (let pos = minPos; pos <= maxPos; pos++) {
        if (isHorizPositionValid(state.grid, rect.r + pos, rect.c, rect.c + rect.w, state.gap)) {
          candidates.push(pos);
        }
      }
      if (candidates.length === 0) continue;

      const linePos = pickWeightedPosition(candidates, minPos, maxPos, state.params.proportionalBias, state.rng);
      const lineR = rect.r + linePos;
      // Thick line: check far side for gap+1 range (lineR+1 is our own cell, lineR+2..lineR+1+gap are externals)
      let thickOk = true;
      for (let d = 1; d <= state.gap; d++) {
        if (rowHasLineSegment(state.grid, lineR + 1 + d, rect.c, rect.c + rect.w)) { thickOk = false; break; }
      }
      const canThick = state.rng() < state.params.lineThickChance
        && lineR + 1 < rect.r + rect.h - state.minRSize
        && thickOk;
      const thick = canThick ? 2 : 1;

      const edgeGap = state.params.lineEdgeGap ? state.gap : 0;
      const hStartC = rect.c === 0 ? edgeGap : rect.c;
      const hEndC = rect.c + rect.w === size ? size - edgeGap : rect.c + rect.w;
      for (let t = 0; t < thick; t++) {
        for (let c = hStartC; c < hEndC; c++) {
          state.grid.set(lineR + t, c, 'line');
        }
      }
      state.rects.push({ r: rect.r, c: rect.c, h: linePos, w: rect.w });
      state.rects.push({ r: lineR + thick, c: rect.c, h: rect.h - linePos - thick, w: rect.w });
      placed = true;
      break;
    } else {
      const maxPos = rect.w - state.minRSize - 1;
      const minPos = state.minRSize;
      const candidates: number[] = [];
      for (let pos = minPos; pos <= maxPos; pos++) {
        if (isVertPositionValid(state.grid, rect.c + pos, rect.r, rect.r + rect.h, state.gap)) {
          candidates.push(pos);
        }
      }
      if (candidates.length === 0) continue;

      const linePos = pickWeightedPosition(candidates, minPos, maxPos, state.params.proportionalBias, state.rng);
      const lineC = rect.c + linePos;
      // Thick line: check far side for gap+1 range (lineC+1 is our own cell, lineC+2..lineC+1+gap are externals)
      let thickOk = true;
      for (let d = 1; d <= state.gap; d++) {
        if (colHasLineSegment(state.grid, lineC + 1 + d, rect.r, rect.r + rect.h)) { thickOk = false; break; }
      }
      const canThick = state.rng() < state.params.lineThickChance
        && lineC + 1 < rect.c + rect.w - state.minRSize
        && thickOk;
      const thick = canThick ? 2 : 1;

      const edgeGap = state.params.lineEdgeGap ? state.gap : 0;
      const vStartR = rect.r === 0 ? edgeGap : rect.r;
      const vEndR = rect.r + rect.h === size ? size - edgeGap : rect.r + rect.h;
      for (let t = 0; t < thick; t++) {
        for (let r = vStartR; r < vEndR; r++) {
          state.grid.set(r, lineC + t, 'line');
        }
      }
      state.rects.push({ r: rect.r, c: rect.c, h: rect.h, w: linePos });
      state.rects.push({ r: rect.r, c: lineC + thick, h: rect.h, w: rect.w - linePos - thick });
      placed = true;
      break;
    }
  }

  if (!placed) {
    state.rects.push(rect); // can't split this rectangle, keep it
  }

  return true;
}

function finishMondrian(state: MondrianState): boolean {
  const { rects, params, grid } = state;
  const size = grid.rows;

  // ---- helpers ----
  const touchesFrame = (r: Rect): boolean =>
    r.r === 0 || r.c === 0 || r.r + r.h === size || r.c + r.w === size;

  const area = (r: Rect): number => r.h * r.w;

  // ---- assign colors strategically ----
  // Sort by area descending
  const sorted = rects.map((r, i) => ({ r, i })).sort((a, b) => area(b.r) - area(a.r));
  const assigned = new Array<LifeColor | null>(rects.length).fill(null);

  // Red: assign to 1-2 of the largest non-frame-touching rects
  let redCount = 0;
  for (const { r, i } of sorted) {
    if (redCount >= 2) break;
    if (assigned[i] !== null) continue;
    if (touchesFrame(r) && state.rng() < 0.7) continue; // edge breathing
    if (area(r) < 9) continue; // too small for red
    const roll = state.rng();
    const redProb = 0.6 + 0.4 * (area(r) / area(sorted[0].r)); // bigger = more likely red
    if (roll < redProb) {
      assigned[i] = 'red';
      redCount++;
    }
  }

  // Blue: assign to 1-2 medium rects, prefer near edges/corners
  let blueCount = 0;
  for (const { r, i } of sorted) {
    if (blueCount >= 2) break;
    if (assigned[i] !== null) continue;
    if (area(r) < 6) continue;
    const edgeBonus = touchesFrame(r) ? 0.3 : 0;
    if (state.rng() < 0.35 + edgeBonus) {
      assigned[i] = 'blue';
      blueCount++;
    }
  }

  // Yellow: assign to 1-2 small-medium rects, prefer edges
  let yellowCount = 0;
  for (const { r, i } of sorted) {
    if (yellowCount >= 2) break;
    if (assigned[i] !== null) continue;
    if (area(r) < 4) continue;
    const edgeBonus = touchesFrame(r) ? 0.25 : 0;
    if (state.rng() < 0.3 + edgeBonus) {
      assigned[i] = 'yellow';
      yellowCount++;
    }
  }

  // Black: 0-1 very small rect
  const ascByArea = [...sorted].sort((a, b) => area(a.r) - area(b.r));
  for (const { r, i } of ascByArea) {
    if (assigned[i] !== null) continue;
    if (area(r) > 12) continue;
    if (touchesFrame(r) && state.rng() < 0.5) continue;
    if (state.rng() < 0.15) {
      assigned[i] = 'black';
      break; // only one black
    }
  }

  // Everything else → white
  for (let i = 0; i < rects.length; i++) {
    if (assigned[i] === null) assigned[i] = 'white';
  }

  // Pre-fill white rects (invisible against white background) and
  // build a paint queue of only non-white rects for the animation.
  const paintQueue: number[] = [];
  for (let i = 0; i < rects.length; i++) {
    if (assigned[i] === 'white') {
      const rect = rects[i];
      for (let r = rect.r; r < rect.r + rect.h; r++) {
        for (let c = rect.c; c < rect.c + rect.w; c++) {
          if (grid.get(r, c) === 'empty') grid.set(r, c, 'white');
        }
      }
    } else {
      paintQueue.push(i);
    }
  }

  state.assignedColors = assigned;
  state.paintQueue = paintQueue;
  state.colorIndex = 0;
  state.phase = 'coloring';
  return true;
}

/** Color one non-white rectangle per call. White rects are pre-filled. */
function stepColoring(state: MondrianState): boolean {
  const { rects, assignedColors, paintQueue, grid } = state;
  const qi = state.colorIndex;

  if (qi >= paintQueue.length) {
    state.phase = 'balancing';
    state.balanceTried = 0;
    return true;
  }

  const rectIdx = paintQueue[qi];
  const rect = rects[rectIdx];
  const color = assignedColors[rectIdx]!;
  for (let r = rect.r; r < rect.r + rect.h; r++) {
    for (let c = rect.c; c < rect.c + rect.w; c++) {
      if (grid.get(r, c) === 'empty') {
        grid.set(r, c, color);
      }
    }
  }
  state.colorIndex = qi + 1;
  return state.colorIndex < paintQueue.length;
}

// ---------------------------------------------------------------------------
// Visual weight balancing — step-by-step
// ---------------------------------------------------------------------------

const VISUAL_WEIGHT: Record<string, number> = { red: 1.0, blue: 0.6, yellow: 0.5, black: 0.4, white: 0.05 };
const MAX_BALANCE_ATTEMPTS = 10;

/** Get the color of a rectangle by reading any non-line cell inside it. */
function rectColor(grid: Grid<LifeColor>, rect: Rect): LifeColor {
  for (let r = rect.r; r < rect.r + rect.h; r++) {
    for (let c = rect.c; c < rect.c + rect.w; c++) {
      const v = grid.get(r, c);
      if (v !== 'line') return v;
    }
  }
  return 'white';
}

/** Fill every non-line cell in a rectangle with a color. */
function fillRect(grid: Grid<LifeColor>, rect: Rect, color: LifeColor): void {
  for (let r = rect.r; r < rect.r + rect.h; r++) {
    for (let c = rect.c; c < rect.c + rect.w; c++) {
      if (grid.get(r, c) !== 'line') {
        grid.set(r, c, color);
      }
    }
  }
}

/** Try one color swap to improve visual balance. Returns true if more attempts remain. */
function stepBalancing(state: MondrianState): boolean {
  const { rects, grid } = state;
  const size = grid.rows;
  const geoCenterR = (size - 1) / 2;
  const geoCenterC = (size - 1) / 2;

  function centerOfMass(): { wr: number; wc: number; totalWeight: number } {
    let wr = 0, wc = 0, tw = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const w = r.h * r.w * (VISUAL_WEIGHT[rectColor(grid, r)] ?? 0.05);
      wr += (r.r + r.h / 2) * w;
      wc += (r.c + r.w / 2) * w;
      tw += w;
    }
    return { wr, wc, totalWeight: tw };
  }

  if (state.balanceTried >= MAX_BALANCE_ATTEMPTS) {
    extendLines(grid, state.params.tJunctionRate, state.rng, state.params.lineEdgeGap, state.gap);
    state.phase = 'done';
    return false;
  }

  // Pick two rects with different colors
  let i = 0, j = 0, pickAttempts = 0;
  do {
    i = Math.floor(state.rng() * rects.length);
    j = Math.floor(state.rng() * rects.length);
    pickAttempts++;
  } while ((i === j || rectColor(grid, rects[i]) === rectColor(grid, rects[j])) && pickAttempts < 50);

  if (i !== j) {
    const ci = rectColor(grid, rects[i]);
    const cj = rectColor(grid, rects[j]);
    if (ci !== cj) {
      const before = centerOfMass();
      const beforeDist = Math.hypot(
        before.wr / before.totalWeight - geoCenterR,
        before.wc / before.totalWeight - geoCenterC,
      );

      // Swap
      fillRect(grid, rects[i], cj);
      fillRect(grid, rects[j], ci);

      const after = centerOfMass();
      const afterDist = Math.hypot(
        after.wr / after.totalWeight - geoCenterR,
        after.wc / after.totalWeight - geoCenterC,
      );

      if (afterDist >= beforeDist) {
        // Revert
        fillRect(grid, rects[i], ci);
        fillRect(grid, rects[j], cj);
      }
    }
  }

  state.balanceTried++;
  return state.balanceTried < MAX_BALANCE_ATTEMPTS;
}

/** Convenience wrapper that runs all steps at once. */
export function generateMondrianGrid(size: number, params: MondrianParams, seed?: number): Grid<LifeColor> {
  const state = initMondrianState(size, params, seed);
  while (stepMondrian(state)) { /* run to completion */ }
  return state.grid;
}

// ---------------------------------------------------------------------------
// Region extraction & editing
// ---------------------------------------------------------------------------

export interface ColoredRect {
  r: number; c: number; h: number; w: number;
  color: LifeColor;
}

/** Extract all colored rectangular regions from the grid by scanning for color cells. */
export function extractRegions(grid: Grid<LifeColor>): ColoredRect[] {
  const visited = new Set<number>();
  const regions: ColoredRect[] = [];

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const key = r * grid.cols + c;
      if (visited.has(key)) continue;
      const color = grid.get(r, c);
      if (color === 'empty' || color === 'line') continue;

      // Flood-fill to find the bounding rectangle of this colored region
      let minR = r, maxR = r, minC = c, maxC = c;
      const stack: [number, number][] = [[r, c]];
      visited.add(key);

      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;

        for (const [nr, nc] of grid.neighbors4(cr, cc)) {
          const nk = nr * grid.cols + nc;
          if (!visited.has(nk) && grid.get(nr, nc) === color) {
            visited.add(nk);
            stack.push([nr, nc]);
          }
        }
      }

      regions.push({
        r: minR, c: minC,
        h: maxR - minR + 1,
        w: maxC - minC + 1,
        color,
      });
    }
  }

  return regions;
}

/** Find which region contains cell (r,c). Returns index or -1. */
export function findRegionAt(regions: ColoredRect[], r: number, c: number): number {
  for (let i = regions.length - 1; i >= 0; i--) {
    const rect = regions[i];
    if (r >= rect.r && r < rect.r + rect.h && c >= rect.c && c < rect.c + rect.w) {
      return i;
    }
  }
  return -1;
}

/** Change all cells of a region to a new color. */
export function applyRegionColor(grid: Grid<LifeColor>, region: ColoredRect, newColor: LifeColor): void {
  region.color = newColor;
  for (let r = region.r; r < region.r + region.h; r++) {
    for (let c = region.c; c < region.c + region.w; c++) {
      if (grid.get(r, c) !== 'line') {
        grid.set(r, c, newColor);
      }
    }
  }
}

/** Split a region with a horizontal or vertical line at the given offset from its top/left. */
export function splitRegion(
  grid: Grid<LifeColor>,
  region: ColoredRect,
  regions: ColoredRect[],
  regionIdx: number,
  horizontal: boolean,
  offset: number,
  colorA: LifeColor,
  colorB: LifeColor,
): void {
  if (horizontal) {
    const lineR = region.r + offset;
    for (let c = region.c; c < region.c + region.w; c++) {
      grid.set(lineR, c, 'line');
    }
    const top: ColoredRect = { r: region.r, c: region.c, h: offset, w: region.w, color: colorA };
    const bot: ColoredRect = { r: lineR + 1, c: region.c, h: region.h - offset - 1, w: region.w, color: colorB };
    for (let r = top.r; r < top.r + top.h; r++)
      for (let c = top.c; c < top.c + top.w; c++)
        if (grid.get(r, c) !== 'line') grid.set(r, c, colorA);
    for (let r = bot.r; r < bot.r + bot.h; r++)
      for (let c = bot.c; c < bot.c + bot.w; c++)
        if (grid.get(r, c) !== 'line') grid.set(r, c, colorB);
    regions.splice(regionIdx, 1, top, bot);
  } else {
    const lineC = region.c + offset;
    for (let r = region.r; r < region.r + region.h; r++) {
      grid.set(r, lineC, 'line');
    }
    const left: ColoredRect = { r: region.r, c: region.c, h: region.h, w: offset, color: colorA };
    const right: ColoredRect = { r: region.r, c: lineC + 1, h: region.h, w: region.w - offset - 1, color: colorB };
    for (let r = left.r; r < left.r + left.h; r++)
      for (let c = left.c; c < left.c + left.w; c++)
        if (grid.get(r, c) !== 'line') grid.set(r, c, colorA);
    for (let r = right.r; r < right.r + right.h; r++)
      for (let c = right.c; c < right.c + right.w; c++)
        if (grid.get(r, c) !== 'line') grid.set(r, c, colorB);
    regions.splice(regionIdx, 1, left, right);
  }
}

/** Human-readable reason why two regions cannot be merged, or null if they can. */
export function mergeFailureReason(a: ColoredRect, b: ColoredRect): string | null {
  const aBottom = a.r + a.h;
  const aRight = a.c + a.w;
  const bBottom = b.r + b.h;
  const bRight = b.c + b.w;

  // Horizontal overlap: columns must overlap for vertical adjacency
  const horizOverlap = a.c < bRight && aRight > b.c;
  // Vertical overlap: rows must overlap for horizontal adjacency
  const vertOverlap = a.r < bBottom && aBottom > b.r;

  // Two regions are adjacent if their edges are separated only by line cells
  // (1-3 cell gap). The regions' bounds exclude the line cells, so:
  //   A's bottom edge = a.r + a.h = first line cell row below A
  //   B's top edge  = b.r = first colored cell of B
  // Gap between them is |aBottom - b.r| = line thickness.
  const vGapAB = b.r - aBottom; // positive if A is above B
  const vGapBA = a.r - bBottom; // positive if B is above A
  const hGapAB = b.c - aRight;  // positive if A is left of B
  const hGapBA = a.c - bRight;  // positive if B is left of A

  // Adjacent vertically: one above the other, columns overlap, gap is 1-3 line cells
  if (horizOverlap) {
    if (vGapAB >= 1 && vGapAB <= 3) return null;
    if (vGapBA >= 1 && vGapBA <= 3) return null;
  }

  // Adjacent horizontally: side by side, rows overlap, gap is 1-3 line cells
  if (vertOverlap) {
    if (hGapAB >= 1 && hGapAB <= 3) return null;
    if (hGapBA >= 1 && hGapBA <= 3) return null;
  }

  if (!horizOverlap && !vertOverlap)
    return 'Rectangles do not share any edge — they are diagonal.';
  if (horizOverlap && (vGapAB === 0 || vGapBA === 0))
    return 'Rectangles touch directly with no separating line.';
  if (vertOverlap && (hGapAB === 0 || hGapBA === 0))
    return 'Rectangles touch directly with no separating line.';
  if (horizOverlap && (vGapAB > 3 || vGapBA > 3))
    return 'Rectangles are too far apart — they must be adjacent.';
  if (vertOverlap && (hGapAB > 3 || hGapBA > 3))
    return 'Rectangles are too far apart — they must be adjacent.';
  return 'Rectangles must share a common edge to be merged.';
}

/**
 * Merge two adjacent regions by removing the line between them.
 * Returns the merged region, or null if the regions are not adjacent.
 */
export function mergeRegions(
  grid: Grid<LifeColor>,
  regions: ColoredRect[],
  idxA: number,
  idxB: number,
  mergedColor: LifeColor,
): ColoredRect | null {
  const a = regions[idxA];
  const b = regions[idxB];

  // Determine adjacency direction
  const aBottom = a.r + a.h;
  const aRight = a.c + a.w;
  const bBottom = b.r + b.h;
  const bRight = b.c + b.w;

  let cleared = false;

  // A above B
  if (aBottom <= b.r && a.c < bRight && aRight > b.c) {
    for (let c = Math.max(a.c, b.c); c < Math.min(aRight, bRight); c++) {
      for (let dr = aBottom; dr < b.r; dr++) grid.set(dr, c, mergedColor);
    }
    cleared = true;
  }
  // B above A
  else if (bBottom <= a.r && a.c < bRight && aRight > b.c) {
    for (let c = Math.max(a.c, b.c); c < Math.min(aRight, bRight); c++) {
      for (let dr = bBottom; dr < a.r; dr++) grid.set(dr, c, mergedColor);
    }
    cleared = true;
  }
  // A left of B
  else if (aRight <= b.c && a.r < bBottom && aBottom > b.r) {
    for (let r = Math.max(a.r, b.r); r < Math.min(aBottom, bBottom); r++) {
      for (let dc = aRight; dc < b.c; dc++) grid.set(r, dc, mergedColor);
    }
    cleared = true;
  }
  // B left of A
  else if (bRight <= a.c && a.r < bBottom && aBottom > b.r) {
    for (let r = Math.max(a.r, b.r); r < Math.min(aBottom, bBottom); r++) {
      for (let dc = bRight; dc < a.c; dc++) grid.set(r, dc, mergedColor);
    }
    cleared = true;
  }

  let merged: ColoredRect | null = null;
  if (cleared) {
    merged = {
      r: Math.min(a.r, b.r), c: Math.min(a.c, b.c),
      h: Math.max(aBottom, bBottom) - Math.min(a.r, b.r),
      w: Math.max(aRight, bRight) - Math.min(a.c, b.c),
      color: mergedColor,
    };
  }

  if (merged) {
    // Recolor the merged area
    for (let r = merged.r; r < merged.r + merged.h; r++) {
      for (let c = merged.c; c < merged.c + merged.w; c++) {
        if (grid.get(r, c) !== 'line') {
          grid.set(r, c, mergedColor);
        }
      }
    }
    // Replace the two regions with the merged one
    const minIdx = Math.min(idxA, idxB);
    const maxIdx = Math.max(idxA, idxB);
    regions.splice(maxIdx, 1);
    regions.splice(minIdx, 1, merged);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Line segment extraction & edge toggling
// ---------------------------------------------------------------------------

export interface LineSegment {
  horizontal: boolean;
  r0: number; c0: number;
  r1: number; c1: number;
}

/** Extract all line segments from the grid by tracing contiguous line cells. */
export function extractLineSegments(grid: Grid<LifeColor>): LineSegment[] {
  const visited = new Set<number>();
  const size = grid.rows;
  const segments: LineSegment[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = r * size + c;
      if (visited.has(key)) continue;
      if (grid.get(r, c) !== 'line') continue;

      // Trace horizontally (both directions)
      let c0 = c, c1 = c;
      while (c0 - 1 >= 0 && grid.get(r, c0 - 1) === 'line') c0--;
      while (c1 + 1 < size && grid.get(r, c1 + 1) === 'line') c1++;
      // Trace vertically (both directions)
      let r0 = r, r1 = r;
      while (r0 - 1 >= 0 && grid.get(r0 - 1, c) === 'line') r0--;
      while (r1 + 1 < size && grid.get(r1 + 1, c) === 'line') r1++;

      const hLen = c1 - c0 + 1;
      const vLen = r1 - r0 + 1;

      // Pick the longer direction (prefer horizontal for ties)
      if (hLen >= vLen) {
        // Mark all cells in this horizontal span as visited
        for (let cc = c0; cc <= c1; cc++) visited.add(r * size + cc);
        if (hLen >= 2) {
          segments.push({ horizontal: true, r0: r, c0, r1: r, c1 });
        }
      } else {
        // Mark all cells in this vertical span as visited
        for (let rr = r0; rr <= r1; rr++) visited.add(rr * size + c);
        if (vLen >= 2) {
          segments.push({ horizontal: false, r0, c0: c, r1, c1: c });
        }
      }

      // Mark the starting cell
      visited.add(key);
    }
  }

  return segments;
}

/** Check if a line segment touches a canvas edge. */
export function lineTouchesEdge(seg: LineSegment, size: number): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
  if (seg.horizontal) {
    return {
      left: seg.c0 === 0,
      right: seg.c1 === size - 1,
      top: false,
      bottom: false,
    };
  } else {
    return {
      left: false,
      right: false,
      top: seg.r0 === 0,
      bottom: seg.r1 === size - 1,
    };
  }
}

/**
 * Toggle whether a line segment touches a given canvas edge.
 * Returns true if a change was made.
 */
export function toggleLineEdgeTouch(
  grid: Grid<LifeColor>,
  seg: LineSegment,
  edge: 'left' | 'right' | 'top' | 'bottom',
  edgeGap: number,
): boolean {
  const size = grid.rows;

  if (seg.horizontal && (edge === 'left' || edge === 'right')) {
    if (edge === 'left' && seg.c0 <= edgeGap) {
      if (seg.c0 === 0) {
        // Currently touches — trim it
        const adjColor = grid.get(seg.r0, edgeGap) === 'line' ? 'white' : (grid.get(seg.r0, edgeGap) as LifeColor);
        for (let c = 0; c < edgeGap && c <= seg.c1; c++) {
          if (grid.get(seg.r0, c) === 'line') grid.set(seg.r0, c, adjColor === 'line' ? 'white' : adjColor);
        }
        return true;
      } else {
        // Currently doesn't touch — extend it
        for (let c = 0; c < seg.c0; c++) grid.set(seg.r0, c, 'line');
        return true;
      }
    }
    if (edge === 'right' && seg.c1 >= size - 1 - edgeGap) {
      if (seg.c1 === size - 1) {
        // Currently touches — trim it
        const adjColor = grid.get(seg.r0, size - 1 - edgeGap) === 'line' ? 'white' : (grid.get(seg.r0, size - 1 - edgeGap) as LifeColor);
        for (let c = size - edgeGap; c < size; c++) {
          if (grid.get(seg.r0, c) === 'line') grid.set(seg.r0, c, adjColor === 'line' ? 'white' : adjColor);
        }
        return true;
      } else {
        // Currently doesn't touch — extend it
        for (let c = seg.c1 + 1; c < size; c++) grid.set(seg.r0, c, 'line');
        return true;
      }
    }
  }

  if (!seg.horizontal && (edge === 'top' || edge === 'bottom')) {
    if (edge === 'top' && seg.r0 <= edgeGap) {
      if (seg.r0 === 0) {
        const adjColor = grid.get(edgeGap, seg.c0) === 'line' ? 'white' : (grid.get(edgeGap, seg.c0) as LifeColor);
        for (let r = 0; r < edgeGap && r <= seg.r1; r++) {
          if (grid.get(r, seg.c0) === 'line') grid.set(r, seg.c0, adjColor === 'line' ? 'white' : adjColor);
        }
        return true;
      } else {
        for (let r = 0; r < seg.r0; r++) grid.set(r, seg.c0, 'line');
        return true;
      }
    }
    if (edge === 'bottom' && seg.r1 >= size - 1 - edgeGap) {
      if (seg.r1 === size - 1) {
        const adjColor = grid.get(size - 1 - edgeGap, seg.c0) === 'line' ? 'white' : (grid.get(size - 1 - edgeGap, seg.c0) as LifeColor);
        for (let r = size - edgeGap; r < size; r++) {
          if (grid.get(r, seg.c0) === 'line') grid.set(r, seg.c0, adjColor === 'line' ? 'white' : adjColor);
        }
        return true;
      } else {
        for (let r = seg.r1 + 1; r < size; r++) grid.set(r, seg.c0, 'line');
        return true;
      }
    }
  }

  return false;
}

/** Find all line segments that contain cell (r,c). At intersections there may be two. */
export function findLineSegmentsAt(segments: LineSegment[], r: number, c: number): LineSegment[] {
  const found: LineSegment[] = [];
  for (const seg of segments) {
    if (seg.horizontal) {
      if (seg.r0 === r && c >= seg.c0 && c <= seg.c1) found.push(seg);
    } else {
      if (seg.c0 === c && r >= seg.r0 && r <= seg.r1) found.push(seg);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Debug
// ---------------------------------------------------------------------------

export function dumpGrid(grid: Grid<LifeColor>): void {
  const CHAR: Record<LifeColor, string> = {
    empty: '·', line: 'L', red: 'R', blue: 'B', yellow: 'Y', white: 'W', black: '#',
  };
  const lines: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    let line = '';
    for (let c = 0; c < grid.cols; c++) {
      line += CHAR[grid.get(r, c)];
    }
    lines.push(line);
  }
  console.log(lines.join('\n'));
}
