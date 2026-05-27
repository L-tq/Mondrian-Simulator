import { Application, Graphics } from 'pixi.js';
import type { Grid } from './automata';
import type { LifeColor, MondrianParams, MondrianState } from './mondrian';
import { generateMondrianGrid, initMondrianState, stepMondrian, dumpGrid, extractRegions, findRegionAt, applyRegionColor, splitRegion, mergeRegions, mergeFailureReason } from './mondrian';
import type { ColoredRect } from './mondrian';
import { drawGrid, drawHighlight, COLORS } from './renderer';

const DEBUG = typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search);
if (DEBUG) console.log('[main] debug mode enabled');

const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const dropdown = document.getElementById('settings-dropdown') as HTMLDivElement;
const sliderGrid = document.getElementById('grid-size') as HTMLInputElement;
const sliderSpeed = document.getElementById('playback-speed') as HTMLInputElement;
const sliderRectCount = document.getElementById('rect-count') as HTMLInputElement;
const sliderRedRate = document.getElementById('red-rate') as HTMLInputElement;
const sliderBlueRate = document.getElementById('blue-rate') as HTMLInputElement;
const sliderYellowRate = document.getElementById('yellow-rate') as HTMLInputElement;
const sliderWhiteRate = document.getElementById('white-rate') as HTMLInputElement;
const sliderBlackRate = document.getElementById('black-rate') as HTMLInputElement;
const gridLabel = document.getElementById('grid-size-label') as HTMLSpanElement;
const speedLabel = document.getElementById('playback-speed-label') as HTMLSpanElement;
const rectCountLabel = document.getElementById('rect-count-label') as HTMLSpanElement;
const redRateLabel = document.getElementById('red-rate-label') as HTMLSpanElement;
const blueRateLabel = document.getElementById('blue-rate-label') as HTMLSpanElement;
const yellowRateLabel = document.getElementById('yellow-rate-label') as HTMLSpanElement;
const whiteRateLabel = document.getElementById('white-rate-label') as HTMLSpanElement;
const blackRateLabel = document.getElementById('black-rate-label') as HTMLSpanElement;
const stepIndicator = document.getElementById('step-indicator') as HTMLDivElement;

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'mondrian-settings-v2';
const COOKIE_DAYS = 365;

interface Settings {
  gridSize: number;
  speed: number;
  rectCount: number;
  redRate: number;
  blueRate: number;
  yellowRate: number;
  whiteRate: number;
  blackRate: number;
}

function saveSettings(): void {
  const s: Settings = {
    gridSize: parseInt(sliderGrid.value, 10),
    speed: parseInt(sliderSpeed.value, 10),
    rectCount: parseInt(sliderRectCount.value, 10),
    redRate: parseInt(sliderRedRate.value, 10),
    blueRate: parseInt(sliderBlueRate.value, 10),
    yellowRate: parseInt(sliderYellowRate.value, 10),
    whiteRate: parseInt(sliderWhiteRate.value, 10),
    blackRate: parseInt(sliderBlackRate.value, 10),
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
  sliderRedRate.value = String(s.redRate ?? 20);
  sliderBlueRate.value = String(s.blueRate ?? 20);
  sliderYellowRate.value = String(s.yellowRate ?? 20);
  sliderWhiteRate.value = String(s.whiteRate ?? 30);
  sliderBlackRate.value = String(s.blackRate ?? 10);
  gridLabel.textContent = String(s.gridSize);
  speedLabel.textContent = s.speed + '×';
  rectCountLabel.textContent = String(s.rectCount ?? 15);
  redRateLabel.textContent = String(s.redRate ?? 20);
  blueRateLabel.textContent = String(s.blueRate ?? 20);
  yellowRateLabel.textContent = String(s.yellowRate ?? 20);
  whiteRateLabel.textContent = String(s.whiteRate ?? 30);
  blackRateLabel.textContent = String(s.blackRate ?? 10);
}

const saved = loadSettings();
if (saved) {
  applySettings(saved);
} else {
  sliderGrid.value = '16';
  sliderSpeed.value = '4';
  sliderRectCount.value = '15';
  sliderRedRate.value = '20';
  sliderBlueRate.value = '20';
  sliderYellowRate.value = '20';
  sliderWhiteRate.value = '30';
  sliderBlackRate.value = '10';
  gridLabel.textContent = '16';
  speedLabel.textContent = '4×';
  rectCountLabel.textContent = '15';
  redRateLabel.textContent = '20';
  blueRateLabel.textContent = '20';
  yellowRateLabel.textContent = '20';
  whiteRateLabel.textContent = '30';
  blackRateLabel.textContent = '10';
}

let canvasSize = 0;
let currentGrid: Grid<LifeColor> | null = null;
let mondrianState: MondrianState | null = null;
let isPlaying = false;
let genCount = 0;
let animTimer: number | null = null;
let regions: ColoredRect[] = [];
let selectedIdx: number = -1;
let secondSelectedIdx: number = -1;
let highlightGraphics: Graphics | null = null;
let gridPixelSize = 0; // canvasSize passed to draw functions

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
      minRectSize: 3,
      lineGap: 2,
      lineThickChance: 0,
      redRate: parseInt(sliderRedRate.value, 10) / 100,
      blueRate: parseInt(sliderBlueRate.value, 10) / 100,
      yellowRate: parseInt(sliderYellowRate.value, 10) / 100,
      whiteRate: parseInt(sliderWhiteRate.value, 10) / 100,
      blackRate: parseInt(sliderBlackRate.value, 10) / 100,
    };
  }

  function refreshRegions(): void {
    if (currentGrid !== null) {
      regions = extractRegions(currentGrid);
    }
  }

  function redrawAll(): void {
    if (currentGrid === null) return;
    drawGrid(graphics, currentGrid, canvasSize, canvasSize);
    highlightGraphics?.clear();
    if (selectedIdx >= 0 && selectedIdx < regions.length) {
      drawHighlight(highlightGraphics!, regions[selectedIdx], currentGrid.rows, canvasSize, canvasSize);
    }
    if (secondSelectedIdx >= 0 && secondSelectedIdx < regions.length) {
      drawHighlight(highlightGraphics!, regions[secondSelectedIdx], currentGrid.rows, canvasSize, canvasSize);
    }
    updateEditToolbar();
  }

  function updateEditToolbar(): void {
    const bar = document.getElementById('edit-toolbar');
    if (!bar) return;
    if (selectedIdx >= 0) {
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
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
    if (color === 'empty' || color === 'line') {
      // Clicked on a line or empty area — deselect
      selectedIdx = -1;
      secondSelectedIdx = -1;
      redrawAll();
      return;
    }

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

  function updateStepIndicator(): void {
    if (mondrianState !== null && mondrianState.phase === 'splitting') {
      stepIndicator.textContent = `Building • ${mondrianState.rects.length} rects`;
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

    const params = readParams();
    currentGrid = generateMondrianGrid(gridSize, params);
    mondrianState = null;
    selectedIdx = -1;
    secondSelectedIdx = -1;
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
    genCount++;

    mondrianState = initMondrianState(gridSize, readParams());
    currentGrid = mondrianState.grid;
    selectedIdx = -1;
    secondSelectedIdx = -1;
    if (DEBUG) console.log(`[main] build #${genCount} started`);
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
        // Build complete
        mondrianState = null;
        isPlaying = false;
        setPauseIcon(false);
        refreshRegions();
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

  sliderRedRate.addEventListener('input', () => {
    redRateLabel.textContent = sliderRedRate.value;
  });

  sliderBlueRate.addEventListener('input', () => {
    blueRateLabel.textContent = sliderBlueRate.value;
  });

  sliderYellowRate.addEventListener('input', () => {
    yellowRateLabel.textContent = sliderYellowRate.value;
  });

  sliderWhiteRate.addEventListener('input', () => {
    whiteRateLabel.textContent = sliderWhiteRate.value;
  });

  sliderBlackRate.addEventListener('input', () => {
    blackRateLabel.textContent = sliderBlackRate.value;
  });

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
      else if (e.key === 'Escape') { selectedIdx = -1; secondSelectedIdx = -1; redrawAll(); }
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

  generateOneShot();
}

init();
