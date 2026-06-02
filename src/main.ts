import { Application, Graphics } from 'pixi.js';
import type { Grid } from './automata';
import type { LifeColor, MondrianParams, MondrianState } from './mondrian';
import { generateMondrianGrid, initMondrianState, stepMondrian, dumpGrid, extractRegions, findRegionAt, applyRegionColor, splitRegion, mergeRegions, mergeFailureReason, extractLineSegments, findLineSegmentsAt, toggleLineEdgeTouch, getLineBounds, setLineThickness } from './mondrian';
import type { ColoredRect, LineBounds } from './mondrian';
import { drawGrid, drawHighlight, drawLineHighlight, COLORS } from './renderer';

const DEBUG = typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search);
if (DEBUG) console.log('[main] debug mode enabled');

const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const dropdown = document.getElementById('settings-dropdown') as HTMLDivElement;
const sliderGrid = document.getElementById('grid-size') as HTMLInputElement;
const sliderSpeed = document.getElementById('playback-speed') as HTMLInputElement;
const sliderRectCount = document.getElementById('rect-count') as HTMLInputElement;
const gridLabel = document.getElementById('grid-size-label') as HTMLSpanElement;
const speedLabel = document.getElementById('playback-speed-label') as HTMLSpanElement;
const rectCountLabel = document.getElementById('rect-count-label') as HTMLSpanElement;
const stepIndicator = document.getElementById('step-indicator') as HTMLDivElement;
const sliderMinRectSize = document.getElementById('min-rect-size') as HTMLInputElement;
const sliderLineGap = document.getElementById('line-gap') as HTMLInputElement;
const sliderLineThickChance = document.getElementById('line-thick-chance') as HTMLInputElement;
const sliderTJunctionRate = document.getElementById('tj-junction-rate') as HTMLInputElement;
const sliderProportionalBias = document.getElementById('proportional-bias') as HTMLInputElement;
const minRectSizeLabel = document.getElementById('min-rect-size-label') as HTMLSpanElement;
const lineGapLabel = document.getElementById('line-gap-label') as HTMLSpanElement;
const lineThickChanceLabel = document.getElementById('line-thick-chance-label') as HTMLSpanElement;
const tjJunctionRateLabel = document.getElementById('tj-junction-rate-label') as HTMLSpanElement;
const proportionalBiasLabel = document.getElementById('proportional-bias-label') as HTMLSpanElement;
const toggleBlackFrame = document.getElementById('black-frame') as HTMLInputElement;
const toggleLineEdgeGap = document.getElementById('line-edge-gap') as HTMLInputElement;
const sliderLineWidth = document.getElementById('line-width') as HTMLInputElement;
const sliderThickWidth = document.getElementById('thick-width') as HTMLInputElement;
const lineWidthLabel = document.getElementById('line-width-label') as HTMLSpanElement;
const thickWidthLabel = document.getElementById('thick-width-label') as HTMLSpanElement;
const btnToggleThickness = document.getElementById('btn-toggle-thickness') as HTMLButtonElement;

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'mondrian-settings-v3';
const COOKIE_DAYS = 365;

interface Settings {
  gridSize: number;
  speed: number;
  rectCount: number;
  minRectSize: number;
  lineGap: number;
  lineThickChance: number;
  tJunctionRate: number;
  proportionalBias: number;
  blackFrame: boolean;
  lineEdgeGap: boolean;
  lineWidth: number;
  thickWidth: number;
}

function saveSettings(): void {
  const s: Settings = {
    gridSize: parseInt(sliderGrid.value, 10),
    speed: parseInt(sliderSpeed.value, 10),
    rectCount: parseInt(sliderRectCount.value, 10),
    minRectSize: parseInt(sliderMinRectSize.value, 10),
    lineGap: parseInt(sliderLineGap.value, 10),
    lineThickChance: parseFloat(sliderLineThickChance.value),
    tJunctionRate: parseFloat(sliderTJunctionRate.value),
    proportionalBias: parseFloat(sliderProportionalBias.value),
    blackFrame: toggleBlackFrame.checked,
    lineEdgeGap: toggleLineEdgeGap.checked,
    lineWidth: parseInt(sliderLineWidth.value, 10),
    thickWidth: parseInt(sliderThickWidth.value, 10),
  };
  const expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(s))}; expires=${expires}; path=/; SameSite=Lax`;
}

function loadSettings(): Settings | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as Settings;
  } catch {
    return null;
  }
}

function applySettings(s: Settings): void {
  sliderGrid.value = String(s.gridSize);
  sliderSpeed.value = String(s.speed);
  sliderRectCount.value = String(s.rectCount ?? 15);
  gridLabel.textContent = String(s.gridSize);
  speedLabel.textContent = s.speed + '×';
  rectCountLabel.textContent = String(s.rectCount ?? 15);
  sliderMinRectSize.value = String(s.minRectSize ?? 3);
  minRectSizeLabel.textContent = String(s.minRectSize ?? 3);
  sliderLineGap.value = String(s.lineGap ?? 2);
  lineGapLabel.textContent = String(s.lineGap ?? 2);
  sliderLineThickChance.value = String(s.lineThickChance ?? 0);
  lineThickChanceLabel.textContent = String(s.lineThickChance ?? 0);
  sliderTJunctionRate.value = String(s.tJunctionRate ?? 0.45);
  tjJunctionRateLabel.textContent = String(s.tJunctionRate ?? 0.45);
  sliderProportionalBias.value = String(s.proportionalBias ?? 0.65);
  proportionalBiasLabel.textContent = String(s.proportionalBias ?? 0.65);
  toggleBlackFrame.checked = s.blackFrame ?? false;
  toggleLineEdgeGap.checked = s.lineEdgeGap ?? true;
  sliderLineWidth.value = String(s.lineWidth ?? 1);
  lineWidthLabel.textContent = String(s.lineWidth ?? 1);
  sliderThickWidth.value = String(s.thickWidth ?? 2);
  thickWidthLabel.textContent = String(s.thickWidth ?? 2);
}

const saved = loadSettings();
if (saved) {
  applySettings(saved);
} else {
  sliderGrid.value = '50';
  sliderSpeed.value = '4';
  sliderRectCount.value = '15';
  gridLabel.textContent = '50';
  speedLabel.textContent = '4×';
  rectCountLabel.textContent = '15';
  sliderMinRectSize.value = '3';
  sliderLineGap.value = '2';
  sliderLineThickChance.value = '0';
  sliderTJunctionRate.value = '0.45';
  sliderProportionalBias.value = '0.65';
  minRectSizeLabel.textContent = '3';
  lineGapLabel.textContent = '2';
  lineThickChanceLabel.textContent = '0';
  tjJunctionRateLabel.textContent = '0.45';
  proportionalBiasLabel.textContent = '0.65';
  toggleBlackFrame.checked = false;
  toggleLineEdgeGap.checked = true;
  sliderLineWidth.value = '1';
  sliderThickWidth.value = '2';
  lineWidthLabel.textContent = '1';
  thickWidthLabel.textContent = '2';
}

let canvasSize = 0;
let currentGrid: Grid<LifeColor> | null = null;
let mondrianState: MondrianState | null = null;
let isPlaying = false;
let genCount = 0;
let currentSeed = 0;
let animTimer: number | null = null;
let regions: ColoredRect[] = [];
let selectedIdx: number = -1;
let secondSelectedIdx: number = -1;
let selectedLineBounds: LineBounds | null = null;
let highlightGraphics: Graphics | null = null;

const app = new Application();

const ICON_PLAY = `<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />`;
const ICON_PAUSE = `<rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />`;

function setPauseIcon(playing: boolean): void {
  btnPause.innerHTML = playing
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICON_PAUSE}</svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICON_PLAY}</svg>`;
}

async function init(): Promise<void> {
  await app.init({
    background: COLORS.white,
    antialias: false,
    resolution: 1,
  });

  const container = document.getElementById('pixi-container')!;
  container.appendChild(app.canvas);

  const graphics = new Graphics();
  app.stage.addChild(graphics);

  highlightGraphics = new Graphics();
  app.stage.addChild(highlightGraphics);

  // Attach click handler
  app.canvas.addEventListener('pointerdown', onCanvasClick);
  app.canvas.style.touchAction = 'none';

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const maxDim = Math.min(window.innerWidth, window.innerHeight) * 0.78;
    canvasSize = Math.floor(maxDim);
    const px = Math.floor(canvasSize * dpr);
    app.renderer.resize(px, px);
    app.canvas.style.width = `${canvasSize}px`;
    app.canvas.style.height = `${canvasSize}px`;
    app.stage.scale.set(dpr);
  }

  function readParams(): MondrianParams {
    return {
      targetRectCount: parseInt(sliderRectCount.value, 10),
      minRectSize: parseInt(sliderMinRectSize.value, 10),
      lineGap: parseInt(sliderLineGap.value, 10),
      lineThickChance: parseFloat(sliderLineThickChance.value),
      tJunctionRate: parseFloat(sliderTJunctionRate.value),
      proportionalBias: parseFloat(sliderProportionalBias.value),
      blackFrame: toggleBlackFrame.checked,
      lineEdgeGap: toggleLineEdgeGap.checked,
      regularLineThickness: parseInt(sliderLineWidth.value, 10) || 1,
      thickLineThickness: parseInt(sliderThickWidth.value, 10) || 2,
    };
  }

  let currentBlackFrame = false;

  function refreshRegions(): void {
    if (currentGrid !== null) {
      regions = extractRegions(currentGrid);
    }
  }

  function redrawAll(): void {
    if (currentGrid === null) return;
    drawGrid(graphics, currentGrid, canvasSize, canvasSize, currentBlackFrame);
    highlightGraphics?.clear();
    if (selectedIdx >= 0 && selectedIdx < regions.length) {
      drawHighlight(highlightGraphics!, regions[selectedIdx], currentGrid.rows, canvasSize, canvasSize);
    }
    if (secondSelectedIdx >= 0 && secondSelectedIdx < regions.length) {
      drawHighlight(highlightGraphics!, regions[secondSelectedIdx], currentGrid.rows, canvasSize, canvasSize);
    }
    if (selectedLineBounds !== null) {
      drawLineHighlight(highlightGraphics!, selectedLineBounds, currentGrid.rows, canvasSize, canvasSize);
    }
    updateEditToolbar();
  }

  function updateEditToolbar(): void {
    const bar = document.getElementById('edit-toolbar');
    if (!bar) return;
    const hasRegion = selectedIdx >= 0;
    const hasLine = selectedLineBounds !== null;
    if (hasRegion || hasLine) {
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
    // Show/hide region-only elements
    bar.querySelectorAll('.toolbar-region').forEach(el => {
      (el as HTMLElement).style.display = hasRegion ? '' : 'none';
    });
    // Show/hide line-only elements
    bar.querySelectorAll('.toolbar-line-only').forEach(el => {
      (el as HTMLElement).style.display = hasLine ? '' : 'none';
    });
    // Update thickness button label based on current line thickness
    if (hasLine && selectedLineBounds) {
      const regWidth = parseInt(sliderLineWidth.value, 10) || 1;
      const thickWidth = parseInt(sliderThickWidth.value, 10) || 2;
      if (selectedLineBounds.thickness === thickWidth) {
        btnToggleThickness.title = 'Switch to regular thickness (T)';
        btnToggleThickness.textContent = '⇣';
      } else {
        btnToggleThickness.title = 'Switch to thick thickness (T)';
        btnToggleThickness.textContent = '⇡';
      }
    }
  }

  function gridFromPixel(px: number, py: number): { r: number; c: number } | null {
    if (currentGrid === null) return null;
    const size = currentGrid.rows;
    const margin = Math.round(Math.min(canvasSize, canvasSize) * 0.04);
    const cellW = (canvasSize - 2 * margin) / size;
    const cellH = (canvasSize - 2 * margin) / size;
    // Account for CSS scaling
    const scaleX = canvasSize / (app.canvas.clientWidth || canvasSize);
    const scaleY = canvasSize / (app.canvas.clientHeight || canvasSize);
    const c = Math.floor((px * scaleX - margin) / cellW);
    const r = Math.floor((py * scaleY - margin) / cellH);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return { r, c };
  }

  function onCanvasClick(e: PointerEvent): void {
    const rect = app.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cell = gridFromPixel(px, py);
    if (!cell || currentGrid === null) return;

    const color = currentGrid.get(cell.r, cell.c);
    if (color === 'empty') {
      selectedIdx = -1;
      secondSelectedIdx = -1;
      selectedLineBounds = null;
      redrawAll();
      return;
    }

    if (color === 'line') {
      // Toggle line edge touch if any segment at this cell has an end near a canvas edge
      const size = currentGrid.rows;
      const gap = parseInt(sliderLineGap.value, 10);
      const segs = extractLineSegments(currentGrid);
      const matches = findLineSegmentsAt(segs, cell.r, cell.c);

      let edge: 'left' | 'right' | 'top' | 'bottom' | null = null;
      let targetSeg: typeof matches[0] | null = null;

      for (const seg of matches) {
        if (seg.horizontal) {
          const nearLeft = seg.c0 <= gap;
          const nearRight = seg.c1 >= size - 1 - gap;
          if (nearLeft && nearRight) {
            edge = (cell.c - seg.c0 < seg.c1 - cell.c) ? 'left' : 'right';
            targetSeg = seg; break;
          } else if (nearLeft) {
            edge = 'left'; targetSeg = seg; break;
          } else if (nearRight) {
            edge = 'right'; targetSeg = seg; break;
          }
        } else {
          const nearTop = seg.r0 <= gap;
          const nearBottom = seg.r1 >= size - 1 - gap;
          if (nearTop && nearBottom) {
            edge = (cell.r - seg.r0 < seg.r1 - cell.r) ? 'top' : 'bottom';
            targetSeg = seg; break;
          } else if (nearTop) {
            edge = 'top'; targetSeg = seg; break;
          } else if (nearBottom) {
            edge = 'bottom'; targetSeg = seg; break;
          }
        }
      }

      if (targetSeg && edge) {
        const changed = toggleLineEdgeTouch(currentGrid, targetSeg, edge, gap);
        if (changed) {
          refreshRegions();
          selectedIdx = -1;
          secondSelectedIdx = -1;
          selectedLineBounds = getLineBounds(currentGrid, cell.r, cell.c);
          redrawAll();
          const dir = edge === 'left' ? 'left' : edge === 'right' ? 'right' : edge === 'top' ? 'top' : 'bottom';
          showToast(`Line ${dir} edge toggled`);
          return;
        }
      }

      // Select the line (not near an edge, or edge toggle didn't apply)
      selectedIdx = -1;
      secondSelectedIdx = -1;
      selectedLineBounds = getLineBounds(currentGrid, cell.r, cell.c);
      redrawAll();
      return;
    }

    // Colored region — deselect line, select region
    selectedLineBounds = null;
    const idx = findRegionAt(regions, cell.r, cell.c);
    if (idx < 0) return;

    if (e.shiftKey) {
      // Shift+click: select second region for merge
      if (selectedIdx >= 0 && idx !== selectedIdx) {
        secondSelectedIdx = idx;
      } else {
        secondSelectedIdx = -1;
      }
    } else {
      selectedIdx = idx;
      secondSelectedIdx = -1;
    }

    redrawAll();
  }

  function changeSelectedColor(color: LifeColor): void {
    if (currentGrid === null || selectedIdx < 0 || selectedIdx >= regions.length) return;
    applyRegionColor(currentGrid, regions[selectedIdx], color);
    redrawAll();
  }

  function splitSelectedRegion(horizontal: boolean): void {
    if (currentGrid === null || selectedIdx < 0 || selectedIdx >= regions.length) return;
    const region = regions[selectedIdx];
    const minDim = horizontal ? region.h : region.w;
    if (minDim < 5) return; // need at least 5 cells to split (2+line+2)
    const offset = Math.floor(minDim / 2);
    splitRegion(currentGrid, region, regions, selectedIdx, horizontal, offset, region.color, region.color);
    selectedIdx = -1;
    redrawAll();
  }

  let toastTimer: number | null = null;

  function showToast(msg: string): void {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('toast-hidden');
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      el.classList.add('toast-hidden');
      toastTimer = null;
    }, 2500);
  }

  function mergeSelectedRegions(): void {
    if (currentGrid === null || selectedIdx < 0 || secondSelectedIdx < 0) return;
    const a = regions[selectedIdx];
    const b = regions[secondSelectedIdx];
    const reason = mergeFailureReason(a, b);
    if (reason !== null) {
      showToast(reason);
      return;
    }
    const color = a.color;
    mergeRegions(currentGrid, regions, selectedIdx, secondSelectedIdx, color);
    refreshRegions();
    selectedIdx = -1;
    secondSelectedIdx = -1;
    redrawAll();
  }

  function deleteSelectedRegion(): void {
    if (currentGrid === null || selectedIdx < 0 || selectedIdx >= regions.length) return;
    applyRegionColor(currentGrid, regions[selectedIdx], 'white');
    redrawAll();
  }

  function toggleSelectedLineThickness(): void {
    if (currentGrid === null || selectedLineBounds === null) return;
    const regWidth = parseInt(sliderLineWidth.value, 10) || 1;
    const thickWidth = parseInt(sliderThickWidth.value, 10) || 2;
    const newThickness = selectedLineBounds.thickness === thickWidth ? regWidth : thickWidth;
    const midR = Math.floor((selectedLineBounds.r0 + selectedLineBounds.r1) / 2);
    const midC = Math.floor((selectedLineBounds.c0 + selectedLineBounds.c1) / 2);
    const changed = setLineThickness(currentGrid, midR, midC, newThickness);
    if (changed) {
      refreshRegions();
      selectedLineBounds = getLineBounds(currentGrid, midR, midC);
      redrawAll();
      showToast(newThickness === thickWidth ? 'Line → thick' : 'Line → regular');
    }
  }

  function updateStepIndicator(): void {
    if (mondrianState !== null && mondrianState.phase === 'splitting') {
      stepIndicator.textContent = `Building • ${mondrianState.rects.length} rects`;
      stepIndicator.classList.remove('step-hidden');
    } else if (mondrianState !== null && mondrianState.phase === 'coloring') {
      const total = mondrianState.paintQueue.length;
      const done = mondrianState.colorIndex;
      stepIndicator.textContent = `Painting • ${done}/${total}`;
      stepIndicator.classList.remove('step-hidden');
    } else if (mondrianState !== null && mondrianState.phase === 'balancing') {
      stepIndicator.textContent = `Balancing • ${mondrianState.balanceTried}/10`;
      stepIndicator.classList.remove('step-hidden');
    } else if (currentGrid !== null) {
      stepIndicator.textContent = `#${genCount}`;
      stepIndicator.classList.remove('step-hidden');
    } else {
      stepIndicator.classList.add('step-hidden');
    }
  }

  function generateOneShot(): void {
    const gridSize = parseInt(sliderGrid.value, 10);
    gridLabel.textContent = String(gridSize);
    saveSettings();
    resize();
    genCount++;

    currentSeed = (Math.random() * 2147483647) | 0;
    const params = readParams();
    currentBlackFrame = params.blackFrame;
    currentGrid = generateMondrianGrid(gridSize, params, currentSeed);
    mondrianState = null;
    selectedIdx = -1;
    secondSelectedIdx = -1;
    selectedLineBounds = null;
    refreshRegions();
    if (DEBUG) { console.log(`[main] one-shot #${genCount}:`); dumpGrid(currentGrid); }
    redrawAll();
    updateStepIndicator();
  }

  function initBuild(): void {
    const gridSize = parseInt(sliderGrid.value, 10);
    gridLabel.textContent = String(gridSize);
    saveSettings();
    resize();

    mondrianState = initMondrianState(gridSize, readParams(), currentSeed);
    currentGrid = mondrianState.grid;
    selectedIdx = -1;
    secondSelectedIdx = -1;
    selectedLineBounds = null;
    if (DEBUG) console.log(`[main] build replay #${genCount} (seed ${currentSeed}) started`);
    redrawAll();
    updateStepIndicator();
  }

  /** Step the build by one split. Returns true if still building. */
  function stepBuild(): boolean {
    if (mondrianState === null) return false;
    const more = stepMondrian(mondrianState);
    currentGrid = mondrianState.grid;
    redrawAll();
    updateStepIndicator();
    return more;
  }

  function scheduleTick(): void {
    if (!isPlaying || mondrianState === null) {
      animTimer = null;
      return;
    }
    const speed = parseInt(sliderSpeed.value, 10);
    const delay = Math.round(1000 / speed);
    animTimer = window.setTimeout(() => {
      if (!isPlaying) return;
      if (stepBuild()) {
        scheduleTick();
      } else {
        // Build complete (coloring + line extension done by stepMondrian)
        mondrianState = null;
        isPlaying = false;
        setPauseIcon(false);
        refreshRegions();
        redrawAll();
        updateStepIndicator();
        if (DEBUG) { console.log(`[main] build #${genCount} complete:`); dumpGrid(currentGrid!); }
      }
    }, delay);
  }

  function togglePlayback(): void {
    if (currentGrid === null) return;

    if (isPlaying) {
      // Stop
      isPlaying = false;
      setPauseIcon(false);
      if (animTimer !== null) { clearTimeout(animTimer); animTimer = null; }
      updateStepIndicator();
    } else {
      // Start: init a new build if not currently building
      if (mondrianState === null) {
        initBuild();
      }
      isPlaying = true;
      setPauseIcon(true);
      scheduleTick();
    }
  }

  btnGenerate.addEventListener('click', () => {
    // One-shot: instant full composition
    isPlaying = false;
    if (animTimer !== null) { clearTimeout(animTimer); animTimer = null; }
    setPauseIcon(false);
    generateOneShot();
  });

  btnPause.addEventListener('click', togglePlayback);

  sliderGrid.addEventListener('input', () => {
    gridLabel.textContent = sliderGrid.value;
  });

  sliderSpeed.addEventListener('input', () => {
    speedLabel.textContent = sliderSpeed.value + '×';
  });

  sliderRectCount.addEventListener('input', () => {
    rectCountLabel.textContent = sliderRectCount.value;
  });

  sliderMinRectSize.addEventListener('input', () => {
    minRectSizeLabel.textContent = sliderMinRectSize.value;
  });

  sliderLineGap.addEventListener('input', () => {
    lineGapLabel.textContent = sliderLineGap.value;
  });

  sliderLineThickChance.addEventListener('input', () => {
    lineThickChanceLabel.textContent = parseFloat(sliderLineThickChance.value).toFixed(2);
  });

  sliderTJunctionRate.addEventListener('input', () => {
    tjJunctionRateLabel.textContent = parseFloat(sliderTJunctionRate.value).toFixed(2);
  });

  sliderProportionalBias.addEventListener('input', () => {
    proportionalBiasLabel.textContent = parseFloat(sliderProportionalBias.value).toFixed(2);
  });

  toggleBlackFrame.addEventListener('change', saveSettings);
  toggleLineEdgeGap.addEventListener('change', saveSettings);

  sliderLineWidth.addEventListener('input', () => {
    lineWidthLabel.textContent = sliderLineWidth.value;
  });
  sliderThickWidth.addEventListener('input', () => {
    thickWidthLabel.textContent = sliderThickWidth.value;
  });

  btnToggleThickness.addEventListener('click', toggleSelectedLineThickness);

  btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.classList.contains('hidden') &&
        !dropdown.contains(e.target as Node) &&
        e.target !== btnSettings) {
      dropdown.classList.add('hidden');
      saveSettings();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      isPlaying = false;
      if (animTimer !== null) { clearTimeout(animTimer); animTimer = null; }
      setPauseIcon(false);
      generateOneShot();
    }
    // Keyboard shortcuts for editing
    if (selectedIdx >= 0) {
      if (e.key === 'r') changeSelectedColor('red');
      else if (e.key === 'b') changeSelectedColor('blue');
      else if (e.key === 'y') changeSelectedColor('yellow');
      else if (e.key === 'w') changeSelectedColor('white');
      else if (e.key === 'k') changeSelectedColor('black');
      else if (e.key === 'h') splitSelectedRegion(true);
      else if (e.key === 'v') splitSelectedRegion(false);
      else if (e.key === 'm' && secondSelectedIdx >= 0) mergeSelectedRegions();
      else if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelectedRegion(); }
      else if (e.key === 'Escape') { selectedIdx = -1; secondSelectedIdx = -1; selectedLineBounds = null; redrawAll(); }
      else if (e.key === 't' && selectedLineBounds !== null) toggleSelectedLineThickness();
    }
  });

  // Editing toolbar button handlers
  document.getElementById('btn-color-red')?.addEventListener('click', () => changeSelectedColor('red'));
  document.getElementById('btn-color-blue')?.addEventListener('click', () => changeSelectedColor('blue'));
  document.getElementById('btn-color-yellow')?.addEventListener('click', () => changeSelectedColor('yellow'));
  document.getElementById('btn-color-white')?.addEventListener('click', () => changeSelectedColor('white'));
  document.getElementById('btn-color-black')?.addEventListener('click', () => changeSelectedColor('black'));
  document.getElementById('btn-split-h')?.addEventListener('click', () => splitSelectedRegion(true));
  document.getElementById('btn-split-v')?.addEventListener('click', () => splitSelectedRegion(false));
  document.getElementById('btn-merge')?.addEventListener('click', mergeSelectedRegions);
  document.getElementById('btn-delete')?.addEventListener('click', deleteSelectedRegion);

  window.addEventListener('resize', () => {
    resize();
    if (currentGrid !== null) {
      redrawAll();
    }
  });

  setPauseIcon(false);
  generateOneShot();
}

init();
