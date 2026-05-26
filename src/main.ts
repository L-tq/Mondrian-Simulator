import { Application, Graphics } from 'pixi.js';
import { createInitialState, evolveStateSteps, setDebug, MondrianStep } from './mondrian';
import { drawMondrian } from './renderer';

if (typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)) {
  setDebug(true);
  console.log('[main] debug mode enabled');
}

const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const dropdown = document.getElementById('settings-dropdown') as HTMLDivElement;
const sliderGrid = document.getElementById('grid-size') as HTMLInputElement;
const sliderColor = document.getElementById('color-intensity') as HTMLInputElement;
const sliderSpeed = document.getElementById('playback-speed') as HTMLInputElement;
const gridLabel = document.getElementById('grid-size-label') as HTMLSpanElement;
const colorLabel = document.getElementById('color-intensity-label') as HTMLSpanElement;
const speedLabel = document.getElementById('playback-speed-label') as HTMLSpanElement;
const stepIndicator = document.getElementById('step-indicator') as HTMLDivElement;

let gridSize = parseInt(sliderGrid.value, 10);
let colorIntensity = parseInt(sliderColor.value, 10) / 100;
let canvasSize = 0;

let steps: MondrianStep[] = [];
let currentStepIndex = 0;
let animTimer: number | null = null;

const app = new Application();

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

  function showStep(index: number): void {
    if (index >= steps.length) {
      stepIndicator.classList.add('step-hidden');
      return;
    }
    const step = steps[index];
    stepIndicator.textContent = step.label;
    stepIndicator.classList.remove('step-hidden');
    drawMondrian(graphics, step.state, canvasSize, canvasSize);
  }

  function animateSteps(): void {
    cancelAnimation();
    if (steps.length === 0) return;

    const speed = parseInt(sliderSpeed.value, 10);
    const delay = Math.round(1000 / speed);

    currentStepIndex = 0;
    showStep(0);

    if (steps.length <= 1) return;

    function advance(): void {
      currentStepIndex++;
      if (currentStepIndex >= steps.length) {
        animTimer = null;
        stepIndicator.classList.add('step-hidden');
        return;
      }
      showStep(currentStepIndex);
      animTimer = window.setTimeout(advance, delay);
    }

    animTimer = window.setTimeout(advance, delay);
  }

  function generate(): void {
    gridSize = parseInt(sliderGrid.value, 10);
    colorIntensity = parseInt(sliderColor.value, 10) / 100;
    gridLabel.textContent = String(gridSize);
    colorLabel.textContent = String(Math.round(colorIntensity * 100));

    cancelAnimation();
    resize();

    const initial = createInitialState(gridSize);
    steps = evolveStateSteps(initial, colorIntensity);
    animateSteps();
  }

  btnGenerate.addEventListener('click', generate);

  sliderGrid.addEventListener('input', () => {
    gridLabel.textContent = sliderGrid.value;
  });

  sliderColor.addEventListener('input', () => {
    colorLabel.textContent = sliderColor.value;
  });

  sliderSpeed.addEventListener('input', () => {
    speedLabel.textContent = sliderSpeed.value + '×';
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
    if (currentStepIndex < steps.length) {
      showStep(currentStepIndex);
    }
  });

  generate();
}

// Background color constant (must match COLORS.white from mondrian.ts)
const COLORS_WHITE = '#F8F6F0';

init();
