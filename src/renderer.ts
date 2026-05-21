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

  // Line thickness in pixels
  const thinPx = Math.max(2, Math.min(cellW, cellH) * 0.18);
  const thickPx = thinPx * 2.8;

  ctx.fillStyle = COLORS.black;

  // Draw horizontal lines at the TOP boundary of each hLine cell
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid.get(r, c);
      const kind = cell.kind;
      if (kind !== 'hLine' && kind !== 'both') continue;

      const x = margin + c * cellW;
      const y = margin + r * cellH;
      const thick = kind === 'both' ? cell.thickH : cell.thick;
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
      const thick = kind === 'both' ? cell.thickV : cell.thick;
      const barW = thick ? thickPx : thinPx;

      // Position bar so it straddles the left edge of this cell
      const barX = x - barW / 2;
      ctx.fillRect(barX, y, barW, cellH);
    }
  }
}
