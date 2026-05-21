import { Grid, runCA, CellUpdater } from './automata';

export type ColorName = 'white' | 'red' | 'blue' | 'yellow' | 'black' | 'gray';

export type Cell =
  | { kind: 'block'; color: ColorName }
  | { kind: 'hLine' }
  | { kind: 'vLine' }
  | { kind: 'both' };

export const COLORS: Record<ColorName, string> = {
  white: '#F8F6F0',
  red: '#C82020',
  blue: '#1E5090',
  yellow: '#E8C800',
  black: '#141414',
  gray: '#B8B8B0',
};

export interface MondrianState {
  grid: Grid<Cell>;
  size: number;
}

function block(color: ColorName = 'white'): Cell {
  return { kind: 'block', color };
}

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function randChoice<T>(items: T[]): T {
  return items[randInt(items.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isLine(kind: string): boolean {
  return kind === 'hLine' || kind === 'vLine' || kind === 'both';
}

function isHLike(kind: string): boolean {
  return kind === 'hLine' || kind === 'both';
}

function isVLike(kind: string): boolean {
  return kind === 'vLine' || kind === 'both';
}

// ---------------------------------------------------------------------------
// Phase 1 — Line network formation
// ---------------------------------------------------------------------------

// Scan horizontally from (row, col) in direction dir for an hLine-like cell.
// Returns distance to nearest hLine-like cell, or max+1 if none found within range.
function hScanDist(grid: Grid<Cell>, row: number, col: number, dir: -1 | 1, max: number): number {
  for (let d = 1; d <= max; d++) {
    const c = col + d * dir;
    if (!grid.inBounds(row, c)) return max + 1;
    if (isHLike(grid.get(row, c).kind)) return d;
  }
  return max + 1;
}

function vScanDist(grid: Grid<Cell>, row: number, col: number, dir: -1 | 1, max: number): number {
  for (let d = 1; d <= max; d++) {
    const r = row + d * dir;
    if (!grid.inBounds(r, col)) return max + 1;
    if (isVLike(grid.get(r, col).kind)) return d;
  }
  return max + 1;
}

function lineFormationUpdater(): CellUpdater<Cell> {
  const maxScan = 4;

  return (grid, row, col) => {
    const cell = grid.get(row, col);
    const kind = cell.kind;
    const isEdge = row === 0 || row === grid.rows - 1 || col === 0 || col === grid.cols - 1;

    // --- Handle hLine cells ---
    if (kind === 'hLine') {
      const lDist = hScanDist(grid, row, col, -1, maxScan);
      const rDist = hScanDist(grid, row, col, 1, maxScan);
      const isolated = lDist > maxScan && rDist > maxScan;

      if (isolated) {
        return Math.random() < (isEdge ? 0.6 : 0.15) ? cell : block();
      }
      // Survive if has nearby same-direction neighbor
      if (lDist <= 2 || rDist <= 2) return cell;
      if (lDist <= 3 && rDist <= 3) return cell;
      // Weak connection — chance to die
      return Math.random() < 0.2 ? block() : cell;
    }

    // --- Handle vLine cells ---
    if (kind === 'vLine') {
      const uDist = vScanDist(grid, row, col, -1, maxScan);
      const dDist = vScanDist(grid, row, col, 1, maxScan);
      const isolated = uDist > maxScan && dDist > maxScan;

      if (isolated) {
        return Math.random() < (isEdge ? 0.6 : 0.15) ? cell : block();
      }
      if (uDist <= 2 || dDist <= 2) return cell;
      if (uDist <= 3 && dDist <= 3) return cell;
      return Math.random() < 0.2 ? block() : cell;
    }

    // --- Handle both (intersection) cells ---
    if (kind === 'both') {
      const lDist = hScanDist(grid, row, col, -1, maxScan);
      const rDist = hScanDist(grid, row, col, 1, maxScan);
      const uDist = vScanDist(grid, row, col, -1, maxScan);
      const dDist = vScanDist(grid, row, col, 1, maxScan);

      const hIsolated = lDist > maxScan && rDist > maxScan;
      const vIsolated = uDist > maxScan && dDist > maxScan;

      if (hIsolated && vIsolated) return block();
      if (hIsolated) return { kind: 'vLine' };
      if (vIsolated) return { kind: 'hLine' };
      return cell;
    }

    // --- Handle block cells — gap filling ---
    const lDist = hScanDist(grid, row, col, -1, maxScan);
    const rDist = hScanDist(grid, row, col, 1, maxScan);
    const uDist = vScanDist(grid, row, col, -1, maxScan);
    const dDist = vScanDist(grid, row, col, 1, maxScan);

    const hGap = lDist + rDist;
    const vGap = uDist + dDist;
    const canBridgeH = lDist <= maxScan && rDist <= maxScan && hGap <= 3;
    const canBridgeV = uDist <= maxScan && dDist <= maxScan && vGap <= 3;

    if (canBridgeH && canBridgeV) {
      return hGap <= vGap ? { kind: 'hLine' } : { kind: 'vLine' };
    }
    if (canBridgeH) return { kind: 'hLine' };
    if (canBridgeV) return { kind: 'vLine' };

    return cell;
  };
}

// ---------------------------------------------------------------------------
// Phase 1b — Intersection detection and thickness control
// ---------------------------------------------------------------------------

function intersectionUpdater(): CellUpdater<Cell> {
  return (grid, row, col) => {
    const cell = grid.get(row, col);
    const kind = cell.kind;

    // Mark intersections where hLine and vLine cross
    if (kind === 'hLine') {
      const above = row > 0 ? grid.get(row - 1, col).kind : null;
      const below = row < grid.rows - 1 ? grid.get(row + 1, col).kind : null;
      if (isVLike(above ?? '') || isVLike(below ?? '')) {
        return { kind: 'both' };
      }
      return cell;
    }

    if (kind === 'vLine') {
      const left = col > 0 ? grid.get(row, col - 1).kind : null;
      const right = col < grid.cols - 1 ? grid.get(row, col + 1).kind : null;
      if (isHLike(left ?? '') || isHLike(right ?? '')) {
        return { kind: 'both' };
      }
      return cell;
    }

    return cell;
  };
}

// Remove middle line when three parallel lines are stacked
function thicknessUpdater(): CellUpdater<Cell> {
  return (grid, row, col) => {
    const cell = grid.get(row, col);

    if (cell.kind === 'hLine' || cell.kind === 'both') {
      const above = row > 0 ? grid.get(row - 1, col).kind : '';
      const below = row < grid.rows - 1 ? grid.get(row + 1, col).kind : '';
      if (isHLike(above) && isHLike(below)) {
        return cell.kind === 'both' ? { kind: 'vLine' } : block();
      }
    }

    if (cell.kind === 'vLine' || cell.kind === 'both') {
      const left = col > 0 ? grid.get(row, col - 1).kind : '';
      const right = col < grid.cols - 1 ? grid.get(row, col + 1).kind : '';
      if (isVLike(left) && isVLike(right)) {
        return cell.kind === 'both' ? { kind: 'hLine' } : block();
      }
    }

    return cell;
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Region identification and color assignment
// ---------------------------------------------------------------------------

interface Region {
  id: number;
  cells: [number, number][];
  color: ColorName;
  area: number;
}

function findRegions(grid: Grid<Cell>): Region[] {
  const visited = new Grid<boolean>(grid.rows, grid.cols, false);
  const regions: Region[] = [];
  let nextId = 0;

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (visited.get(r, c)) continue;
      const cell = grid.get(r, c);
      if (!cell || cell.kind !== 'block') continue;

      const regionCells: [number, number][] = [];
      const stack: [number, number][] = [[r, c]];
      visited.set(r, c, true);

      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        regionCells.push([cr, cc]);

        for (const [nr, nc] of grid.neighbors4(cr, cc)) {
          if (visited.get(nr, nc)) continue;
          const ncell = grid.get(nr, nc);
          if (!ncell || ncell.kind !== 'block') continue;
          visited.set(nr, nc, true);
          stack.push([nr, nc]);
        }
      }

      regions.push({ id: nextId++, cells: regionCells, color: 'white', area: regionCells.length });
    }
  }

  return regions;
}

function buildAdjacency(grid: Grid<Cell>, regions: Region[]): Map<number, Set<number>> {
  const cellToRegion = new Map<string, number>();
  for (const reg of regions) {
    for (const [r, c] of reg.cells) {
      cellToRegion.set(`${r},${c}`, reg.id);
    }
  }

  const adj = new Map<number, Set<number>>();
  for (const reg of regions) adj.set(reg.id, new Set());

  for (const reg of regions) {
    for (const [r, c] of reg.cells) {
      for (const [nr, nc] of grid.neighbors4(r, c)) {
        const nid = cellToRegion.get(`${nr},${nc}`);
        if (nid !== undefined && nid !== reg.id) {
          adj.get(reg.id)!.add(nid);
        }
      }
    }
  }

  return adj;
}

function assignColors(regions: Region[], adj: Map<number, Set<number>>, colorIntensity: number): void {
  for (const reg of regions) reg.color = 'white';

  if (regions.length === 0) return;

  if (regions.length < 3) {
    if (colorIntensity > 0.3) {
      const largest = regions.reduce((a, b) => (a.area > b.area ? a : b));
      largest.color = 'red';
    }
    return;
  }

  const blockCells = regions.reduce((s, r) => s + r.area, 0);
  const sorted = [...regions].sort((a, b) => b.area - a.area);

  // Build color candidates — all thresholds scaled by intensity
  const candidates: { reg: Region; color: ColorName }[] = [];

  for (const reg of sorted) {
    const ratio = reg.area / blockCells;
    const r = Math.random();

    if (ratio > 0.10 && r < 0.7 * colorIntensity) {
      candidates.push({ reg, color: 'red' });
    } else if (ratio > 0.05 && r < 0.45 * colorIntensity) {
      candidates.push({ reg, color: randChoice(['blue', 'yellow']) });
    } else if (ratio > 0.02 && r < 0.3 * colorIntensity) {
      candidates.push({ reg, color: randChoice(['blue', 'yellow', 'black', 'gray']) });
    } else if (r < 0.12 * colorIntensity) {
      candidates.push({ reg, color: randChoice(['black', 'gray']) });
    }
  }

  // At intensity 0, maxColored = 0; at intensity 1, maxColored = ~45% of regions
  const maxColored = Math.floor(regions.length * colorIntensity * 0.45);
  const chosen = shuffle(candidates).slice(0, maxColored);

  for (const { reg, color } of chosen) {
    if (reg.color !== 'white') continue;
    const neighborColors = new Set<ColorName>();
    for (const nid of adj.get(reg.id)!) {
      const nr = regions.find((r) => r.id === nid)!;
      neighborColors.add(nr.color);
    }

    if (neighborColors.has(color) && color !== 'white') {
      const alts = (['red', 'blue', 'yellow', 'gray', 'black'] as ColorName[]).filter(
        (c) => !neighborColors.has(c)
      );
      reg.color = alts.length > 0 ? alts[0] : 'white';
    } else {
      reg.color = color;
    }
  }

  // Ensure primary colors — only when intensity is high enough
  if (colorIntensity > 0.3) {
    const ensureColor = (target: ColorName, pred: (r: Region) => boolean) => {
      if (regions.some((r) => r.color === target)) return;
      const eligible = regions.filter((r) => r.color === 'white' && pred(r));
      if (eligible.length > 0) {
        eligible[randInt(eligible.length)].color = target;
      }
    };

    ensureColor('red', (r) => r.area > blockCells * 0.03);
    ensureColor('blue', (r) => r.area > 1 && r.area < blockCells * 0.1);
    ensureColor('yellow', (r) => r.area > 1 && r.area < blockCells * 0.08);
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Refinement
// ---------------------------------------------------------------------------

function refinementUpdater(): CellUpdater<Cell> {
  return (grid, row, col) => {
    const cell = grid.get(row, col);
    const kind = cell.kind;

    if (kind === 'hLine') {
      // Check if this horizontal line intersects any vertical line
      const hasVNearby = (rr: number) => {
        for (let c = 0; c < grid.cols; c++) {
          if (isVLike(grid.get(rr, c).kind)) return true;
        }
        return false;
      };
      const crossesV =
        hasVNearby(row) ||
        (row > 0 && hasVNearby(row - 1)) ||
        (row < grid.rows - 1 && hasVNearby(row + 1));
      if (!crossesV && Math.random() < 0.6) return block();
      return cell;
    }

    if (kind === 'vLine') {
      const hasHNearby = (cc: number) => {
        for (let r = 0; r < grid.rows; r++) {
          if (isHLike(grid.get(r, cc).kind)) return true;
        }
        return false;
      };
      const crossesH =
        hasHNearby(col) ||
        (col > 0 && hasHNearby(col - 1)) ||
        (col < grid.cols - 1 && hasHNearby(col + 1));
      if (!crossesH && Math.random() < 0.6) return block();
      return cell;
    }

    if (kind === 'both') {
      // Intersection cells are important — keep them unless isolated
      const hNeighbors =
        (row > 0 && isHLike(grid.get(row - 1, col).kind) ? 1 : 0) +
        (row < grid.rows - 1 && isHLike(grid.get(row + 1, col).kind) ? 1 : 0);
      const vNeighbors =
        (col > 0 && isVLike(grid.get(row, col - 1).kind) ? 1 : 0) +
        (col < grid.cols - 1 && isVLike(grid.get(row, col + 1).kind) ? 1 : 0);
      if (hNeighbors + vNeighbors < 2 && Math.random() < 0.5) {
        return hNeighbors >= vNeighbors ? { kind: 'hLine' } : { kind: 'vLine' };
      }
      return cell;
    }

    return cell;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createInitialState(size: number): MondrianState {
  const grid = new Grid<Cell>(size, size, block('white'));

  // Pick random rows for horizontal line segments
  const numHLines = 3 + randInt(Math.floor(size * 0.15));
  const hRows = shuffle(Array.from({ length: size }, (_, i) => i)).slice(0, numHLines);

  for (const row of hRows) {
    // Lines often extend to or near edges
    const extendToEdge = Math.random() < 0.5;
    let start: number;
    let end: number;
    if (extendToEdge && Math.random() < 0.5) {
      start = 0;
      end = Math.floor(size * 0.4) + randInt(Math.floor(size * 0.5));
    } else if (extendToEdge) {
      start = Math.floor(size * 0.2) + randInt(Math.floor(size * 0.3));
      end = size;
    } else {
      const segLen = Math.floor(size * 0.25) + randInt(Math.floor(size * 0.55));
      start = randInt(Math.max(1, size - segLen));
      end = Math.min(start + segLen, size);
    }
    for (let c = start; c < end; c++) {
      grid.set(row, c, { kind: 'hLine' });
    }
  }

  // Pick random columns for vertical line segments
  const numVLines = 3 + randInt(Math.floor(size * 0.15));
  const vCols = shuffle(Array.from({ length: size }, (_, i) => i)).slice(0, numVLines);

  for (const col of vCols) {
    const extendToEdge = Math.random() < 0.5;
    let start: number;
    let end: number;
    if (extendToEdge && Math.random() < 0.5) {
      start = 0;
      end = Math.floor(size * 0.4) + randInt(Math.floor(size * 0.5));
    } else if (extendToEdge) {
      start = Math.floor(size * 0.2) + randInt(Math.floor(size * 0.3));
      end = size;
    } else {
      const segLen = Math.floor(size * 0.25) + randInt(Math.floor(size * 0.55));
      start = randInt(Math.max(1, size - segLen));
      end = Math.min(start + segLen, size);
    }
    for (let r = start; r < end; r++) {
      const existing = grid.get(r, col);
      if (existing.kind === 'hLine') {
        grid.set(r, col, { kind: 'both' });
      } else {
        grid.set(r, col, { kind: 'vLine' });
      }
    }
  }

  return { grid, size };
}

export function evolveState(state: MondrianState, colorIntensity: number): MondrianState {
  // Phase 1: Line network formation
  let grid = runCA(state.grid, lineFormationUpdater(), 15);

  // Detect intersections
  grid = runCA(grid, intersectionUpdater(), 2);

  // Thickness control
  grid = runCA(grid, thicknessUpdater(), 3);

  // Phase 2: Color assignment
  const regions = findRegions(grid);
  const adj = buildAdjacency(grid, regions);
  assignColors(regions, adj, colorIntensity);

  for (const reg of regions) {
    for (const [r, c] of reg.cells) {
      grid.set(r, c, { kind: 'block', color: reg.color });
    }
  }

  // Phase 3: Refinement
  grid = runCA(grid, refinementUpdater(), 3);

  // Re-color after refinement
  const finalRegions = findRegions(grid);
  const finalAdj = buildAdjacency(grid, finalRegions);
  assignColors(finalRegions, finalAdj, colorIntensity);

  for (const reg of finalRegions) {
    for (const [r, c] of reg.cells) {
      grid.set(r, c, { kind: 'block', color: reg.color });
    }
  }

  return { grid, size: state.size };
}
