import { Application, Graphics } from 'pixi.js';
import { Grid } from './automata';
import { LifeColor, initLifeLikeState, stepLifeLikeCA, hasConverged, MAX_TICKS } from './life';
import { drawCAGrid } from './renderer';

if (typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)) {
  console.log('[main] debug mode enabled (CA mode)');
}

const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const dropdown = document.getElementById('settings-dropdown') as HTMLDivElement;
const sliderGrid = document.getElementById('grid-size') as HTMLInputElement;
const sliderColor = document.getElementById('color-intensity') as HTMLInputElement;
const sliderSpeed = document.getElementById('playback-speed') as HTMLInputElement;
const sliderDensity = document.getElementById('density') as HTMLInputElement;
const gridLabel = document.getElementById('grid-size-label') as HTMLSpanElement;
const colorLabel = document.getElementById('color-intensity-label') as HTMLSpanElement;
const speedLabel = document.getElementById('playback-speed-label') as HTMLSpanElement;
const densityLabel = document.getElementById('density-label') as HTMLSpanElement;
const stepIndicator = document.getElementById('step-indicator') as HTMLDivElement;

let gridSize = parseInt(sliderGrid.value, 10);
let density = parseInt(sliderDensity.value, 10) / 100;
let canvasSize = 0;

let caGrid: Grid<LifeColor> | null = null;
let isPaused = false;
let isConverged = false;
let tickCount = 0;
let animTimer: number | null = null;

const app = new Application();

// Play / pause icon SVGs
const ICON_PLAY = `<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />`;
const ICON_PAUSE = `<rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />`;

function setPauseIcon(playing: boolean): void {
  btnPause.innerHTML = playing
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICON_PAUSE}</svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICON_PLAY}</svg>`;
}

async function init(): Promise<void> {
  await app.init({
    background: COLORS_WHITE,
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

  function cancelAnimation(): void {
    if (animTimer !== null) {
      clearTimeout(animTimer);
      animTimer = null;
    }
  }

  function updateStepIndicator(): void {
    if (isConverged) {
      stepIndicator.textContent = `Converged • ${tickCount} ticks`;
      stepIndicator.classList.remove('step-hidden');
    } else if (isPaused) {
      stepIndicator.textContent = `Paused • Tick ${tickCount}`;
      stepIndicator.classList.remove('step-hidden');
    } else if (caGrid !== null) {
      stepIndicator.textContent = `Tick ${tickCount}`;
      stepIndicator.classList.remove('step-hidden');
    } else {
      stepIndicator.classList.add('step-hidden');
    }
  }

  function tick(): void {
    if (isPaused || isConverged || caGrid === null) {
      animTimer = null;
      return;
    }

    const nextGrid = stepLifeLikeCA(caGrid);
    tickCount++;

    if (hasConverged(caGrid, nextGrid) || tickCount >= MAX_TICKS) {
      isConverged = true;
      caGrid = nextGrid;
      drawCAGrid(graphics, caGrid, canvasSize, canvasSize);
      updateStepIndicator();
      setPauseIcon(false);
      animTimer = null;
      return;
    }

    caGrid = nextGrid;
    drawCAGrid(graphics, caGrid, canvasSize, canvasSize);
    updateStepIndicator();

    const speed = parseInt(sliderSpeed.value, 10);
    const delay = Math.round(1000 / speed);
    animTimer = window.setTimeout(tick, delay);
  }

  function togglePause(): void {
    if (isConverged || caGrid === null) return;
    isPaused = !isPaused;
    setPauseIcon(!isPaused);
    updateStepIndicator();

    if (!isPaused && animTimer === null) {
      tick();
    }
  }

  function generate(): void {
    gridSize = parseInt(sliderGrid.value, 10);
    density = parseInt(sliderDensity.value, 10) / 100;
    const colorVal = sliderColor.value;
    gridLabel.textContent = String(gridSize);
    colorLabel.textContent = colorVal;
    densityLabel.textContent = String(Math.round(density * 100));

    cancelAnimation();
    resize();

    isPaused = false;
    isConverged = false;
    tickCount = 0;

    caGrid = initLifeLikeState(gridSize, density);
    drawCAGrid(graphics, caGrid, canvasSize, canvasSize);
    updateStepIndicator();
    setPauseIcon(true);

    tick();
  }

  btnGenerate.addEventListener('click', generate);

  btnPause.addEventListener('click', togglePause);

  sliderGrid.addEventListener('input', () => {
    gridLabel.textContent = sliderGrid.value;
  });

  sliderColor.addEventListener('input', () => {
    colorLabel.textContent = sliderColor.value;
  });

  sliderSpeed.addEventListener('input', () => {
    speedLabel.textContent = sliderSpeed.value + '×';
  });

  sliderDensity.addEventListener('input', () => {
    densityLabel.textContent = sliderDensity.value;
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
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      generate();
    }
  });

  window.addEventListener('resize', () => {
    resize();
    if (caGrid !== null) {
      drawCAGrid(graphics, caGrid, canvasSize, canvasSize);
    }
  });

  generate();
}

const COLORS_WHITE = '#F8F6F0';

init();
