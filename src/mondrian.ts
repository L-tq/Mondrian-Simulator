import { Grid } from './automata';

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
  redRate: number;
  blueRate: number;
  yellowRate: number;
  whiteRate: number;
  blackRate: number;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Rect {
  r: number; c: number; h: number; w: number;
}

function pickColor(params: MondrianParams): LifeColor | null {
  const r = Math.max(0, params.redRate);
  const b = Math.max(0, params.blueRate);
  const y = Math.max(0, params.yellowRate);
  const w = Math.max(0, params.whiteRate);
  const k = Math.max(0, params.blackRate);
  const total = r + b + y + w + k;
  if (total <= 0) return null;
  let v = Math.random() * total;
  if ((v -= r) < 0) return 'red';
  if ((v -= b) < 0) return 'blue';
  if ((v -= y) < 0) return 'yellow';
  if ((v -= w) < 0) return 'white';
  return 'black';
}

function pickRectToSplit(rects: Rect[], minSize: number): number {
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
  let v = Math.random() * totalArea;
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
// Step-by-step generator
// ---------------------------------------------------------------------------

export interface MondrianState {
  grid: Grid<LifeColor>;
  rects: Rect[];
  phase: 'splitting' | 'done';
  params: MondrianParams;
  minRSize: number;
  gap: number;
}

export function initMondrianState(size: number, params: MondrianParams): MondrianState {
  return {
    grid: new Grid<LifeColor>(size, size, 'empty'),
    rects: [{ r: 0, c: 0, h: size, w: size }],
    phase: 'splitting',
    params,
    minRSize: Math.max(2, Math.round(params.minRectSize), Math.round(params.lineGap) + 1),
    gap: Math.max(1, Math.round(params.lineGap)),
  };
}

/** Perform one split or the final flood-fill. Returns true if more steps remain. */
export function stepMondrian(state: MondrianState): boolean {
  if (state.phase === 'done') return false;

  if (state.rects.length >= state.params.targetRectCount) {
    return finishMondrian(state);
  }

  const idx = pickRectToSplit(state.rects, state.minRSize);
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
  if (prefs.length === 2 && Math.random() < 0.5) {
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

      const linePos = candidates[Math.floor(Math.random() * candidates.length)];
      const lineR = rect.r + linePos;
      // Thick line: check far side for gap+1 range (lineR+1 is our own cell, lineR+2..lineR+1+gap are externals)
      let thickOk = true;
      for (let d = 1; d <= state.gap; d++) {
        if (rowHasLineSegment(state.grid, lineR + 1 + d, rect.c, rect.c + rect.w)) { thickOk = false; break; }
      }
      const canThick = Math.random() < state.params.lineThickChance
        && lineR + 1 < rect.r + rect.h - state.minRSize
        && thickOk;
      const thick = canThick ? 2 : 1;

      for (let t = 0; t < thick; t++) {
        for (let c = rect.c; c < rect.c + rect.w; c++) {
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

      const linePos = candidates[Math.floor(Math.random() * candidates.length)];
      const lineC = rect.c + linePos;
      // Thick line: check far side for gap+1 range (lineC+1 is our own cell, lineC+2..lineC+1+gap are externals)
      let thickOk = true;
      for (let d = 1; d <= state.gap; d++) {
        if (colHasLineSegment(state.grid, lineC + 1 + d, rect.r, rect.r + rect.h)) { thickOk = false; break; }
      }
      const canThick = Math.random() < state.params.lineThickChance
        && lineC + 1 < rect.c + rect.w - state.minRSize
        && thickOk;
      const thick = canThick ? 2 : 1;

      for (let t = 0; t < thick; t++) {
        for (let r = rect.r; r < rect.r + rect.h; r++) {
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
  for (const rect of state.rects) {
    const color = pickColor(state.params) ?? 'white';
    for (let r = rect.r; r < rect.r + rect.h; r++) {
      for (let c = rect.c; c < rect.c + rect.w; c++) {
        if (state.grid.get(r, c) === 'empty') {
          state.grid.set(r, c, color);
        }
      }
    }
  }
  state.phase = 'done';
  return false;
}

/** Convenience wrapper that runs all steps at once. */
export function generateMondrianGrid(size: number, params: MondrianParams): Grid<LifeColor> {
  const state = initMondrianState(size, params);
  while (stepMondrian(state)) { /* run to completion */ }
  return state.grid;
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
