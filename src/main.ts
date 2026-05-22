import { createInitialState, evolveState, setDebug } from './mondrian';
import { renderMondrian } from './renderer';

// Enable debug mode via ?debug=1 URL parameter
if (typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)) {
  setDebug(true);
  console.log('[main] debug mode enabled');
}

const canvas = document.getElementById('mondrian-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
const sliderGrid = document.getElementById('grid-size') as HTMLInputElement;
const sliderColor = document.getElementById('color-intensity') as HTMLInputElement;
const gridLabel = document.getElementById('grid-size-label') as HTMLSpanElement;
const colorLabel = document.getElementById('color-intensity-label') as HTMLSpanElement;

let gridSize = parseInt(sliderGrid.value, 10);
let colorIntensity = parseInt(sliderColor.value, 10) / 100;
let state = createInitialState(gridSize);
let canvasSize = 0;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const maxDim = Math.min(window.innerWidth, window.innerHeight) * 0.78;
  canvasSize = Math.floor(maxDim);
  const px = Math.floor(canvasSize * dpr);
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${canvasSize}px`;
  canvas.style.height = `${canvasSize}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function generate(): void {
  gridSize = parseInt(sliderGrid.value, 10);
  colorIntensity = parseInt(sliderColor.value, 10) / 100;
  gridLabel.textContent = String(gridSize);
  colorLabel.textContent = String(Math.round(colorIntensity * 100));

  state = createInitialState(gridSize);
  state = evolveState(state, colorIntensity);

  resize();
  renderMondrian(ctx, state, canvasSize, canvasSize);
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
  renderMondrian(ctx, state, canvasSize, canvasSize);
});

// Initial render
generate();
