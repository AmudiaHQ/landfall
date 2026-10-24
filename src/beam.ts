// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import { bump, createStage, dot, glow, glowFade, type Context } from './draw';
import type { BeamOptions, Point, RectLike, Source, Target } from './types';
import {
  arcPath,
  centerOf,
  clamp,
  easeInOutQuad,
  easeOutCubic,
  edgePoint,
  fitScale,
  isOnScreen,
  offScreenAim,
  prefersReduced,
  rectOf,
  runEffect,
  targetReader,
  toEasing,
  toPalette,
  type Palette,
  type Scope,
} from './util';

/*
 * The beam: a thin line of light draws from the edge of the source to the
 * edge of the target. A pulse of light runs along it, the target flashes,
 * and the beam fades. Both ends are re-read every frame, so the beam stays
 * attached while the page scrolls.
 */

const DRAW_MS = 380;
const TRAVEL_MS = 560;
const FLASH_MS = 420;
const FADE_MS = 420;
/** Gap between pulses, as a share of the travel time. */
const STAGGER = 0.4;
const SAMPLES = 32;
const MOTES = 6;

type Path = ReturnType<typeof arcPath>;

function samples(path: Path, start: number, end: number, count: number) {
  return Array.from({ length: count + 1 }, (_, i) =>
    path(start + ((end - start) * i) / count),
  );
}

function stroke(
  context: Context,
  points: Point[],
  width: number,
  style: string | CanvasGradient,
) {
  context.strokeStyle = style;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points) context.lineTo(point.x, point.y);
  context.stroke();
}

/** The beam up to `reach` (path progress): halo, colored body, white core. */
function drawBeam(
  context: Context,
  path: Path,
  reach: number,
  width: number,
  alpha: number,
  palette: Palette,
  seconds: number,
) {
  if (reach <= 0.001 || alpha <= 0) return;
  const a = alpha * (0.9 + 0.1 * Math.sin(seconds * 38));
  const points = samples(path, 0, reach, SAMPLES);
  const start = path(0);
  const end = path(1);
  const body = context.createLinearGradient(start.x, start.y, end.x, end.y);
  body.addColorStop(0, `rgba(${palette.glow}, ${0.7 * a})`);
  body.addColorStop(1, `rgba(${palette.tint}, ${0.7 * a})`);
  stroke(context, points, width * 7, `rgba(${palette.glow}, ${0.12 * a})`);
  stroke(context, points, width * 2.4, body);
  stroke(
    context,
    points,
    Math.max(0.75, width * 0.9),
    `rgba(255, 255, 255, ${0.85 * a})`,
  );

  // Motes drift along the beam toward the target.
  for (let i = 0; i < MOTES; i += 1) {
    const s = ((seconds * 0.9 + i / MOTES) % 1) * reach;
    const at = path(s);
    context.fillStyle = `rgba(255, 255, 255, ${0.55 * a * Math.sin((s / reach) * Math.PI)})`;
    dot(context, at.x, at.y, width * 0.8);
  }

  // A glowing node where the beam leaves the source, and a bright tip.
  glow(context, start, width * 5, 0.6 * a, palette);
  glow(context, path(reach), width * (reach < 1 ? 9 : 5), 0.8 * a, palette);
}

/** A pulse of light at path progress `u`, with a short streak behind it. */
function drawPulse(
  context: Context,
  path: Path,
  u: number,
  width: number,
  palette: Palette,
) {
  const points = samples(path, Math.max(0, u - 0.12), u, 10);
  const tail = points[0];
  const head = points[points.length - 1];
  const streak = context.createLinearGradient(tail.x, tail.y, head.x, head.y);
  streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
  streak.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
  stroke(context, points, width * 3.2, streak);
  glow(context, head, width * 9, 1, palette);
  context.fillStyle = '#ffffff';
  dot(context, head.x, head.y, width * 1.6);
}

function roundedRect(context: Context, rect: RectLike, radius: number) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
  } else context.rect(rect.left, rect.top, rect.width, rect.height);
}

/** The element's corner radius in px, so the flash follows its shape. */
function cornerOf(element: HTMLElement | null, rect: RectLike) {
  if (!element) return 0;
  const value = getComputedStyle(element).borderTopLeftRadius;
  const amount = parseFloat(value) || 0;
  const px = value.endsWith('%')
    ? (Math.min(rect.width, rect.height) * amount) / 100
    : amount;
  return clamp(px, 0, Math.min(rect.width, rect.height) / 2);
}

/** The target lights up from `at` inside its own shape, then dims. */
function drawFlash(
  context: Context,
  rect: RectLike,
  radius: number,
  at: Point,
  f: number,
  palette: Palette,
) {
  const alpha = (1 - f) ** 2;
  context.save();
  roundedRect(context, rect, radius);
  context.clip();
  const reach =
    Math.hypot(rect.width, rect.height) * (0.35 + 0.65 * easeOutCubic(f));
  const light = context.createRadialGradient(at.x, at.y, 0, at.x, at.y, reach);
  light.addColorStop(0, `rgba(255, 255, 255, ${0.28 * alpha})`);
  light.addColorStop(0.35, `rgba(${palette.glow}, ${0.22 * alpha})`);
  light.addColorStop(1, `rgba(${palette.glow}, 0)`);
  context.fillStyle = light;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  context.restore();

  roundedRect(context, rect, radius);
  context.strokeStyle = `rgba(${palette.glow}, ${0.25 * alpha})`;
  context.lineWidth = 6;
  context.stroke();
  context.strokeStyle = `rgba(${palette.tint}, ${0.9 * alpha})`;
  context.lineWidth = 1.5;
  context.stroke();
}

/**
 * Draws a beam of light from `from` to `to`. A pulse travels along it, the
 * target flashes, and the beam fades. Good for "connect" or "send" moments.
 * Resolves when everything has finished, or at once on abort.
 *
 * @example
 * await beam(avatar, inbox, { pulses: 2 });
 */
export function beam(
  from: Source,
  to: Target,
  options: BeamOptions = {},
): Promise<void> {
  return runEffect(options, (scope) => run(from, to, options, scope));
}

async function run(
  from: Source,
  to: Target,
  options: BeamOptions,
  scope: Scope,
) {
  const read = targetReader(to);
  const zIndex = options.zIndex ?? 9999;

  if (document.hidden) {
    // A hidden page runs no frames: jump straight to the end state.
    const target = read();
    options.onImpact?.(centerOf(target ? target.rect : rectOf(from)));
    return;
  }

  const palette = toPalette(options.colors);
  if (prefersReduced(options.reducedMotion)) {
    const target = read();
    options.onImpact?.(centerOf(target ? target.rect : rectOf(from)));
    await Promise.all([
      glowFade(rectOf(from), palette, zIndex, scope),
      target ? glowFade(target.rect, palette, zIndex, scope) : null,
    ]);
    return;
  }

  const pulses = clamp(Math.round(options.pulses ?? 1), 1, 8);
  const width = Math.max(0.5, options.width ?? 2);
  const bow = options.arc ?? 0;
  const flash = options.flash !== false;
  const custom = toEasing(options.easing);
  const drawEase = custom ?? easeOutCubic;
  const travelEase = custom ?? easeInOutQuad;
  const launch = DRAW_MS * 0.85;
  const lastArrival = launch + TRAVEL_MS * (1 + STAGGER * (pulses - 1));
  const scale = fitScale(
    lastArrival + Math.max(FLASH_MS, FADE_MS),
    options.duration,
  );
  const time = {
    draw: DRAW_MS * scale,
    launch: launch * scale,
    travel: TRAVEL_MS * scale,
    gap: TRAVEL_MS * STAGGER * scale,
    flash: FLASH_MS * scale,
    fade: FADE_MS * scale,
    lastArrival: lastArrival * scale,
  };

  const first = read();
  const stage = createStage(zIndex, scope);
  const context = stage.context;
  if (!context) {
    stage.remove();
    options.onImpact?.(centerOf(first ? first.rect : rectOf(from)));
    return;
  }

  let source = rectOf(from);
  let end: Point = first
    ? centerOf(first.rect)
    : { x: centerOf(source).x, y: window.innerHeight + 40 };
  let rect: RectLike | null = null;
  let element: HTMLElement | null = null;
  let visible: boolean | null = null;
  let corner: number | null = null;
  const arrivals: number[] = [];
  const began = performance.now();

  await scope.frames((now) => {
    const elapsed = Math.max(0, now - began);
    const seconds = elapsed / 1000;
    stage.clear();
    context.globalCompositeOperation = 'lighter';
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // Keep the last box if the source leaves the page mid-beam.
    const measured = rectOf(from);
    if (measured.width || measured.height) source = measured;
    const target = read();
    if (visible === null) visible = !!target && isOnScreen(target.rect);
    if (target) {
      rect = target.rect;
      element = target.element;
      end = visible
        ? edgePoint(target.rect, centerOf(source))
        : offScreenAim(target.rect);
    }
    const path = arcPath(
      edgePoint(source, visible && rect ? centerOf(rect) : end),
      end,
      bow,
    );

    const reach = drawEase(clamp(elapsed / time.draw, 0, 1));
    const fade = 1 - clamp((elapsed - time.lastArrival) / time.fade, 0, 1);
    drawBeam(context, path, reach, width, fade, palette, seconds);

    for (let i = 0; i < pulses; i += 1) {
      const p = (elapsed - time.launch - i * time.gap) / time.travel;
      if (p > 0 && p < 1) {
        drawPulse(
          context,
          path,
          Math.min(travelEase(p), reach),
          width,
          palette,
        );
      } else if (p >= 1 && arrivals.length === i) {
        arrivals.push(now);
        if (i === 0) options.onImpact?.(end);
        if (visible && flash && element) bump(element, time.flash * 1.5, scope);
      }
    }

    for (const arrival of arrivals) {
      const f = clamp((now - arrival) / time.flash, 0, 1);
      if (f >= 1) continue;
      glow(context, end, width * (8 + 14 * f), (1 - f) ** 2, palette);
      if (visible && flash && rect) {
        corner ??= cornerOf(element, rect);
        drawFlash(context, rect, corner, end, f, palette);
      }
    }

    return elapsed < time.lastArrival + Math.max(time.fade, time.flash);
  });
  stage.remove();
}
