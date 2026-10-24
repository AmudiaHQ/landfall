// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import type {
  Colors,
  Easing,
  Point,
  RectLike,
  ReducedMotion,
  SwirlStyle,
  Target,
} from './types';

export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number) => t * t * t;
export const easeInQuart = (t: number) => t * t * t * t;
export const easeOutQuad = (t: number) => 1 - (1 - t) ** 2;
export const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export const easeOutBack = (t: number) =>
  1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/** A CSS `cubic-bezier()` curve as a function of progress. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (p1: number, p2: number, t: number) =>
    3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  const slope = (p1: number, p2: number, t: number) =>
    3 * (1 - t) * (1 - t) * p1 +
    6 * (1 - t) * t * (p2 - p1) +
    3 * t * t * (1 - p2);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton steps, then bisection if the curve is too flat for them.
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = at(x1, x2, t) - x;
      if (Math.abs(error) < 1e-5) return at(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t = clamp(t - error / d, 0, 1);
    }
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 32; i += 1) {
      const value = at(x1, x2, t);
      if (Math.abs(value - x) < 1e-5) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return at(y1, y2, t);
  };
}

const KEYWORDS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

export function toEasing(easing: Easing | undefined) {
  if (!easing) return null;
  if (typeof easing === 'function') return easing;
  if (easing === 'linear') return (t: number) => t;
  const points =
    KEYWORDS[easing] ??
    easing
      .match(/^cubic-bezier\(([^)]+)\)$/)?.[1]
      ?.split(',')
      .map(Number);
  if (points?.length !== 4 || points.some(Number.isNaN)) return null;
  const [x1, y1, x2, y2] = points;
  return cubicBezier(clamp(x1, 0, 1), y1, clamp(x2, 0, 1), y2);
}

export function isElement(value: unknown): value is HTMLElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Element).getBoundingClientRect === 'function'
  );
}

export function rectOf(value: Element | RectLike): RectLike {
  return 'getBoundingClientRect' in value
    ? value.getBoundingClientRect()
    : value;
}

/** Reads the target fresh each call; `null` once it is gone. */
export function targetReader(target: Target) {
  return (): { rect: RectLike; element: HTMLElement | null } | null => {
    const value = typeof target === 'function' ? target() : target;
    if (!value) return null;
    return {
      rect: rectOf(value),
      element: isElement(value) ? value : null,
    };
  };
}

export const centerOf = (rect: RectLike): Point => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

/** Landing point: the upper part of tall targets, kept inside the viewport. */
export const landingPoint = (rect: RectLike): Point => ({
  x: rect.left + rect.width / 2,
  y: Math.min(
    rect.top + Math.min(rect.height, 280) / 2,
    window.innerHeight - 24,
  ),
});

export const isOnScreen = (rect: RectLike) =>
  rect.width > 0 &&
  rect.top + rect.height > 24 &&
  rect.top < window.innerHeight - 24 &&
  rect.left + rect.width > 0 &&
  rect.left < window.innerWidth;

/** Where an effect heads when it cannot land: just past the screen edge. */
export function offScreenAim(rect: RectLike): Point {
  const center = centerOf(rect);
  return {
    x: clamp(center.x, -40, window.innerWidth + 40),
    y: clamp(center.y, -40, window.innerHeight + 40),
  };
}

/** Where the line from the center of `rect` toward `toward` leaves the box. */
export function edgePoint(rect: RectLike, toward: Point): Point {
  const center = centerOf(rect);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const reach = Math.min(
    dx ? rect.width / 2 / Math.abs(dx) : Infinity,
    dy ? rect.height / 2 / Math.abs(dy) : Infinity,
  );
  // `toward` lies inside the box (or on its center): stay at the center.
  if (!(reach < 1)) return center;
  return { x: center.x + dx * reach, y: center.y + dy * reach };
}

/**
 * A gentle arc from `a` to `b` as a function of progress. `bow` is the
 * bulge as a share of the distance: positive rises (or bends right on a
 * vertical line), negative bends the other way.
 */
export function arcPath(a: Point, b: Point, bow: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  let nx = dy / length;
  let ny = -dx / length;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  // A quadratic curve bulges half as far as its control point.
  const cx = a.x + dx / 2 + nx * bow * length * 2;
  const cy = a.y + dy / 2 + ny * bow * length * 2;
  return (u: number): Point => ({
    x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cx + u * u * b.x,
    y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cy + u * u * b.y,
  });
}

/** How much to scale a natural run time so it fits `duration`. */
export const fitScale = (natural: number, duration: number | undefined) =>
  duration && duration > 0 ? clamp(duration / natural, 0.2, 5) : 1;

export const SWIRL_STYLES: readonly SwirlStyle[] = [
  'plasma',
  'nova',
  'orbit',
  'pulse',
];

export const toStyle = (style: string | undefined): SwirlStyle =>
  SWIRL_STYLES.find((name) => name === style) ?? 'plasma';

export function prefersReduced(setting: ReducedMotion = 'user') {
  if (setting !== 'user') return setting === 'always';
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/* ---------------------------------------------------------------------- */
/* Colors                                                                 */
/* ---------------------------------------------------------------------- */

export type Palette = {
  from: string;
  to: string;
  /** `r, g, b` of the glow, ready for `rgba(…, alpha)`. */
  glow: string;
  /** `r, g, b` of `to`, ready for `rgba(…, alpha)`. */
  tint: string;
};

const DEFAULT_COLORS = { from: '#1f7fe6', to: '#22c4ec' };
let probe: CanvasRenderingContext2D | null | undefined;

/** Any CSS color as `r, g, b`, or `null` if the browser cannot read it. */
function rgbOf(color: string): string | null {
  if (typeof CSS !== 'undefined' && !CSS.supports('color', color)) return null;
  if (probe === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return a === 0 ? null : `${r}, ${g}, ${b}`;
}

export function toPalette(colors: Colors = {}): Palette {
  const from = colors.from ?? DEFAULT_COLORS.from;
  const to = colors.to ?? DEFAULT_COLORS.to;
  return {
    from,
    to,
    glow: rgbOf(colors.glow ?? from) ?? rgbOf(from) ?? '31, 127, 230',
    tint: rgbOf(to) ?? '34, 196, 236',
  };
}

/* ---------------------------------------------------------------------- */
/* Abortable timing                                                       */
/* ---------------------------------------------------------------------- */

export type Scope = ReturnType<typeof createScope>;

/**
 * Timers, frames and animations that all stop when `signal` aborts. Each
 * helper resolves early on abort, so `await` chains unwind cleanly.
 */
export function createScope(signal?: AbortSignal) {
  let aborted = signal?.aborted ?? false;
  const handlers = new Set<() => void>();
  const abort = () => {
    if (aborted) return;
    aborted = true;
    for (const handler of Array.from(handlers)) handler();
    handlers.clear();
  };
  signal?.addEventListener('abort', abort, { once: true });

  /** Runs `handler` on abort; returns a function that unregisters it. */
  const onAbort = (handler: () => void) => {
    if (aborted) {
      handler();
      return () => undefined;
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  };

  return {
    get aborted() {
      return aborted;
    },
    onAbort,
    wait(ms: number) {
      return new Promise<void>((resolve) => {
        if (aborted) return resolve();
        const timer = window.setTimeout(() => {
          off();
          resolve();
        }, ms);
        const off = onAbort(() => {
          window.clearTimeout(timer);
          resolve();
        });
      });
    },
    /** Calls `step` every frame until it returns false. */
    frames(step: (now: number) => boolean) {
      return new Promise<void>((resolve) => {
        if (aborted) return resolve();
        let id = 0;
        const tick = (now: number) => {
          if (step(now)) {
            id = requestAnimationFrame(tick);
            return;
          }
          off();
          resolve();
        };
        const off = onAbort(() => {
          cancelAnimationFrame(id);
          resolve();
        });
        id = requestAnimationFrame(tick);
      });
    },
    /** A Web Animation that is cancelled on abort; resolves when it ends. */
    animate(
      element: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      if (aborted || typeof element.animate !== 'function') {
        return { animation: null, done: Promise.resolve() };
      }
      const animation = element.animate(keyframes, options);
      const off = onAbort(() => animation.cancel());
      const done = animation.finished.then(
        () => off(),
        () => off(),
      );
      return { animation, done };
    },
    dispose() {
      signal?.removeEventListener('abort', abort);
      handlers.clear();
    },
  };
}

/**
 * Runs an effect in its own abort scope: nothing on the server, nothing if
 * already aborted, and `onComplete` only when it was not aborted.
 */
export async function runEffect(
  options: { signal?: AbortSignal; onComplete?: () => void },
  body: (scope: Scope) => Promise<void>,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const scope = createScope(options.signal);
  if (scope.aborted) return;
  try {
    await body(scope);
  } finally {
    scope.dispose();
  }
  if (!scope.aborted) options.onComplete?.();
}
