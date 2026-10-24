// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import {
  bump,
  burstSparks,
  createStage,
  dot,
  drawSparks,
  glow,
  glowFade,
  type Context,
  type Spark,
} from './draw';
import type { CometOptions, Point, Source, Target } from './types';
import {
  TAU,
  arcPath,
  centerOf,
  clamp,
  easeInOutQuad,
  easeOutBack,
  easeOutCubic,
  fitScale,
  isOnScreen,
  landingPoint,
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
 * The comet: a bright head kindles over the source, arcs to the target with
 * a long tapered tail and lands in a small burst of sparks. The source stays
 * as it is; only a canvas overlay draws.
 */

const IGNITE_MS = 220;
const FLIGHT_MS = 780;
const BURST_MS = 560;
/** Radius of the head in px. */
const HEAD = 4.5;
/** Points along the tail. */
const SAMPLES = 36;

type Path = ReturnType<typeof arcPath>;

/** Rough length of a path in px. */
function lengthOf(path: Path) {
  let total = 0;
  let previous = path(0);
  for (let i = 1; i <= 12; i += 1) {
    const next = path(i / 12);
    total += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return total;
}

/** Tail layers, widest first: halo, colored body, white core. */
const TAIL_LAYERS = [
  {
    width: 3.4,
    stops: (p: Palette, a: number): [number, string][] => [
      [0, `rgba(${p.glow}, 0)`],
      [1, `rgba(${p.glow}, ${0.22 * a})`],
    ],
  },
  {
    width: 1.5,
    stops: (p: Palette, a: number): [number, string][] => [
      [0, `rgba(${p.tint}, 0)`],
      [0.55, `rgba(${p.tint}, ${0.4 * a})`],
      [1, `rgba(${p.glow}, ${0.8 * a})`],
    ],
  },
  {
    width: 0.5,
    stops: (_: Palette, a: number): [number, string][] => [
      [0, 'rgba(255, 255, 255, 0)'],
      [1, `rgba(255, 255, 255, ${0.95 * a})`],
    ],
  },
];

/**
 * The tail between path progress `start` and `end` (the head), tapering
 * from `width` at the head to nothing.
 */
function drawTail(
  context: Context,
  path: Path,
  start: number,
  end: number,
  width: number,
  alpha: number,
  palette: Palette,
) {
  if (end - start <= 0.001 || width <= 0.1 || alpha <= 0) return;
  const points: Point[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    points.push(path(start + ((end - start) * i) / SAMPLES));
  }
  const last = points[0];
  const head = points[SAMPLES];
  for (const layer of TAIL_LAYERS) {
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i <= SAMPLES; i += 1) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(SAMPLES, i + 1)];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const half = width * layer.width * (i / SAMPLES) ** 1.4;
      const nx = (-(b.y - a.y) / length) * half;
      const ny = ((b.x - a.x) / length) * half;
      left.push({ x: points[i].x + nx, y: points[i].y + ny });
      right.push({ x: points[i].x - nx, y: points[i].y - ny });
    }
    const gradient = context.createLinearGradient(
      last.x,
      last.y,
      head.x,
      head.y,
    );
    for (const [offset, color] of layer.stops(palette, alpha)) {
      gradient.addColorStop(offset, color);
    }
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(left[0].x, left[0].y);
    for (const point of left) context.lineTo(point.x, point.y);
    for (let i = right.length - 1; i >= 0; i -= 1) {
      context.lineTo(right[i].x, right[i].y);
    }
    context.closePath();
    context.fill();
  }
}

/** A white-hot head inside a flickering glow. */
function drawHead(
  context: Context,
  at: Point,
  radius: number,
  alpha: number,
  palette: Palette,
  seconds: number,
) {
  if (radius <= 0.2 || alpha <= 0) return;
  glow(
    context,
    at,
    radius * 5.5 * (1 + 0.08 * Math.sin(seconds * 47)),
    0.55 * alpha,
    palette,
  );
  context.globalAlpha = alpha;
  context.fillStyle = `rgba(${palette.glow}, 0.7)`;
  dot(context, at.x, at.y, radius * 1.5);
  context.fillStyle = '#ffffff';
  dot(context, at.x, at.y, radius * 0.85);
  context.globalAlpha = 1;
}

/**
 * Sends a comet from `from` to `to`: a bright head with a long glowing tail
 * arcs over and lands in a small burst of sparks. The source stays.
 * Resolves when everything has finished, or at once on abort.
 *
 * @example
 * await comet(addButton, cartIcon, { arc: 0.3 });
 */
export function comet(
  from: Source,
  to: Target,
  options: CometOptions = {},
): Promise<void> {
  return runEffect(options, (scope) => run(from, to, options, scope));
}

async function run(
  from: Source,
  to: Target,
  options: CometOptions,
  scope: Scope,
) {
  const read = targetReader(to);
  const start = centerOf(rectOf(from));
  const zIndex = options.zIndex ?? 9999;

  if (document.hidden) {
    // A hidden page runs no frames: jump straight to the end state.
    const target = read();
    options.onImpact?.(target ? centerOf(target.rect) : start);
    return;
  }

  const palette = toPalette(options.colors);
  if (prefersReduced(options.reducedMotion)) {
    const target = read();
    options.onImpact?.(target ? centerOf(target.rect) : start);
    if (target) await glowFade(target.rect, palette, zIndex, scope);
    return;
  }

  const scale = fitScale(IGNITE_MS + FLIGHT_MS + BURST_MS, options.duration);
  const ignite = IGNITE_MS * scale;
  const flight = FLIGHT_MS * scale;
  const burst = BURST_MS * scale;
  const ease = toEasing(options.easing) ?? easeInOutQuad;
  const bow = options.arc ?? 0.2;
  const tail = Math.max(0, options.tail ?? 160);
  const sparkCount = Math.max(0, Math.round(options.sparks ?? 18));
  const colors = [
    '#ffffff',
    `rgba(${palette.glow}, 1)`,
    `rgba(${palette.tint}, 1)`,
  ];

  const first = read();
  let end: Point = first
    ? landingPoint(first.rect)
    : { x: start.x, y: window.innerHeight + 40 };
  const stage = createStage(zIndex, scope);
  const context = stage.context;
  if (!context) {
    stage.remove();
    options.onImpact?.(end);
    return;
  }

  let path = arcPath(start, end, bow);
  /** The tail's length as a share of the path. */
  let share = 0;
  let visible: boolean | null = null;
  let impactAt: number | null = null;
  const dust: Spark[] = [];
  const sparks: Spark[] = [];
  const began = performance.now();
  let last = began;

  await scope.frames((now) => {
    const elapsed = Math.max(0, now - began);
    const seconds = elapsed / 1000;
    const delta = clamp(now - last, 0, 48);
    last = now;
    stage.clear();
    context.globalCompositeOperation = 'lighter';

    // 1. The head kindles over the source.
    if (elapsed < ignite) {
      const p = elapsed / ignite;
      glow(
        context,
        start,
        HEAD * 10 * easeOutCubic(p),
        0.5 - p * 0.25,
        palette,
      );
      drawHead(context, start, HEAD * easeOutBack(p), 1, palette, seconds);
      return true;
    }

    // 2. The flight, re-reading the target so a moved target still lands.
    if (impactAt === null) {
      const t = clamp((elapsed - ignite) / flight, 0, 1);
      const target = read();
      if (visible === null) visible = !!target && isOnScreen(target.rect);
      if (target) {
        end = visible ? landingPoint(target.rect) : offScreenAim(target.rect);
      }
      path = arcPath(start, end, bow);
      share = Math.min(1, tail / Math.max(lengthOf(path), 1));
      const u = ease(t);
      const head = path(u);
      // An off-screen target gets a dive toward it that fades out.
      const alpha = visible ? 1 : 1 - clamp((t - 0.75) / 0.25, 0, 1);
      drawTail(context, path, Math.max(0, u - share), u, HEAD, alpha, palette);
      if (alpha > 0.3) {
        for (let i = 0; i < 2; i += 1) {
          dust.push({
            x: head.x + (Math.random() - 0.5) * HEAD,
            y: head.y + (Math.random() - 0.5) * HEAD,
            vx: (Math.random() - 0.5) * 0.04,
            vy: (Math.random() - 0.5) * 0.04,
            age: 0,
            life: 420 * scale,
            size: 0.6 + Math.random() * 0.8,
            color: colors[i + 1],
          });
        }
      }
      drawSparks(context, dust, delta, 0.00003);
      drawHead(context, head, HEAD, alpha, palette, seconds);
      if (t < 1) return true;
      options.onImpact?.(end);
      if (!visible) return false;
      impactAt = now;
      burstSparks(sparks, end, sparkCount, 0.3, burst, colors);
      if (target?.element) bump(target.element, burst, scope);
      return true;
    }

    // 3. The landing: the tail catches up, a flash and a burst of sparks.
    const b = clamp((now - impactAt) / burst, 0, 1);
    const settle = easeOutCubic(clamp(b * 2.5, 0, 1));
    const rest = Math.max(0, 1 - share);
    drawTail(
      context,
      path,
      rest + (1 - rest) * settle,
      1,
      HEAD * (1 - settle * 0.5),
      1 - settle,
      palette,
    );
    glow(
      context,
      end,
      HEAD * (4 + 12 * easeOutCubic(b)),
      (1 - b) ** 2,
      palette,
    );
    context.strokeStyle = `rgba(${palette.glow}, ${0.55 * (1 - b) ** 2})`;
    context.lineWidth = 1.5 * (1 - b) + 0.3;
    context.beginPath();
    context.arc(end.x, end.y, HEAD * (2 + 14 * easeOutCubic(b)), 0, TAU);
    context.stroke();
    drawHead(context, end, HEAD * (1 - settle), 1 - settle, palette, seconds);
    drawSparks(context, dust, delta, 0.00003);
    drawSparks(context, sparks, delta);
    return b < 1 || sparks.length > 0 || dust.length > 0;
  });
  stage.remove();
}
