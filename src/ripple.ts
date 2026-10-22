// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import { createCanvas, dot, setSoftMask, showLayer, softWave } from './draw';
import type { Point, RippleOptions, SwirlStyle, Target } from './types';
import {
  TAU,
  clamp,
  createScope,
  easeOutCubic,
  easeOutQuad,
  isElement,
  prefersReduced,
  targetReader,
  toPalette,
  toStyle,
  type Palette,
  type Scope,
} from './util';

export const RIPPLE_MS = 1300;

/** How each style breaks over the target. */
const IMPACT: Record<
  SwirlStyle,
  {
    waves: number;
    band: number;
    beads: number;
    spiral: number;
    petals: number;
    /** Beads fly out as rays instead of dots. */
    rays: boolean;
  }
> = {
  plasma: { waves: 2, band: 22, beads: 22, spiral: 0, petals: 0, rays: false },
  nova: { waves: 1, band: 30, beads: 30, spiral: 0, petals: 0, rays: true },
  orbit: { waves: 1, band: 22, beads: 30, spiral: 3, petals: 0, rays: false },
  pulse: { waves: 3, band: 24, beads: 30, spiral: 0, petals: 6, rays: false },
};

export function revealLayers(
  reveal: RippleOptions['reveal'],
  target: HTMLElement | null,
): HTMLElement[] {
  if (!reveal) return [];
  if (reveal === true) return target ? [target] : [];
  return (Array.isArray(reveal) ? reveal : [reveal]).filter(isElement);
}

export function hideLayers(layers: HTMLElement[]) {
  for (const layer of layers) layer.style.opacity = '0';
}

/** The reduced-motion reveal: a short fade, no waves. */
export async function fadeIn(layers: HTMLElement[], scope: Scope) {
  await Promise.all(
    layers.map(
      (layer) =>
        scope.animate(layer, [{ opacity: 0 }, { opacity: 1 }], {
          duration: 200,
          easing: 'ease-out',
        }).done,
    ),
  );
  layers.forEach(showLayer);
}

type RippleRun = {
  read: ReturnType<typeof targetReader>;
  origin: Point | null;
  palette: Palette;
  style: SwirlStyle;
  duration: number;
  layers: HTMLElement[];
  gridSize: number;
  zIndex: number;
  scope: Scope;
};

/**
 * Soft waves of light run across a dot grid over the target from `origin`;
 * reveal layers fade in through a feathered mask that trails the wave, and
 * beads scatter outward.
 */
export async function playRipple(run: RippleRun): Promise<void> {
  const { layers, palette, scope } = run;
  const first = run.read();
  const start = first?.rect;
  if (!start || start.width === 0 || start.height === 0) {
    layers.forEach(showLayer);
    return;
  }
  const offLayers = scope.onAbort(() => layers.forEach(showLayer));
  const style = IMPACT[run.style];
  const spacing = Math.max(run.gridSize, 4);
  const point = run.origin ?? {
    x: start.left + start.width / 2,
    y: start.top + start.height / 2,
  };
  const ox = clamp(point.x - start.left, 0, start.width);
  const oy = clamp(point.y - start.top, 0, start.height);
  const reach = Math.max(
    Math.hypot(ox, oy),
    Math.hypot(start.width - ox, oy),
    Math.hypot(ox, start.height - oy),
    Math.hypot(start.width - ox, start.height - oy),
  );
  const feather = Math.max(70, reach * 0.6);

  const element = first.element;
  if (element) {
    scope.animate(
      element,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.025)', offset: 0.25 },
        { transform: 'scale(1)' },
      ],
      {
        duration: run.duration / 2,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        composite: 'add',
      },
    );
  }

  const host = createCanvas(start, run.zIndex, scope);
  if (element)
    host.canvas.style.borderRadius = getComputedStyle(element).borderRadius;
  const context = host.context;

  const beads = Array.from({ length: style.beads }, (_, index) => {
    const petal = style.petals
      ? (Math.floor(index / (style.beads / style.petals)) / style.petals) * TAU
      : 0;
    return {
      angle: style.petals
        ? petal + (Math.random() - 0.5) * 0.45
        : (index / style.beads) * TAU + Math.random() * 0.4,
      reach: 0.35 + Math.random() * 0.55,
      size: 1.6 + Math.random() * 2.2,
    };
  });

  const center = { x: ox, y: oy };
  const draw = (t: number, left: number, top: number) => {
    // Reveal layers fade in through a feathered circle that trails the wave.
    const opening = easeOutQuad(clamp((t - 0.04) / 0.96, 0, 1));
    for (const layer of layers) {
      const rect = layer.getBoundingClientRect();
      layer.style.opacity = String(Math.min(1, opening * 2.5));
      setSoftMask(
        layer,
        { x: left + ox - rect.left, y: top + oy - rect.top },
        (reach + feather) * opening,
        feather,
      );
    }

    if (!context) return;
    host.clear();
    const front = reach * easeOutCubic(t);
    const fade = 1 - t;

    // Grid dots swell and light up as the wave front passes them.
    for (let y = spacing / 2; y < start.height; y += spacing) {
      for (let x = spacing / 2; x < start.width; x += spacing) {
        const band = (Math.hypot(x - ox, y - oy) - front) / style.band;
        const glow = Math.exp(-band * band);
        if (glow < 0.04) continue;
        const radius = 0.8 + glow * 2.4;
        context.fillStyle = `rgba(${palette.glow}, ${glow * fade * 0.95})`;
        dot(context, x, y, radius);
        if (glow > 0.6) {
          context.fillStyle = `rgba(255, 255, 255, ${(glow - 0.6) * 2 * fade})`;
          dot(context, x, y, radius * 0.45);
        }
      }
    }

    // Soft waves of light: each one swells, then fades out as it travels.
    context.globalCompositeOperation = 'lighter';
    for (let wave = 0; wave < style.waves; wave += 1) {
      const radius = front * (1 - wave * 0.22);
      const strength = (wave === 0 ? 0.32 : 0.2) * fade * Math.min(1, t * 6);
      softWave(
        context,
        center,
        radius,
        style.band * 2.4,
        `rgba(${palette.glow}, ${strength})`,
        start,
      );
      if (wave === 0) {
        softWave(
          context,
          center,
          radius,
          style.band * 0.9,
          `rgba(255, 255, 255, ${strength * 0.8})`,
          start,
        );
      }
    }
    context.globalCompositeOperation = 'source-over';

    const travel = easeOutCubic(Math.min(t * 1.3, 1));
    for (const bead of beads) {
      const distance = reach * bead.reach * travel;
      const angle = bead.angle + style.spiral * travel;
      const x = ox + Math.cos(angle) * distance;
      const y = oy + Math.sin(angle) * distance;
      const size = bead.size * (1 - t * 0.5);
      if (style.rays) {
        // A short ray pointing away from the impact.
        const back = distance * 0.55;
        const bx = ox + Math.cos(angle) * back;
        const by = oy + Math.sin(angle) * back;
        const ray = context.createLinearGradient(bx, by, x, y);
        ray.addColorStop(0, `rgba(${palette.glow}, 0)`);
        ray.addColorStop(1, `rgba(255, 255, 255, ${fade})`);
        context.strokeStyle = ray;
        context.lineWidth = size * 0.8;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(bx, by);
        context.lineTo(x, y);
        context.stroke();
        continue;
      }
      context.fillStyle = `rgba(${palette.glow}, ${0.9 * fade})`;
      dot(context, x, y, size);
      context.fillStyle = `rgba(255, 255, 255, ${fade})`;
      dot(context, x, y, size * 0.5);
    }
  };

  const began = performance.now();
  let left = start.left;
  let top = start.top;
  await scope.frames((now) => {
    // A frame time can precede `began` by a few ms; never go negative.
    const t = clamp((now - began) / run.duration, 0, 1);
    // Follow the target if the layout shifts while the ripple plays.
    const rect = run.read()?.rect;
    if (rect) {
      left = rect.left;
      top = rect.top;
      host.canvas.style.left = `${left}px`;
      host.canvas.style.top = `${top}px`;
    }
    draw(t, left, top);
    return t < 1;
  });
  host.remove();
  offLayers();
  layers.forEach(showLayer);
}

/**
 * Plays only the landing ripple over `target`, e.g. for content that arrives
 * after the energy has landed. Resolves when it ends.
 */
export async function ripple(
  target: Target,
  options: RippleOptions = {},
): Promise<void> {
  if (typeof window === 'undefined') return;
  const scope = createScope(options.signal);
  if (scope.aborted) return;
  const read = targetReader(target);
  const layers = revealLayers(options.reveal, read()?.element ?? null);
  hideLayers(layers);
  try {
    if (document.hidden) {
      // A hidden page runs no frames: show the layers at once.
      layers.forEach(showLayer);
    } else if (prefersReduced(options.reducedMotion)) {
      await fadeIn(layers, scope);
    } else {
      await playRipple({
        read,
        origin: options.origin ?? null,
        palette: toPalette(options.colors),
        style: toStyle(options.style),
        duration: Math.max(options.duration ?? RIPPLE_MS, 100),
        layers,
        gridSize: options.gridSize ?? 14,
        zIndex: options.zIndex ?? 9999,
        scope,
      });
    }
  } finally {
    scope.dispose();
  }
  if (!scope.aborted) options.onComplete?.();
}
