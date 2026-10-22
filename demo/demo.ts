// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import {
  swirl,
  type Colors,
  type ReducedMotion,
  type SwirlMode,
  type SwirlStyle,
} from '../src/index';

const PALETTES = {
  azure: { from: '#1f7fe6', to: '#22c4ec' },
  ember: { from: '#ff8a3d', to: '#f2545b' },
  aurora: { from: '#10b981', to: '#22c4ec' },
  solar: { from: '#ffb347', to: '#ff7a1a' },
  iris: { from: '#6f79f7', to: '#c150e5' },
} as const;
type PaletteName = keyof typeof PALETTES;

const TITLES = [
  'Aurora study',
  'Tidal glass',
  'Ember field',
  'Night orchard',
  'Salt bloom',
  'Paper moon',
  'Quiet engine',
  'Signal garden',
  'Copper rain',
  'Low tide',
];

const settings = {
  style: 'plasma' as SwirlStyle,
  mode: 'move' as SwirlMode,
  palette: 'mix' as PaletteName | 'mix',
  duration: 4000,
  turns: 2,
  charge: true,
  ripple: true,
  reveal: true,
  reducedMotion: 'user' as ReducedMotion,
};

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const queue = byId<HTMLOListElement>('queue');
const gallery = byId<HTMLUListElement>('gallery');
const code = byId<HTMLElement>('code');
const status = byId<HTMLElement>('status');
const hint = byId<HTMLElement>('queue-hint');
const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/* Controls ------------------------------------------------------------ */

for (const group of document.querySelectorAll<HTMLElement>('[data-option]')) {
  group.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-value]',
    );
    if (!button) return;
    for (const other of group.querySelectorAll('button')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    Object.assign(settings, { [group.dataset.option!]: button.dataset.value });
    renderCode();
  });
}

const duration = byId<HTMLInputElement>('duration');
duration.addEventListener('input', () => {
  settings.duration = Number(duration.value);
  byId('duration-out').textContent =
    `${(settings.duration / 1000).toFixed(1)} s`;
  renderCode();
});

const turns = byId<HTMLInputElement>('turns');
turns.addEventListener('input', () => {
  settings.turns = Number(turns.value);
  byId('turns-out').textContent = String(settings.turns);
  renderCode();
});

for (const name of ['charge', 'ripple', 'reveal'] as const) {
  const box = byId<HTMLInputElement>(name);
  box.addEventListener('change', () => {
    settings[name] = box.checked;
    renderCode();
  });
}

function renderCode() {
  const colors =
    settings.palette === 'mix'
      ? `{ from: '#1f7fe6', to: '#22c4ec' }, // a new pair per item`
      : `{ from: '${PALETTES[settings.palette].from}', to: '${PALETTES[settings.palette].to}' },`;
  const lines = [
    `style: '${settings.style}',`,
    `mode: '${settings.mode}',`,
    `duration: ${settings.duration},`,
    `turns: ${settings.turns},`,
    `colors: ${colors}`,
    settings.charge ? '' : 'charge: false,',
    settings.ripple ? '' : 'ripple: false,',
    settings.reveal ? `reveal: tile.querySelector('.art'),` : '',
    settings.reducedMotion === 'user'
      ? ''
      : `reducedMotion: '${settings.reducedMotion}',`,
  ].filter(Boolean);
  code.textContent = [
    `import { swirl } from '@amudiahq/landfall';`,
    '',
    'await swirl(card, tile, {',
    ...lines.map((line) => `  ${line}`),
    '});',
  ].join('\n');
}

/* Demo items ---------------------------------------------------------- */

let sent = 0;
let running = 0;
let mixed = 0;

function pickColors(): Colors {
  if (settings.palette !== 'mix') return PALETTES[settings.palette];
  const names = Object.keys(PALETTES) as PaletteName[];
  return PALETTES[names[mixed++ % names.length]];
}

/** A small landscape poster made of gradients, so the demo needs no images. */
function makeArt() {
  const hue = Math.floor(Math.random() * 360);
  const r = (min: number, max: number) =>
    Math.round(min + Math.random() * (max - min));
  const tone = (shift: number, saturation: number, light: number) =>
    `hsl(${(hue + shift) % 360} ${saturation}% ${light}%)`;
  return [
    // A sun with a hard edge and a soft glow.
    `radial-gradient(circle at ${r(25, 75)}% ${r(22, 40)}%, ${tone(30, 100, 88)} 0 9%, ${tone(20, 95, 70)} 9.5% 10.5%, hsl(${(hue + 20) % 360} 95% 65% / 0.35) 11%, transparent 32%)`,
    // Three ridges, nearest last.
    `linear-gradient(${r(168, 176)}deg, transparent 56%, ${tone(250, 45, 30)} 56.4%)`,
    `linear-gradient(${r(184, 194)}deg, transparent 66%, ${tone(240, 50, 20)} 66.4%)`,
    `linear-gradient(${r(172, 180)}deg, transparent 78%, ${tone(230, 55, 11)} 78.4%)`,
    // The sky.
    `linear-gradient(180deg, ${tone(220, 60, 22)}, ${tone(300, 55, 45)} 55%, ${tone(20, 80, 62)})`,
  ].join(', ');
}

function createJob(title: string, colors: Colors) {
  const job = document.createElement('li');
  job.className = 'job';
  job.style.setProperty('--a', colors.from ?? '');
  job.style.setProperty('--b', colors.to ?? '');
  job.innerHTML = `
    <div class="dial"><span class="dial-core" data-landfall-core></span></div>
    <div class="job-text"><strong></strong><span>Queued</span></div>`;
  job.querySelector('strong')!.textContent = title;
  queue.prepend(job);
  job.animate(
    [
      { opacity: 0, transform: 'translateY(-6px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 250, easing: 'ease-out' },
  );
  return job;
}

function createTile(title: string) {
  const item = document.createElement('li');
  const tile = document.createElement('figure');
  tile.className = 'tile';
  tile.dataset.state = 'incoming';
  const art = document.createElement('div');
  art.className = 'tile-art art';
  art.style.background = makeArt();
  // Hidden until the energy lands.
  art.style.opacity = '0';
  const caption = document.createElement('figcaption');
  caption.textContent = title;
  tile.append(art, caption);
  item.append(tile);
  gallery.prepend(item);
  while (gallery.children.length > 8) gallery.lastElementChild?.remove();
  return { tile, art };
}

function progress(job: HTMLElement, ms: number) {
  const dial = job.querySelector<HTMLElement>('.dial')!;
  const label = job.querySelector<HTMLElement>('.job-text span')!;
  const started = performance.now();
  return new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      const percent = Math.round((1 - (1 - t) ** 2) * 100);
      dial.style.setProperty('--p', String(percent));
      label.textContent = `Rendering · ${percent}%`;
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/** Removes a card and slides the others into place. */
function removeJob(job: HTMLElement) {
  if (!job.isConnected) return;
  const others = Array.from(queue.children).filter(
    (child): child is HTMLElement => child !== job,
  );
  const before = others.map((child) => child.getBoundingClientRect());
  job.remove();
  others.forEach((child, index) => {
    const after = child.getBoundingClientRect();
    const dx = before[index].left - after.left;
    const dy = before[index].top - after.top;
    if (!dx && !dy) return;
    child.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    );
  });
  updateHint();
}

function updateHint() {
  hint.textContent = running
    ? `${running} running`
    : sent
      ? 'All landed'
      : 'Press Send to start';
}

async function send(delay = 0) {
  await wait(delay);
  const title = TITLES[sent % TITLES.length];
  sent += 1;
  running += 1;
  const colors = pickColors();
  const job = createJob(title, colors);
  const { tile, art } = createTile(title);
  updateHint();

  await progress(job, 1300 + Math.random() * 700);
  job.dataset.state = 'done';
  job.querySelector('.job-text span')!.textContent = 'Done';
  const mode = settings.mode;

  await swirl(job, () => (tile.isConnected ? tile : null), {
    style: settings.style,
    mode,
    duration: settings.duration,
    turns: settings.turns,
    colors,
    charge: settings.charge,
    ripple: settings.ripple,
    reveal: settings.reveal ? art : false,
    reducedMotion: settings.reducedMotion,
    onCollapse: () => removeJob(job),
    onImpact: () => {
      tile.dataset.state = 'landed';
      art.style.opacity = '1';
    },
  });

  running -= 1;
  updateHint();
  status.textContent = `${title} landed`;
  if (mode === 'move') {
    removeJob(job);
    return;
  }
  // The card stayed: let it rest a moment, then fade it out.
  await wait(700);
  await job
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 250,
      fill: 'forwards',
    })
    .finished.catch(() => undefined);
  removeJob(job);
}

byId('send-one').addEventListener('click', () => void send());
byId('send-three').addEventListener('click', () => {
  void send(0);
  void send(350);
  void send(700);
});

renderCode();
