import { Graphics } from 'pixi.js';
import { COLORS, MondrianState, ColorName } from './mondrian';

function isHLike(kind: string): boolean {
  return kind === 'hLine' || kind === 'both';
}

function isVLike(kind: string): boolean {
  return kind === 'vLine' || kind === 'both';
}

export function drawMondrian(
  graphics: Graphics,
  state: MondrianState,
  width: number,
  height: number
): void {
  graphics.clear();

  const { grid, size } = state;
  const margin = Math.round(Math.min(width, height) * 0.04);
  const cellW = (width - 2 * margin) / size;
  const cellH = (height - 2 * margin) / size;

  const px = (col: number): number => Math.round(margin + col * cellW);
  const py = (row: number): number => Math.round(margin + row * cellH);

  // Background
  graphics.rect(0, 0, width, height).fill({ color: COLORS.white });

  // Line thickness in integer pixels
  const thinPx = Math.max(2, Math.round(Math.min(cellW, cellH) * 0.18));
  const thickPx = Math.max(thinPx + 2, Math.round(thinPx * 2.8));

  // ---- Phase 1: Collect hLine rows and vLine columns with thickness ----
  const hLineRows = new Map<number, boolean>(); // row -> thick
  const vLineCols = new Map<number, boolean>(); // col -> thick

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid.get(r, c);
      if (cell.kind === 'hLine') {
        if (!hLineRows.has(r)) hLineRows.set(r, cell.thick);
      } else if (cell.kind === 'both') {
        if (!hLineRows.has(r)) hLineRows.set(r, cell.thickH);
        if (!vLineCols.has(c)) vLineCols.set(c, cell.thickV);
      } else if (cell.kind === 'vLine') {
        if (!vLineCols.has(c)) vLineCols.set(c, cell.thick);
      }
    }
  }

  // ---- Phase 2: Draw each region as a single filled rectangle ----
  const visited = new Array(size);
  for (let r = 0; r < size; r++) visited[r] = new Array(size).fill(false);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (visited[r][c]) continue;
      const cell = grid.get(r, c);
      if (cell.kind !== 'block') continue;

      const color: ColorName = cell.color;

      let minR = r, maxR = r, minC = c, maxC = c;
      const stack: [number, number][] = [[r, c]];
      visited[r][c] = true;

      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;

        if (cr > 0 && !visited[cr - 1][cc]) {
          const nc = grid.get(cr - 1, cc);
          if (nc.kind === 'block' && nc.color === color) {
            visited[cr - 1][cc] = true;
            stack.push([cr - 1, cc]);
          }
        }
        if (cr < size - 1 && !visited[cr + 1][cc]) {
          const nc = grid.get(cr + 1, cc);
          if (nc.kind === 'block' && nc.color === color) {
            visited[cr + 1][cc] = true;
            stack.push([cr + 1, cc]);
          }
        }
        if (cc > 0 && !visited[cr][cc - 1]) {
          const nc = grid.get(cr, cc - 1);
          if (nc.kind === 'block' && nc.color === color) {
            visited[cr][cc - 1] = true;
            stack.push([cr, cc - 1]);
          }
        }
        if (cc < size - 1 && !visited[cr][cc + 1]) {
          const nc = grid.get(cr, cc + 1);
          if (nc.kind === 'block' && nc.color === color) {
            visited[cr][cc + 1] = true;
            stack.push([cr, cc + 1]);
          }
        }
      }

      // Find enclosing line positions
      let topLine = -1;
      for (let rr = minR - 1; rr >= -1; rr--) {
        if (rr < 0) { topLine = -1; break; }
        if (isHLike(grid.get(rr, minC).kind)) { topLine = rr; break; }
      }

      let bottomLine = size;
      for (let rr = maxR + 1; rr <= size; rr++) {
        if (rr >= size) { bottomLine = size; break; }
        if (isHLike(grid.get(rr, minC).kind)) { bottomLine = rr; break; }
      }

      let leftLine = -1;
      for (let cc = minC - 1; cc >= -1; cc--) {
        if (cc < 0) { leftLine = -1; break; }
        if (isVLike(grid.get(minR, cc).kind)) { leftLine = cc; break; }
      }

      let rightLine = size;
      for (let cc = maxC + 1; cc <= size; cc++) {
        if (cc >= size) { rightLine = size; break; }
        if (isVLike(grid.get(minR, cc).kind)) { rightLine = cc; break; }
      }

      const fillLeft = leftLine;
      const fillTop = topLine;
      const fillRight = rightLine === size - 1 ? size : rightLine;
      const fillBottom = bottomLine === size - 1 ? size : bottomLine;

      const x = px(fillLeft);
      const y = py(fillTop);
      const w = px(fillRight) - px(fillLeft);
      const h = py(fillBottom) - py(fillTop);

      graphics.rect(x, y, w, h).fill({ color: COLORS[color] });
    }
  }

  // ---- Phase 3: Draw lines on top as continuous bars ----
  const gridW = px(size) - px(0);
  const gridH = py(size) - py(0);

  // Horizontal bars
  for (const [row, thick] of hLineRows) {
    const barH = thick ? thickPx : thinPx;
    const y = py(row);
    graphics.rect(px(0), Math.round(y - barH / 2), gridW, barH).fill({ color: COLORS.black });
  }

  // Bottom edge closing line
  {
    const y = py(size);
    const bottomRow = size - 1;
    const thick = hLineRows.get(bottomRow) ?? false;
    const barH = thick ? thickPx : thinPx;
    graphics.rect(px(0), Math.round(y - barH / 2), gridW, barH).fill({ color: COLORS.black });
  }

  // Vertical bars
  for (const [col, thick] of vLineCols) {
    const barW = thick ? thickPx : thinPx;
    const x = px(col);
    graphics.rect(Math.round(x - barW / 2), py(0), barW, gridH).fill({ color: COLORS.black });
  }

  // Right edge closing line
  {
    const x = px(size);
    const rightCol = size - 1;
    const thick = vLineCols.get(rightCol) ?? false;
    const barW = thick ? thickPx : thinPx;
    graphics.rect(Math.round(x - barW / 2), py(0), barW, gridH).fill({ color: COLORS.black });
  }

  // ---- Phase 4: Intersection patches ----
  // Fill the center of every hLine×vLine crossing so the bars form a solid "+".
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid.get(r, c);
      if (cell.kind !== 'both') continue;

      const barH = cell.thickH ? thickPx : thinPx;
      const barW = cell.thickV ? thickPx : thinPx;
      const x = px(c);
      const y = py(r);

      graphics
        .rect(Math.round(x - barW / 2), Math.round(y - barH / 2), barW, barH)
        .fill({ color: COLORS.black });
    }
  }

  // ---- Phase 5: Outer frame corner patches ----
  // The continuous bars from Phase 3 leave a barW/2 × barH/2 notch at
  // the three outer frame corners where edge-closing lines meet but no
  // "both" cell exists (top-left is already covered by cell 0,0 above).

  const topThick = hLineRows.get(0) ?? false;
  const bottomThick = hLineRows.get(size - 1) ?? false;
  const leftThick = vLineCols.get(0) ?? false;
  const rightThick = vLineCols.get(size - 1) ?? false;

  // Top-right: top hLine meets right edge vLine
  {
    const barH = topThick ? thickPx : thinPx;
    const barW = rightThick ? thickPx : thinPx;
    graphics
      .rect(Math.round(px(size) - barW / 2), Math.round(py(0) - barH / 2), barW, barH)
      .fill({ color: COLORS.black });
  }

  // Bottom-left: bottom edge hLine meets left vLine
  {
    const barH = bottomThick ? thickPx : thinPx;
    const barW = leftThick ? thickPx : thinPx;
    graphics
      .rect(Math.round(px(0) - barW / 2), Math.round(py(size) - barH / 2), barW, barH)
      .fill({ color: COLORS.black });
  }

  // Bottom-right: bottom edge hLine meets right edge vLine
  {
    const barH = bottomThick ? thickPx : thinPx;
    const barW = rightThick ? thickPx : thinPx;
    graphics
      .rect(Math.round(px(size) - barW / 2), Math.round(py(size) - barH / 2), barW, barH)
      .fill({ color: COLORS.black });
  }
}
