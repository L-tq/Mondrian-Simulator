import { Application, Graphics } from 'pixi.js';
import type { Grid } from './automata';
import type { LifeColor, MondrianParams, MondrianState } from './mondrian';
import { generateMondrianGrid, initMondrianState, stepMondrian, dumpGrid } from './mondrian';
import { drawGrid, COLORS } from './renderer';

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
    if (DEBUG) { console.log(`[main] one-shot #${genCount}:`); dumpGrid(currentGrid); }
    drawGrid(graphics, currentGrid, canvasSize, canvasSize);
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
    if (DEBUG) console.log(`[main] build #${genCount} started`);
    drawGrid(graphics, currentGrid, canvasSize, canvasSize);
    updateStepIndicator();
  }

  /** Step the build by one split. Returns true if still building. */
  function stepBuild(): boolean {
    if (mondrianState === null) return false;
    const more = stepMondrian(mondrianState);
    currentGrid = mondrianState.grid;
    drawGrid(graphics, currentGrid, canvasSize, canvasSize);
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
  });

  window.addEventListener('resize', () => {
    resize();
    if (currentGrid !== null) {
      drawGrid(graphics, currentGrid, canvasSize, canvasSize);
    }
  });

  generateOneShot();
}

init();
