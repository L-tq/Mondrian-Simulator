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

  let merged: ColoredRect | null = null;

  // A above B, sharing same columns?
  if (aBottom <= b.r && a.c < bRight && aRight > b.c) {
    const lineR = aBottom;
    // Remove the line
    for (let c = Math.max(a.c, b.c); c < Math.min(aRight, bRight); c++) {
      grid.set(lineR, c, mergedColor);
      // Also clear adjacent line cells if they exist
      if (lineR + 1 < grid.rows && grid.get(lineR + 1, c) === 'line') grid.set(lineR + 1, c, mergedColor);
      if (lineR - 1 >= 0 && grid.get(lineR - 1, c) === 'line') grid.set(lineR - 1, c, mergedColor);
    }
    merged = {
      r: Math.min(a.r, b.r), c: Math.min(a.c, b.c),
      h: Math.max(aBottom, bBottom) - Math.min(a.r, b.r),
      w: Math.max(aRight, bRight) - Math.min(a.c, b.c),
      color: mergedColor,
    };
  }
  // A left of B, sharing same rows?
  else if (aRight <= b.c && a.r < bBottom && aBottom > b.r) {
    const lineC = aRight;
    for (let r = Math.max(a.r, b.r); r < Math.min(aBottom, bBottom); r++) {
      grid.set(r, lineC, mergedColor);
      if (lineC + 1 < grid.cols && grid.get(r, lineC + 1) === 'line') grid.set(r, lineC + 1, mergedColor);
      if (lineC - 1 >= 0 && grid.get(r, lineC - 1) === 'line') grid.set(r, lineC - 1, mergedColor);
    }
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
