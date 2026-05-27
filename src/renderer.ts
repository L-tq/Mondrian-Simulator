import { Graphics } from 'pixi.js';
import type { LifeColor } from './mondrian';
import type { Grid } from './automata';

export const COLORS: Record<string, string> = {
  empty: '#F8F6F0',
  white: '#F8F6F0',
  red: '#C82020',
  blue: '#1E5090',
  yellow: '#E8C800',
  black: '#141414',
  line: '#141414',
};

export function drawGrid(
  graphics: Graphics,
  grid: Grid<LifeColor>,
  width: number,
  height: number
): void {
  graphics.clear();

  const size = grid.rows;
  const margin = Math.round(Math.min(width, height) * 0.04);
  const cellW = (width - 2 * margin) / size;
  const cellH = (height - 2 * margin) / size;

  // Visual black frame around the grid
  const frameThick = Math.max(2, Math.round(Math.min(cellW, cellH) * 1.2));
  const fx0 = margin - frameThick;
  const fy0 = margin - frameThick;
  const gridW = width - 2 * margin;
  const gridH = height - 2 * margin;

  graphics
    .rect(fx0, fy0, gridW + 2 * frameThick, frameThick)
    .fill({ color: COLORS.black });
  graphics
    .rect(fx0, fy0 + gridH + frameThick, gridW + 2 * frameThick, frameThick)
    .fill({ color: COLORS.black });
  graphics
    .rect(fx0, fy0, frameThick, gridH + 2 * frameThick)
    .fill({ color: COLORS.black });
  graphics
    .rect(fx0 + gridW + frameThick, fy0, frameThick, gridH + 2 * frameThick)
    .fill({ color: COLORS.black });

  // White background inside the frame
  graphics.rect(margin, margin, gridW, gridH).fill({ color: COLORS.white });

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const color = grid.get(r, c);
      if (color === 'empty') continue;

      const x0 = Math.round(margin + c * cellW);
      const y0 = Math.round(margin + r * cellH);
      const x1 = Math.round(margin + (c + 1) * cellW);
      const y1 = Math.round(margin + (r + 1) * cellH);

      graphics.rect(x0, y0, x1 - x0, y1 - y0).fill({ color: COLORS[color] });
    }
  }
}
