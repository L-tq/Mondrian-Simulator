# Mondrian Simulator

A static site that generates Piet Mondrian-style compositions using a cellular automata engine. The CA evolves a grid of lines and color blocks to produce visually balanced abstract geometric art.

## How it works

The pipeline runs in three phases:

1. **Line network formation** — Contiguous line segments are seeded randomly, then a CA iterates to fill gaps, kill isolated segments, and form a connected rectilinear grid with thin and thick lines.

2. **Region coloring** — Rectangular regions bounded by lines are flood-filled and assigned colors (red, blue, yellow, black, gray, white) with adjacency constraints and area-proportional distribution. White space dominates (~60%+).

3. **Refinement** — Orphan lines that don't intersect perpendicular lines are removed.

Each run produces a unique composition. The underlying grid size and color intensity are adjustable.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

## Controls

- **Space** or **Generate** — new random composition
- **Grid** slider — grid density (12–24)
- **Color** slider — color saturation (0–100%)

## Build

```bash
npm run build    # outputs to dist/
```
