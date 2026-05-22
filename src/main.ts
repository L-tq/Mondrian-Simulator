import { Application, Graphics } from 'pixi.js';
import { createInitialState, evolveState, setDebug } from './mondrian';
import { drawMondrian } from './renderer';

if (typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)) {
  setDebug(true);
  console.log('[main] debug mode enabled');
}

const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
const sliderGrid = document.getElementById('grid-size') as HTMLInputElement;
const sliderColor = document.getElementById('color-intensity') as HTMLInputElement;
const gridLabel = document.getElementById('grid-size-label') as HTMLSpanElement;
const colorLabel = document.getElementById('color-intensity-label') as HTMLSpanElement;

let gridSize = parseInt(sliderGrid.value, 10);
let colorIntensity = parseInt(sliderColor.value, 10) / 100;
let state = createInitialState(gridSize);
let canvasSize = 0;

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

  function generate(): void {
    gridSize = parseInt(sliderGrid.value, 10);
    colorIntensity = parseInt(sliderColor.value, 10) / 100;
    gridLabel.textContent = String(gridSize);
    colorLabel.textContent = String(Math.round(colorIntensity * 100));

    state = createInitialState(gridSize);
    state = evolveState(state, colorIntensity);

    resize();
    drawMondrian(graphics, state, canvasSize, canvasSize);
  }

  btnGenerate.addEventListener('click', generate);

  sliderGrid.addEventListener('input', () => {
    gridLabel.textContent = sliderGrid.value;
  });

  sliderColor.addEventListener('input', () => {
    colorLabel.textContent = sliderColor.value;
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      generate();
    }
  });

  window.addEventListener('resize', () => {
    resize();
    drawMondrian(graphics, state, canvasSize, canvasSize);
  });

  generate();
}

// Background color constant (must match COLORS.white from mondrian.ts)
const COLORS_WHITE = '#F8F6F0';

init();
