// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import {
  burstSparks,
  createStage,
  dot,
  drawSparks,
  glow,
  holdHidden,
  makeGhost,
  type Context,
  type Spark,
} from './draw';
import type {
  Point,
  PortalMode,
  PortalOptions,
  RectLike,
  Source,
  Target,
} from './types';
import {
  TAU,
  centerOf,
  clamp,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  fitScale,
  isElement,
  isOnScreen,
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
 * The portal: a glowing ring opens over the source, a copy of the source
 * spins and shrinks into it, and the ring closes. A ring opens over the
 * target, a copy of the target spins and grows out of it, and the ring
 * fades. The copies are swapped for the real elements at the end, so both
 * end visible and unchanged (the source stays hidden in `move` mode).
 */

const OPEN_MS = 240;
const SHRINK_MS = 560;
const CLOSE_MS = 260;
const GAP_MS = 120;
const GROW_MS = 640;
const FADE_MS = 340;

/** Every mark in ms from the start, scaled by `scale`. */
function timeline(scale: number) {
  const open = OPEN_MS * scale;
  const shrink = SHRINK_MS * scale;
  const close = CLOSE_MS * scale;
  const gap = GAP_MS * scale;
  const grow = GROW_MS * scale;
  const fade = FADE_MS * scale;
  const shrinkAt = open * 0.45;
  const closeAt = shrinkAt + shrink - close * 0.35;
  const closed = closeAt + close;
  const openAt = closed + gap;
  const growAt = openAt + open * 0.45;
  const fadeAt = growAt + grow - fade * 0.5;
  return {
    open,
    shrink,
    close,
    gap,
    grow,
    fade,
    shrinkAt,
    closeAt,
    closed,
    openAt,
    growAt,
    fadeAt,
    end: fadeAt + fade,
  };
}

const NATURAL_MS = timeline(1).end;

/** A ring that fits inside the element's shorter side. */
const ringRadius = (rect: RectLike) =>
  clamp(Math.min(rect.width, rect.height) * 0.42, 14, 64);

function circle(
  context: Context,
  at: Point,
  radius: number,
  width: number,
  color: string,
  from = 0,
  to = TAU,
) {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.arc(at.x, at.y, radius, from, to);
  context.stroke();
}

/** A glowing ring with light pooled inside and energy running around it. */
function drawRing(
  context: Context,
  at: Point,
  radius: number,
  alpha: number,
  palette: Palette,
  seconds: number,
) {
  if (radius <= 0.5 || alpha <= 0) return;
  const pool = context.createRadialGradient(
    at.x,
    at.y,
    radius * 0.2,
    at.x,
    at.y,
    radius * 1.5,
  );
  pool.addColorStop(0, `rgba(${palette.glow}, 0)`);
  pool.addColorStop(0.55, `rgba(${palette.glow}, ${0.22 * alpha})`);
  pool.addColorStop(0.7, `rgba(${palette.tint}, ${0.12 * alpha})`);
  pool.addColorStop(1, `rgba(${palette.tint}, 0)`);
  context.fillStyle = pool;
  dot(context, at.x, at.y, radius * 1.5);

  circle(
    context,
    at,
    radius,
    Math.max(3, radius * 0.3),
    `rgba(${palette.glow}, ${0.25 * alpha})`,
  );
  circle(context, at, radius, 2.4, `rgba(${palette.tint}, ${0.85 * alpha})`);
  circle(context, at, radius, 1, `rgba(255, 255, 255, ${0.9 * alpha})`);

  context.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const turn = seconds * 4.2 + (i / 3) * TAU;
    circle(
      context,
      at,
      radius * 1.12,
      1.4,
      `rgba(255, 255, 255, ${0.6 * alpha})`,
      turn,
      turn + 0.9,
    );
    const back = -seconds * 3 + (i / 3) * TAU + 0.5;
    circle(
      context,
      at,
      radius * 0.86,
      1.2,
      `rgba(${palette.glow}, ${0.7 * alpha})`,
      back,
      back + 0.7,
    );
  }
  for (let i = 0; i < 12; i += 1) {
    const angle = i * 2.399963 + seconds * (2 + (i % 3) * 0.6);
    const reach = radius * (1 + 0.16 * Math.sin(seconds * 5 + i));
    context.fillStyle =
      i % 2
        ? `rgba(255, 255, 255, ${0.8 * alpha})`
        : `rgba(${palette.tint}, ${0.8 * alpha})`;
    dot(
      context,
      at.x + Math.cos(angle) * reach,
      at.y + Math.sin(angle) * reach,
      0.9 + (i % 3) * 0.35,
    );
  }
}

/**
 * Poses a copy between full size (`depth` 0) and gone into the ring
 * (`depth` 1): smaller, turned, brighter, softer and rounder.
 */
function pose(ghost: HTMLElement, depth: number, turns: number) {
  const inward = Math.max(0, depth);
  ghost.style.transform = `rotate(${turns * 360 * depth}deg) scale(${Math.max(0.001, 1 - depth)})`;
  ghost.style.filter = `brightness(${1 + 1.4 * inward}) blur(${2 * inward}px)`;
  ghost.style.clipPath = `circle(${72 - 40 * inward}% at 50% 50%)`;
}

/** Lays a click-through copy over `element`, removed on abort. */
function copyOf(element: HTMLElement, zIndex: number, scope: Scope) {
  const ghost = makeGhost(element, zIndex);
  ghost.style.transformOrigin = '50% 50%';
  const off = scope.onAbort(() => ghost.remove());
  return {
    ghost,
    drop() {
      off();
      ghost.remove();
    },
  };
}

/**
 * Sends `from` through a portal to `to`: the source spins into a glowing
 * ring that closes, a ring opens over the target, and the target grows out
 * of it. Resolves when everything has finished, or at once on abort.
 *
 * @example
 * await portal(card, slot, { mode: 'ghost' });
 */
export function portal(
  from: Source,
  to: Target,
  options: PortalOptions = {},
): Promise<void> {
  return runEffect(options, (scope) => run(from, to, options, scope));
}

/** Reduced motion: the source fades out, then the target fades in. */
async function reducedPortal(
  from: Source,
  mode: PortalMode,
  read: ReturnType<typeof targetReader>,
  options: PortalOptions,
  scope: Scope,
) {
  const fallback = centerOf(rectOf(from));
  if (isElement(from) && mode === 'move') {
    const hide = () => {
      from.style.visibility = 'hidden';
    };
    const offHide = scope.onAbort(hide);
    const { animation, done } = scope.animate(
      from,
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 200, easing: 'ease-out', fill: 'forwards' },
    );
    await done;
    offHide();
    hide();
    animation?.cancel();
    if (scope.aborted) return;
    options.onCollapse?.();
  }
  const target = read();
  options.onImpact?.(target ? centerOf(target.rect) : fallback);
  if (target?.element) {
    await scope.animate(target.element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 200,
      easing: 'ease-out',
    }).done;
  }
}

async function run(
  from: Source,
  to: Target,
  options: PortalOptions,
  scope: Scope,
) {
  const mode: PortalMode = options.mode === 'ghost' ? 'ghost' : 'move';
  const source = isElement(from) ? from : null;
  const read = targetReader(to);
  const zIndex = options.zIndex ?? 9999;

  if (document.hidden) {
    // A hidden page runs no frames: jump straight to the end state.
    const target = read();
    const point = centerOf(target ? target.rect : rectOf(from));
    if (source && mode === 'move') {
      source.style.visibility = 'hidden';
      options.onCollapse?.();
    }
    options.onImpact?.(point);
    return;
  }

  if (prefersReduced(options.reducedMotion)) {
    await reducedPortal(from, mode, read, options, scope);
    return;
  }

  const stage = createStage(zIndex, scope);
  const context = stage.context;
  if (!context) {
    stage.remove();
    await reducedPortal(from, mode, read, options, scope);
    return;
  }

  const palette = toPalette(options.colors);
  const time = timeline(fitScale(NATURAL_MS, options.duration));
  const turns = options.turns ?? 1;
  const custom = toEasing(options.easing);
  const shrinkEase = custom ?? easeInCubic;
  const growEase = custom ?? easeOutBack;
  const colors = [
    '#ffffff',
    `rgba(${palette.glow}, 1)`,
    `rgba(${palette.tint}, 1)`,
  ];
  const fromRect = rectOf(from);
  const fromCenter = centerOf(fromRect);
  const fromRing = ringRadius(fromRect);

  let first = source ? copyOf(source, zIndex, scope) : null;
  // The copy covers the source exactly, so hiding it now shows no change.
  if (source && mode === 'move') source.style.visibility = 'hidden';

  // Set inside the frame loop, so typed wide on purpose.
  let second = null as ReturnType<typeof copyOf> | null;
  let showTarget = () => undefined as void;
  let placed: RectLike | null = null;
  let toCenter: Point | null = null;
  let toRing = 0;
  let arrived = false;
  let collapsed = false;
  const sparks: Spark[] = [];
  const began = performance.now();
  let last = began;

  await scope.frames((now) => {
    const t = Math.max(0, now - began);
    const seconds = t / 1000;
    const delta = clamp(now - last, 0, 48);
    last = now;
    stage.clear();
    context.globalCompositeOperation = 'lighter';

    // 1. A ring opens over the source; the copy spins into it; it closes.
    if (t < time.closed) {
      const opening = easeOutBack(clamp(t / time.open, 0, 1));
      const closing = easeInCubic(clamp((t - time.closeAt) / time.close, 0, 1));
      drawRing(
        context,
        fromCenter,
        fromRing * opening * (1 - closing),
        1,
        palette,
        seconds,
      );
    }
    if (first) {
      const p = clamp((t - time.shrinkAt) / time.shrink, 0, 1);
      pose(first.ghost, shrinkEase(p), turns);
      first.ghost.style.opacity = String(1 - clamp((p - 0.65) / 0.35, 0, 1));
      if (p >= 1) {
        first.drop();
        first = null;
      }
    }
    const pop = (t - time.closeAt) / (time.close + time.gap);
    if (pop > 0 && pop < 1) {
      glow(
        context,
        fromCenter,
        fromRing * (0.6 + 0.8 * pop),
        Math.sin(pop * Math.PI) * 0.8,
        palette,
      );
    }
    if (!collapsed && t >= time.closed) {
      collapsed = true;
      burstSparks(sparks, fromCenter, 10, 0.16, time.fade * 2, colors);
      if (source && mode === 'move') options.onCollapse?.();
    }

    // 2. A ring opens over the target, and the target grows out of it.
    if (t >= time.openAt && !arrived) {
      arrived = true;
      const target = read();
      // Called before the copy is made, so content swapped in shows in it.
      options.onImpact?.(target ? centerOf(target.rect) : fromCenter);
      if (target && isOnScreen(target.rect)) {
        toCenter = centerOf(target.rect);
        toRing = ringRadius(target.rect);
        if (target.element) {
          second = copyOf(target.element, zIndex, scope);
          showTarget = holdHidden(target.element, scope);
          placed = target.rect;
          pose(second.ghost, 1, turns);
          second.ghost.style.opacity = '0';
        }
      }
    }
    if (toCenter) {
      const rect = read()?.rect;
      if (rect) {
        toCenter = centerOf(rect);
        // Follow the target if the layout shifts.
        if (second && placed) {
          const style = second.ghost.style;
          style.left = `${parseFloat(style.left) + rect.left - placed.left}px`;
          style.top = `${parseFloat(style.top) + rect.top - placed.top}px`;
          placed = rect;
        }
      }
      const open = (t - time.openAt) / time.open;
      const fading = clamp((t - time.fadeAt) / time.fade, 0, 1);
      drawRing(
        context,
        toCenter,
        toRing *
          easeOutBack(clamp(open, 0, 1)) *
          (1 + 0.35 * easeOutCubic(fading)),
        1 - fading,
        palette,
        seconds,
      );
      if (open < 1) {
        glow(
          context,
          toCenter,
          toRing * (0.5 + open),
          Math.sin(open * Math.PI) * 0.9,
          palette,
        );
      }
      if (second) {
        const p = clamp((t - time.growAt) / time.grow, 0, 1);
        pose(second.ghost, 1 - growEase(p), turns);
        second.ghost.style.opacity = String(clamp(p / 0.2, 0, 1));
      }
    }

    drawSparks(context, sparks, delta);
    const busy = t < time.openAt || (toCenter !== null && t < time.end);
    return busy || sparks.length > 0;
  });

  first?.drop();
  second?.drop();
  showTarget();
  stage.remove();
}
