import { Grid, runCA, CellUpdater } from './automata';

export type ColorName = 'white' | 'red' | 'blue' | 'yellow' | 'black' | 'gray';

export type Cell =
  | { kind: 'block'; color: ColorName }
  | { kind: 'hLine'; thick: boolean }
  | { kind: 'vLine'; thick: boolean }
  | { kind: 'both'; thickH: boolean; thickV: boolean };

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

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function block(color: ColorName = 'white'): Cell {
  return { kind: 'block', color };
}

function hLine(thick = false): Cell {
  return { kind: 'hLine', thick };
}

function vLine(thick = false): Cell {
  return { kind: 'vLine', thick };
}

function both(thickH = false, thickV = false): Cell {
  return { kind: 'both', thickH, thickV };
}

function getThickH(cell: Cell): boolean {
  if (cell.kind === 'hLine') return cell.thick;
  if (cell.kind === 'both') return cell.thickH;
  return false;
}

function getThickV(cell: Cell): boolean {
  if (cell.kind === 'vLine') return cell.thick;
  if (cell.kind === 'both') return cell.thickV;
  return false;
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

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

function isHLike(kind: string): boolean {
  return kind === 'hLine' || kind === 'both';
}

function isVLike(kind: string): boolean {
  return kind === 'vLine' || kind === 'both';
}

function selectSpaced(arr: number[], count: number, minGap: number): number[] {
  const shuffled = shuffle([...arr]);
  const selected: number[] = [];
  for (const val of shuffled) {
    let ok = true;
    for (const s of selected) {
      if (Math.abs(s - val) < minGap) {
        ok = false;
        break;
      }
    }
    if (ok) {
      selected.push(val);
      if (selected.length >= count) break;
    }
  }
  // Fallback: relax gap if we couldn't find enough
  if (selected.length < count) {
    for (const val of shuffled) {
      if (!selected.includes(val)) {
        selected.push(val);
        if (selected.length >= count) break;
      }
    }
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Phase 0 — Initial state with full grid lines
// ---------------------------------------------------------------------------

export function createInitialState(size: number): MondrianState {
  const grid = new Grid<Cell>(size, size, block('white'));

  const numHLines = 3 + randInt(Math.floor(size * 0.22));
  const numVLines = 3 + randInt(Math.floor(size * 0.22));

  const allIndices = Array.from({ length: size }, (_, i) => i);
  const hRows = selectSpaced(allIndices, numHLines, 1);
  const vCols = selectSpaced(allIndices, numVLines, 1);

  // Mark 1-2 lines in each direction as thick
  const numThickH = Math.min(1 + randInt(2), hRows.length);
  const numThickV = Math.min(1 + randInt(2), vCols.length);
  const thickHSet = new Set(shuffle(hRows).slice(0, numThickH));
  const thickVSet = new Set(shuffle(vCols).slice(0, numThickV));

  // Place full-width horizontal lines
  for (const row of hRows) {
    const thick = thickHSet.has(row);
    for (let c = 0; c < size; c++) {
      grid.set(row, c, hLine(thick));
    }
  }

  // Place full-height vertical lines, marking intersections
  for (const col of vCols) {
    const thick = thickVSet.has(col);
    for (let r = 0; r < size; r++) {
      const existing = grid.get(r, col);
      if (existing.kind === 'hLine') {
        grid.set(r, col, both(existing.thick, thick));
      } else {
        grid.set(r, col, vLine(thick));
      }
    }
  }

  return { grid, size };
}

// ---------------------------------------------------------------------------
// Phase 0b — Segment pruning for variety
// ---------------------------------------------------------------------------

function pruneSegments(grid: Grid<Cell>): void {
  // Collect line positions
  const hRows = new Set<number>();
  const vCols = new Set<number>();
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const kind = grid.get(r, c).kind;
      if (isHLike(kind)) hRows.add(r);
      if (isVLike(kind)) vCols.add(c);
    }
  }

  const sortedVCols = [...vCols].sort((a, b) => a - b);
  const sortedHRows = [...hRows].sort((a, b) => a - b);

  // Prune horizontal line segments between vertical lines
  for (const row of hRows) {
    const breakpoints = [0, ...sortedVCols, grid.cols - 1];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const start = i === 0 ? 0 : breakpoints[i] + 1;
      const end = i === breakpoints.length - 2 ? breakpoints[i + 1] : breakpoints[i + 1] - 1;
      if (start > end) continue;

      const isEdge = i === 0 || i === breakpoints.length - 2;
      const prob = isEdge ? 0.12 : 0.22;

      if (Math.random() < prob) {
        for (let c = start; c <= end; c++) {
          const cell = grid.get(row, c);
          if (cell.kind === 'both') {
            grid.set(row, c, vLine(cell.thickV));
          } else if (cell.kind === 'hLine') {
            grid.set(row, c, block());
          }
        }
      }
    }
  }

  // Prune vertical line segments between horizontal lines
  for (const col of vCols) {
    const breakpoints = [0, ...sortedHRows, grid.rows - 1];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const start = i === 0 ? 0 : breakpoints[i] + 1;
      const end = i === breakpoints.length - 2 ? breakpoints[i + 1] : breakpoints[i + 1] - 1;
      if (start > end) continue;

      const isEdge = i === 0 || i === breakpoints.length - 2;
      const prob = isEdge ? 0.08 : 0.18;

      if (Math.random() < prob) {
        for (let r = start; r <= end; r++) {
          const cell = grid.get(r, col);
          if (cell.kind === 'both') {
            grid.set(r, col, hLine(cell.thickH));
          } else if (cell.kind === 'vLine') {
            grid.set(r, col, block());
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — Refinement / cleanup
// ---------------------------------------------------------------------------

function refinementUpdater(): CellUpdater<Cell> {
  return (grid, row, col) => {
    const cell = grid.get(row, col);
    const kind = cell.kind;

    if (kind === 'hLine') {
      // Remove hLine cells that have no crossing vLine anywhere on this or adjacent rows
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
      // Check line continuation: hLine continues left/right, vLine continues up/down
      const hLeft = col > 0 && isHLike(grid.get(row, col - 1).kind);
      const hRight = col < grid.cols - 1 && isHLike(grid.get(row, col + 1).kind);
      const vUp = row > 0 && isVLike(grid.get(row - 1, col).kind);
      const vDown = row < grid.rows - 1 && isVLike(grid.get(row + 1, col).kind);

      const hCont = (hLeft ? 1 : 0) + (hRight ? 1 : 0);
      const vCont = (vUp ? 1 : 0) + (vDown ? 1 : 0);

      if (hCont + vCont < 2 && Math.random() < 0.5) {
        if (hCont >= vCont) {
          return hLine(cell.thickH);
        } else {
          return vLine(cell.thickV);
        }
      }
      return cell;
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
  if (colorIntensity === 0) return;

  const blockCells = regions.reduce((s, r) => s + r.area, 0);
  const sorted = [...regions].sort((a, b) => b.area - a.area);

  const candidates: { reg: Region; color: ColorName }[] = [];

  for (const reg of sorted) {
    const ratio = reg.area / blockCells;

    if (ratio > 0.10 && Math.random() < 0.7 * colorIntensity) {
      candidates.push({ reg, color: 'red' });
    } else if (ratio > 0.05 && Math.random() < 0.45 * colorIntensity) {
      candidates.push({ reg, color: randChoice(['blue', 'yellow']) });
    } else if (ratio > 0.02 && Math.random() < 0.3 * colorIntensity) {
      candidates.push({ reg, color: randChoice(['blue', 'yellow', 'black', 'gray']) });
    } else if (Math.random() < 0.12 * colorIntensity) {
      candidates.push({ reg, color: randChoice(['black', 'gray']) });
    }
  }

  const maxColored = Math.max(1, Math.round(regions.length * colorIntensity * 0.5));
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

  // Guarantee a minimum number of primaries, scaling with intensity
  const numPrimaries = Math.round(colorIntensity * 3);
  const primaries: { color: ColorName; pred: (r: Region) => boolean }[] = [
    { color: 'red', pred: (r) => r.area > blockCells * 0.03 },
    { color: 'blue', pred: (r) => r.area > 1 && r.area < blockCells * 0.1 },
    { color: 'yellow', pred: (r) => r.area > 1 && r.area < blockCells * 0.08 },
  ];

  for (let i = 0; i < numPrimaries && i < primaries.length; i++) {
    const { color, pred } = primaries[i];
    if (regions.some((r) => r.color === color)) continue;
    const eligible = regions.filter((r) => r.color === 'white' && pred(r));
    if (eligible.length > 0) {
      eligible[randInt(eligible.length)].color = color;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evolveState(state: MondrianState, colorIntensity: number): MondrianState {
  let grid = state.grid;

  // Phase 0: Prune segments to create varied region sizes
  pruneSegments(grid);

  // Phase 1: Refinement — cleanup orphan lines and fix intersections
  grid = runCA(grid, refinementUpdater(), 2);

  // Phase 2: Color assignment
  const regions = findRegions(grid);
  const adj = buildAdjacency(grid, regions);
  assignColors(regions, adj, colorIntensity);

  for (const reg of regions) {
    for (const [r, c] of reg.cells) {
      grid.set(r, c, { kind: 'block', color: reg.color });
    }
  }

  // Phase 3: Refinement after coloring
  grid = runCA(grid, refinementUpdater(), 2);

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
