import { Grid } from './automata';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LifeColor = 'white' | 'red' | 'blue' | 'yellow' | 'black';

export const MAX_TICKS = 500;

// ---------------------------------------------------------------------------
// Neighbor counting
// ---------------------------------------------------------------------------

interface LifeCounts {
  white: number;
  red: number;
  blue: number;
  yellow: number;
  black: number;
}

function countNeighbors(grid: Grid<LifeColor>, r: number, c: number): LifeCounts {
  const counts: LifeCounts = { white: 0, red: 0, blue: 0, yellow: 0, black: 0 };
  for (const [nr, nc] of grid.neighbors8(r, c)) {
    counts[grid.get(nr, nc)]++;
  }
  return counts;
}

/** Count distinct non-white, non-black colors among the 8 neighbors. */
function distinctColors(grid: Grid<LifeColor>, r: number, c: number): number {
  const seen = new Set<LifeColor>();
  for (const [nr, nc] of grid.neighbors8(r, c)) {
    const col = grid.get(nr, nc);
    if (col !== 'white' && col !== 'black') seen.add(col);
  }
  return seen.size;
}

// ---------------------------------------------------------------------------
// Rule functions
// ---------------------------------------------------------------------------

function blackRule(grid: Grid<LifeColor>, r: number, c: number): LifeColor {
  let hb = 0, vb = 0, db = 0;

  const dirs: [number, number, 'h' | 'v' | 'd'][] = [
    [-1,  0, 'v'], [1,  0, 'v'],
    [ 0, -1, 'h'], [ 0,  1, 'h'],
    [-1, -1, 'd'], [-1,  1, 'd'],
    [ 1, -1, 'd'], [ 1,  1, 'd'],
  ];

  for (const [dr, dc, axis] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (grid.inBounds(nr, nc) && grid.get(nr, nc) === 'black') {
      if (axis === 'h') hb++;
      else if (axis === 'v') vb++;
      else db++;
    }
  }

  const total = hb + vb + db;
  const dc = distinctColors(grid, r, c);

  // Only persist as a line if bordering at least one colored region
  if (dc >= 1) {
    if (hb === 2 && vb === 0) return 'black';          // horizontal line at boundary
    if (vb === 2 && hb === 0) return 'black';          // vertical line at boundary
    if (total >= 3) return 'black';                    // intersection
    if (hb === 1 && vb === 1 && db === 0) return 'black'; // corner
  }

  return 'white';
}

function colorRule(grid: Grid<LifeColor>, r: number, c: number, self: LifeColor): LifeColor {
  const n = countNeighbors(grid, r, c);
  const ns = n[self];
  const nd = n.red + n.blue + n.yellow - ns; // other-colored, excluding white & black

  // Wide survival range: 1–7 same-color neighbors allows large solid blocks.
  // Standard Life S2-S3 caps block size at 2×2; S1-S7 allows arbitrary rectangles.
  if (ns >= 1 && ns <= 7) {
    // Only convert to black when wedged against multiple different colors
    if (nd >= 3) return 'black';
    return self;
  }
  if (ns === 0) return 'white';  // isolated cell dies
  if (ns === 8) return 'white';  // fully surrounded (rare)
  return self;
}

function whiteRule(grid: Grid<LifeColor>, r: number, c: number): LifeColor {
  const n = countNeighbors(grid, r, c);
  const candidates: LifeColor[] = [];

  // Birth only R/B/Y from white (black forms only at color boundaries)
  for (const color of ['red', 'blue', 'yellow'] as LifeColor[]) {
    if (n[color] >= 3) candidates.push(color);
  }

  if (candidates.length === 0) return 'white';
  if (candidates.length === 1) return candidates[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ---------------------------------------------------------------------------
// Single-cell transition
// ---------------------------------------------------------------------------

function lifeLikeRule(grid: Grid<LifeColor>, r: number, c: number): LifeColor {
  // Frame cells are static — always black
  const last = grid.rows - 1;
  if (r === 0 || r === last || c === 0 || c === last) return 'black';

  const current = grid.get(r, c);
  switch (current) {
    case 'black':  return blackRule(grid, r, c);
    case 'red':    return colorRule(grid, r, c, 'red');
    case 'blue':   return colorRule(grid, r, c, 'blue');
    case 'yellow': return colorRule(grid, r, c, 'yellow');
    case 'white':  return whiteRule(grid, r, c);
  }
}

// ---------------------------------------------------------------------------
// Grid-level operations
// ---------------------------------------------------------------------------

export function initLifeLikeState(size: number, density: number): Grid<LifeColor> {
  const d = Math.max(0, Math.min(1, density));
  const grid = new Grid<LifeColor>(size, size, 'white');

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === 0 || r === size - 1 || c === 0 || c === size - 1) {
        grid.set(r, c, 'black');
        continue;
      }

      const rand = Math.random();
      if (rand < d * 0.40) {
        // 40% * density: colored seeds
        const colors: LifeColor[] = ['red', 'blue', 'yellow'];
        grid.set(r, c, colors[Math.floor(Math.random() * colors.length)]);
      } else if (rand < d * 0.43) {
        // 3% * density: sparse black seeds (only at boundaries between colors)
        grid.set(r, c, 'black');
      } else {
        grid.set(r, c, 'white');
      }
    }
  }

  return grid;
}

export function stepLifeLikeCA(grid: Grid<LifeColor>): Grid<LifeColor> {
  const next = new Grid<LifeColor>(grid.rows, grid.cols, 'white');
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      next.set(r, c, lifeLikeRule(grid, r, c));
    }
  }
  return next;
}

export function hasConverged(a: Grid<LifeColor>, b: Grid<LifeColor>): boolean {
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) {
      if (a.get(r, c) !== b.get(r, c)) return false;
    }
  }
  return true;
}
