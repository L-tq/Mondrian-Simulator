import { COLORS, MondrianState } from './mondrian';

export function renderMondrian(
  ctx: CanvasRenderingContext2D,
  state: MondrianState,
  width: number,
  height: number
): void {
  const { grid, size } = state;
  const margin = Math.min(width, height) * 0.04;
  const cellW = (width - 2 * margin) / size;
  const cellH = (height - 2 * margin) / size;

  // Background
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, width, height);

  // Draw blocks as full cell rectangles
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid.get(r, c);
      if (cell.kind !== 'block') continue;
      const x = margin + c * cellW;
      const y = margin + r * cellH;
      ctx.fillStyle = COLORS[cell.color];
      ctx.fillRect(x, y, cellW, cellH);
    }
  }

  // Determine line thickness in pixels
  const thinPx = Math.max(2, Math.min(cellW, cellH) * 0.18);
  const thickPx = thinPx * 2.8;

  ctx.fillStyle = COLORS.black;

  // Draw horizontal lines at the TOP boundary of each hLine cell
  // This positions the line between the previous row and this row
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid.get(r, c);
      const kind = cell.kind;
      if (kind !== 'hLine' && kind !== 'both') continue;

      const x = margin + c * cellW;
      const y = margin + r * cellH;

      // Check if adjacent rows also have hLine (thick line)
      const above = r > 0 && (grid.get(r - 1, c).kind === 'hLine' || grid.get(r - 1, c).kind === 'both');
      const below = r < size - 1 && (grid.get(r + 1, c).kind === 'hLine' || grid.get(r + 1, c).kind === 'both');
      const thick = above || below;
      const barH = thick ? thickPx : thinPx;

      // Position bar so it straddles the top edge of this cell
      const barY = y - barH / 2;
      ctx.fillRect(x, barY, cellW, barH);
    }
  }

  // Draw vertical lines at the LEFT boundary of each vLine cell
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid.get(r, c);
      const kind = cell.kind;
      if (kind !== 'vLine' && kind !== 'both') continue;

      const x = margin + c * cellW;
      const y = margin + r * cellH;

      const left = c > 0 && (grid.get(r, c - 1).kind === 'vLine' || grid.get(r, c - 1).kind === 'both');
      const right = c < size - 1 && (grid.get(r, c + 1).kind === 'vLine' || grid.get(r, c + 1).kind === 'both');
      const thick = left || right;
      const barW = thick ? thickPx : thinPx;

      const barX = x - barW / 2;
      ctx.fillRect(barX, y, barW, cellH);
    }
  }
}
