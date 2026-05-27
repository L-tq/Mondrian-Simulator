export class Grid<T> {
  readonly rows: number;
  readonly cols: number;
  private data: T[][];

  constructor(rows: number, cols: number, fill: T) {
    this.rows = rows;
    this.cols = cols;
    this.data = [];
    for (let r = 0; r < rows; r++) {
      const row: T[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(fill);
      }
      this.data.push(row);
    }
  }

  get(row: number, col: number): T {
    if (!this.data[row]) {
      throw new Error(`Grid.get: row ${row} out of bounds (data has ${this.data.length} rows, grid claims ${this.rows} rows)`);
    }
    return this.data[row][col];
  }

  set(row: number, col: number, value: T): void {
    this.data[row][col] = value;
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  neighbors4(row: number, col: number): [number, number][] {
    const result: [number, number][] = [];
    if (row > 0) result.push([row - 1, col]);
    if (row < this.rows - 1) result.push([row + 1, col]);
    if (col > 0) result.push([row, col - 1]);
    if (col < this.cols - 1) result.push([row, col + 1]);
    return result;
  }

  neighbors8(row: number, col: number): [number, number][] {
    const result: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (this.inBounds(nr, nc)) {
          result.push([nr, nc]);
        }
      }
    }
    return result;
  }
}
