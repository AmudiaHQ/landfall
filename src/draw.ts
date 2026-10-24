// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import type { Point, RectLike, SwirlStyle } from './types';
import { TAU, clamp, type Palette, type Scope } from './util';

export type Context = CanvasRenderingContext2D;

/** Radius of the energy cloud: fine dust around a tiny bright core. */
export const BALL_RADIUS = 11;
const CLOUD_MOTES = 54;

/** A fixed, click-through canvas over `rect` (CSS pixels), gone on abort. */
export function createCanvas(rect: RectLike, zIndex: number, scope: Scope) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  Object.assign(canvas.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: String(zIndex),
  });
  document.body.appendChild(canvas);
  const context = canvas.getContext('2d');
  const remove = () => canvas.remove();
  const off = scope.onAbort(remove);
  return {
    canvas,
    context,
    clear() {
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
    },
    remove() {
      off();
      remove();
    },
  };
}

export function dot(context: Context, x: number, y: number, radius: number) {
  context.beginPath();
  context.arc(x, y, Math.max(radius, 0.1), 0, TAU);
  context.fill();
}

/* ---------------------------------------------------------------------- */
/* Energy ball                                                            */
/* ---------------------------------------------------------------------- */

/** A small cloud of dust around a bright core; each style arranges it. */
export function drawBall(
  context: Context,
  at: Point,
  radius: number,
  time: number,
  palette: Palette,
  style: SwirlStyle,
  alpha = 1,
) {
  if (radius <= 0.3 || alpha <= 0) return;
  const { x, y } = at;
  context.save();
  context.globalAlpha = alpha;
  context.globalCompositeOperation = 'lighter';

  const halo = context.createRadialGradient(x, y, 0, x, y, radius * 2.4);
  halo.addColorStop(0, `rgba(${palette.glow}, 0.28)`);
  halo.addColorStop(1, `rgba(${palette.glow}, 0)`);
  context.fillStyle = halo;
  dot(context, x, y, radius * 2.4);

  const tones = [palette.from, palette.to, '#ffffff'];
  for (let i = 0; i < CLOUD_MOTES; i += 1) {
    const seed = i * 2.399963; // golden angle spreads the dust evenly
    let px: number;
    let py: number;
    let fade = 1;

    if (style === 'plasma') {
      // Dust on two tilted rings spinning against each other.
      const ring = i % 2;
      const angle = seed + time * (ring ? -3.4 : 2.6);
      const tilt = ring ? -0.9 : 0.5;
      const ex = Math.cos(angle) * radius;
      const ey = Math.sin(angle) * radius * 0.38;
      px = x + ex * Math.cos(tilt) - ey * Math.sin(tilt);
      py = y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
    } else if (style === 'nova') {
      // Dust streaming out along eight rays.
      const phase = (time * 1.7 + i * 0.137) % 1;
      const angle = ((i % 8) / 8) * TAU + time * 0.7;
      const distance = radius * 1.5 * phase;
      px = x + Math.cos(angle) * distance;
      py = y + Math.sin(angle) * distance;
      fade = 1 - phase;
    } else if (style === 'orbit') {
      // Three small clusters circling the core.
      const angle = time * 4.4 + ((i % 3) / 3) * TAU;
      const jitter = 1.5 + (i % 5) * 0.9;
      px = x + Math.cos(angle) * radius + Math.cos(seed) * jitter;
      py = y + Math.sin(angle) * radius * 0.6 + Math.sin(seed) * jitter;
    } else {
      // Breathing shells of dust.
      const phase = (time * 1.3 + (i % 3) / 3) % 1;
      const distance = radius * (0.3 + phase * 1.2);
      px = x + Math.cos(seed) * distance;
      py = y + Math.sin(seed) * distance;
      fade = 1 - phase;
    }

    context.globalAlpha = alpha * 0.85 * fade;
    context.fillStyle = tones[i % tones.length];
    dot(context, px, py, 0.45 + (i % 4) * 0.22);
  }

  // A tiny bright core.
  context.globalAlpha = alpha;
  context.fillStyle = `rgba(${palette.glow}, 0.55)`;
  dot(context, x, y, radius * 0.32);
  context.fillStyle = '#ffffff';
  dot(context, x, y, radius * 0.16);
  context.restore();
}

/* ---------------------------------------------------------------------- */
/* Particles and tail                                                     */
/* ---------------------------------------------------------------------- */

export type Mote = {
  radius: number;
  angle: number;
  /** Share of the swirl before this mote starts, and how long it travels. */
  delay: number;
  span: number;
  size: number;
  color: string;
  /** Turns this mote makes on its way in (plasma). */
  spin: number;
  /** Orbit style: which of the three orbits the mote joins. */
  ring: number;
};

/** Particles laid on a dot grid over `region`, ready to gather at `center`. */
export function sampleMotes(
  region: RectLike,
  center: Point,
  palette: Palette,
  style: SwirlStyle,
  gridSize: number,
  turns: number,
): Mote[] {
  const colors = [
    palette.from,
    palette.to,
    '#ffffff',
    `rgba(${palette.glow}, 1)`,
  ];
  const right = region.left + region.width;
  const bottom = region.top + region.height;
  const farthest = Math.max(
    Math.hypot(region.left - center.x, region.top - center.y),
    Math.hypot(right - center.x, region.top - center.y),
    Math.hypot(region.left - center.x, bottom - center.y),
    Math.hypot(right - center.x, bottom - center.y),
    1,
  );
  const step = Math.max(gridSize, 4);
  const motes: Mote[] = [];
  for (let y = region.top + step / 2; y < bottom; y += step) {
    for (let x = region.left + step / 2; x < right; x += step) {
      if (Math.random() > 0.55) continue;
      const radius = Math.hypot(x - center.x, y - center.y);
      // Pulse pulls the source in three shells, inner first.
      const shell = Math.min(2, Math.floor((radius / farthest) * 3));
      motes.push({
        radius,
        angle: Math.atan2(y - center.y, x - center.x),
        delay: style === 'pulse' ? shell * 0.17 : Math.random() * 0.25,
        span: style === 'pulse' ? 0.6 : 0.75,
        size: 0.7 + Math.random() * 1.1,
        color: colors[motes.length % colors.length],
        spin: turns * (0.7 + Math.random() * 0.6),
        ring: motes.length % 3,
      });
    }
  }
  return motes;
}

/** The cloud's tail along its recent path: dust, one look per style. */
export function drawTail(
  context: Context,
  trail: Point[],
  time: number,
  palette: Palette,
  style: SwirlStyle,
  alpha: number,
) {
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (let i = 1; i < trail.length; i += 1) {
    const share = i / (trail.length - 1);
    const a = trail[i - 1];
    const b = trail[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;

    if (style === 'orbit') {
      // Double helix of dust twisting around the path.
      const twist = Math.sin(i * 0.85 - time * 16) * BALL_RADIUS * 0.75 * share;
      for (const side of [1, -1]) {
        context.fillStyle =
          side === 1
            ? `rgba(${palette.glow}, ${share * 0.7 * alpha})`
            : `rgba(255, 255, 255, ${share * 0.7 * alpha})`;
        dot(
          context,
          b.x + nx * twist * side,
          b.y + ny * twist * side,
          0.5 + share,
        );
      }
      continue;
    }

    if (style === 'pulse') {
      // Small dust knots every few points.
      if (i % 3 !== 0) continue;
      for (let k = 0; k < 4; k += 1) {
        const angle = k * 1.7 + i;
        context.fillStyle = `rgba(${palette.glow}, ${share * 0.6 * alpha})`;
        dot(
          context,
          b.x + Math.cos(angle) * 2.5 * share,
          b.y + Math.sin(angle) * 2.5 * share,
          0.4 + 0.7 * share,
        );
      }
      continue;
    }

    if (style === 'nova') {
      // A hairline streak with a few motes along it.
      context.strokeStyle = `rgba(255, 255, 255, ${share * 0.5 * alpha})`;
      context.lineWidth = 0.8 * share + 0.2;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      if (i % 2 === 0) {
        context.fillStyle = `rgba(${palette.glow}, ${share * 0.7 * alpha})`;
        dot(context, b.x, b.y, 0.5 + 0.6 * share);
      }
      continue;
    }

    // Plasma: a soft ribbon of dust spread across the path.
    for (let k = -1; k <= 1; k += 1) {
      const spread = k * BALL_RADIUS * 0.45 * share * Math.sin(i * 1.3 + k);
      context.fillStyle =
        k === 0
          ? `rgba(255, 255, 255, ${share * 0.6 * alpha})`
          : `rgba(${palette.glow}, ${share * 0.55 * alpha})`;
      dot(context, b.x + nx * spread, b.y + ny * spread, 0.4 + 0.8 * share);
    }
  }
  context.restore();
}

/* ---------------------------------------------------------------------- */
/* Soft waves and masks                                                   */
/* ---------------------------------------------------------------------- */

/** A soft glowing band at `radius`: no edge, it fades in and out. */
export function softWave(
  context: Context,
  center: Point,
  radius: number,
  width: number,
  color: string,
  size: { width: number; height: number },
) {
  const inner = Math.max(0, radius - width);
  const outer = radius + width;
  const peak = clamp((radius - inner) / (outer - inner), 0.05, 0.95);
  const gradient = context.createRadialGradient(
    center.x,
    center.y,
    inner,
    center.x,
    center.y,
    outer,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(peak, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size.width, size.height);
}

/** Feathered radial mask: opaque inside `radius - feather`, clear outside. */
export function setSoftMask(
  layer: HTMLElement,
  at: Point,
  radius: number,
  feather: number,
) {
  const solid = Math.max(0, radius - feather);
  const value = `radial-gradient(circle at ${at.x}px ${at.y}px, #000 ${solid}px, rgba(0, 0, 0, 0.55) ${solid + feather * 0.55}px, transparent ${Math.max(radius, solid + 1)}px)`;
  layer.style.setProperty('-webkit-mask-image', value);
  layer.style.setProperty('mask-image', value);
}

/** Drops the mask and leaves the layer fully shown. */
export function showLayer(layer: HTMLElement) {
  layer.style.removeProperty('-webkit-mask-image');
  layer.style.removeProperty('mask-image');
  layer.style.opacity = '1';
}

/* ---------------------------------------------------------------------- */
/* Shared pieces                                                          */
/* ---------------------------------------------------------------------- */

/** A click-through canvas over the whole viewport, gone on abort. */
export const createStage = (zIndex: number, scope: Scope) =>
  createCanvas(
    { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight },
    zIndex,
    scope,
  );

/** A click-through copy of `source`, fixed exactly over it. */
export function makeGhost(source: HTMLElement, zIndex: number) {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  for (const node of [ghost, ...Array.from(ghost.querySelectorAll('[id]'))]) {
    node.removeAttribute('id');
  }
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    boxSizing: 'border-box',
    transform: 'none',
    transition: 'none',
    visibility: 'visible',
    pointerEvents: 'none',
    zIndex: String(zIndex - 1),
  });
  // Next to the source, so it keeps the source's inherited styles.
  source.after(ghost);
  // A transformed ancestor shifts fixed boxes: measure, then correct.
  const placed = ghost.getBoundingClientRect();
  ghost.style.left = `${2 * rect.left - placed.left}px`;
  ghost.style.top = `${2 * rect.top - placed.top}px`;
  return ghost;
}

/**
 * Hides `element` without touching its styles until the returned function
 * runs or the scope aborts.
 */
export function holdHidden(element: HTMLElement, scope: Scope) {
  if (typeof element.animate !== 'function') return () => undefined;
  const animation = element.animate([{ opacity: 0 }, { opacity: 0 }], {
    duration: 1,
    fill: 'forwards',
  });
  const show = () => animation.cancel();
  const off = scope.onAbort(show);
  return () => {
    off();
    show();
  };
}

/** A small scale bump that adds to the element's own transform. */
export function bump(element: HTMLElement, duration: number, scope: Scope) {
  scope.animate(
    element,
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.025)', offset: 0.25 },
      { transform: 'scale(1)' },
    ],
    {
      duration,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      composite: 'add',
    },
  );
}

/** A soft burst of light with a white heart and no edge. */
export function glow(
  context: Context,
  at: Point,
  radius: number,
  alpha: number,
  palette: Palette,
) {
  if (radius <= 0.5 || alpha <= 0) return;
  const gradient = context.createRadialGradient(
    at.x,
    at.y,
    0,
    at.x,
    at.y,
    radius,
  );
  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.9 * alpha})`);
  gradient.addColorStop(0.25, `rgba(${palette.glow}, ${0.5 * alpha})`);
  gradient.addColorStop(1, `rgba(${palette.glow}, 0)`);
  context.fillStyle = gradient;
  dot(context, at.x, at.y, radius);
}

/** Reduced motion: a soft glow over `rect` that fades in and out. */
export async function glowFade(
  rect: RectLike,
  palette: Palette,
  zIndex: number,
  scope: Scope,
) {
  if (rect.width <= 0 || rect.height <= 0) return;
  const pad = 24;
  const box = {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const host = createCanvas(box, zIndex, scope);
  if (host.context) {
    host.clear();
    host.context.globalCompositeOperation = 'lighter';
    glow(
      host.context,
      { x: box.width / 2, y: box.height / 2 },
      Math.max(box.width, box.height) / 2,
      0.45,
      palette,
    );
  }
  await scope.animate(
    host.canvas,
    [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }],
    {
      duration: 360,
      easing: 'ease-in-out',
      fill: 'forwards',
    },
  ).done;
  host.remove();
}

export type Spark = {
  x: number;
  y: number;
  /** Velocity in px per ms. */
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
};

/** Flings `count` sparks out from `at` in every direction. */
export function burstSparks(
  sparks: Spark[],
  at: Point,
  count: number,
  speed: number,
  life: number,
  colors: string[],
) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU + Math.random() * 0.6;
    const velocity = speed * (0.45 + Math.random() * 0.55);
    sparks.push({
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      age: 0,
      life: life * (0.55 + Math.random() * 0.45),
      size: 0.8 + Math.random() * 1.2,
      color: colors[i % colors.length],
    });
  }
}

/** Moves, slows and draws sparks as short streaks; drops the spent ones. */
export function drawSparks(
  context: Context,
  sparks: Spark[],
  delta: number,
  fall = 0.0004,
) {
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.lineCap = 'round';
  const drag = 0.996 ** delta;
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    spark.age += delta;
    if (spark.age >= spark.life) {
      sparks.splice(i, 1);
      continue;
    }
    spark.vx *= drag;
    spark.vy = spark.vy * drag + fall * delta;
    spark.x += spark.vx * delta;
    spark.y += spark.vy * delta;
    const left = 1 - spark.age / spark.life;
    context.globalAlpha = clamp(left, 0, 1);
    context.strokeStyle = spark.color;
    context.lineWidth = spark.size * (0.4 + 0.6 * left);
    context.beginPath();
    context.moveTo(spark.x - spark.vx * 18, spark.y - spark.vy * 18);
    context.lineTo(spark.x, spark.y);
    context.stroke();
  }
  context.restore();
}
