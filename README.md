# Mondrian Simulator

A browser-based tool that generates Piet Mondrian-style compositions using recursive subdivision, strategic color assignment, and visual weight balancing.

## How it works

1. **Recursive subdivision** — A grid starts as a single rectangle. Larger rectangles are iteratively split by horizontal or vertical lines, biased toward aesthetically pleasing proportions (golden ratio, 2:3, 3:5, etc.).

2. **T-junctions** — Line segments extend into adjacent rectangles to create T-shaped line terminations, a hallmark of Mondrian's style.

3. **Strategic coloring** — Red goes to the largest non-edge rectangles, blue and yellow to medium edge-adjacent ones, black to a single small accent. White fills the rest.

4. **Visual weight balancing** — Colors are swapped to pull the visual center of mass toward the geometric center, preventing lopsided compositions.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

## Controls

| Action | Shortcut |
|--------|----------|
| New composition | Space or **Generate** button |
| Play/pause build animation | **Play/Pause** button |
| Toggle settings menu | **Settings** button |

### Settings

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Grid | 12–200 | 50 | Grid resolution |
| Speed | 1–10× | 4× | Animation playback speed |
| Rects | 5–40 | 15 | Target number of rectangles |
| Min Rect | 2–8 | 3 | Minimum rectangle dimension in cells |
| Line Gap | 1–6 | 2 | Minimum gap between parallel lines |
| Thick Line | 0–1 | 0 | Probability of drawing thicker black lines |
| T-Junction | 0–1 | 0.45 | How aggressively lines form T-junctions |
| Proportion | 0–1 | 0.65 | Bias toward golden-ratio proportions (0 = random, 1 = strict) |

### Editing

Click on a colored rectangle to select it. The edit toolbar appears at the top.

| Action | Shortcut / Input |
|--------|------------------|
| Change color | **R** / **B** / **Y** / **W** / **K** or click swatch |
| Split horizontally | **H** or Split H button |
| Split vertically | **V** or Split V button |
| Merge two regions | Shift+click second region, then **M** or Merge button |
| Delete (→ white) | **Delete** / **Backspace** or Delete button |
| Deselect | **Escape** or click a line |

## Debug mode

Append `?debug=1` to the URL and open the browser console to see the grid printed as ASCII art:

```
. . . . | . . . . | . . . .
- - - - + - - - - + - - - -
. . . . | R R R . | . . . .
```

Legend: `.` white, `R` red, `B` blue, `Y` yellow, `K` black, `-` thin hLine, `=` thick hLine, `|` thin vLine, `+` thin intersection, `#` thick intersection.

## Build & Deploy

```bash
npm run build    # TypeScript check + Vite build → docs/
```

The build outputs to `docs/`. Commit the `docs/` folder along with `_config.yml` and push to GitHub.

### GitHub Pages

In the repo settings, set **Pages → Source** to "Deploy from a branch", select your branch, and set the folder to `/docs`. GitHub Pages runs Jekyll on `docs/` — the included `_config.yml` keeps Jekyll from processing source files and serves the pre-built static output as-is.
