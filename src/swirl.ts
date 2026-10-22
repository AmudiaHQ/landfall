// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import {
  BALL_RADIUS,
  createCanvas,
  dot,
  drawBall,
  drawTail,
  sampleMotes,
  showLayer,
} from './draw';
import {
  RIPPLE_MS,
  fadeIn,
  hideLayers,
  playRipple,
  revealLayers,
} from './ripple';
import type {
  Point,
  RectLike,
  Source,
  SwirlMode,
  SwirlOptions,
  SwirlStyle,
  Target,
} from './types';
import {
  TAU,
  centerOf,
  clamp,
  createScope,
  easeInCubic,
  easeInOutQuad,
  easeInQuart,
  easeOutBack,
  easeOutCubic,
  isElement,
  isOnScreen,
  landingPoint,
  prefersReduced,
  rectOf,
  targetReader,
  toEasing,
  toPalette,
  toStyle,
  type Palette,
  type Scope,
} from './util';

/*
 * The swirl hand-off: the source charges up (its core spins, it rumbles),
 * then dissolves into particles that swirl into a small energy ball. The
 * ball flies to the target with a tail and lands in a soft flash, and a
 * ripple of light runs across the target while hidden content fades in.
 * Canvases draw the energy; DOM elements only animate transform, opacity
 * and filter.
 */

const SWIRL_MS = 720;
const HOLD_MS = 140;
/** Flight time per style: the nova dash is quick, the pulse hops take longer. */
const FLIGHT_MS: Record<SwirlStyle, number> = {
  plasma: 860,
  nova: 640,
  orbit: 900,
  pulse: 1000,
};
const FORM_MS = 260;
const FLASH_MS = 340;
const SPARK_MS = 420;
const DISSOLVE_MS = 260;
const CORE_LEAD_MS = 450;
const CORE_SPIN_MS = 1150;
const RUMBLE_MS = 560;
const NUDGE_MS = 420;
const NUDGE_SPIN_MS = 700;

type Charge = 'rumble' | 'nudge' | null;

/** Every phase in ms, scaled so the whole run fits `duration`. */
function timeline(
  style: SwirlStyle,
  charge: Charge,
  spinsCore: boolean,
  ripple: boolean,
  duration: number | undefined,
) {
  const lead = charge === 'rumble' && spinsCore ? CORE_LEAD_MS : 0;
  const chargeMs =
    charge === 'nudge' ? NUDGE_MS : charge === 'rumble' ? lead + RUMBLE_MS : 0;
  const natural =
    chargeMs +
    SWIRL_MS +
    HOLD_MS +
    FLIGHT_MS[style] +
    (ripple ? RIPPLE_MS : SPARK_MS);
  const scale =
    duration && duration > 0 ? clamp(duration / natural, 0.2, 5) : 1;
  return {
    scale,
    coreLead: lead * scale,
    coreSpin: CORE_SPIN_MS * scale,
    rumble: RUMBLE_MS * scale,
    nudge: NUDGE_MS * scale,
    nudgeSpin: NUDGE_SPIN_MS * scale,
    dissolve: DISSOLVE_MS * scale,
    swirl: SWIRL_MS * scale,
    hold: HOLD_MS * scale,
    flight: FLIGHT_MS[style] * scale,
    form: FORM_MS * scale,
    flash: FLASH_MS * scale,
    spark: SPARK_MS * scale,
    ripple: RIPPLE_MS * scale,
  };
}

type Timeline = ReturnType<typeof timeline>;

/* ---------------------------------------------------------------------- */
/* Charge and dissolve                                                    */
/* ---------------------------------------------------------------------- */

/** The core spins up, then the source rumbles harder and harder. */
async function chargeUp(
  source: HTMLElement,
  core: HTMLElement | null,
  charge: Exclude<Charge, null>,
  time: Timeline,
  scope: Scope,
) {
  if (charge === 'nudge') {
    // The source stays: a quick spin of the core and a small nudge.
    if (core) {
      scope.animate(
        core,
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(720deg)' }],
        {
          duration: time.nudgeSpin,
          easing: 'cubic-bezier(0.5, 0, 0.2, 1)',
          composite: 'add',
        },
      );
    }
    await scope.animate(
      source,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.02)', offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      {
        duration: time.nudge,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        composite: 'add',
      },
    ).done;
    return;
  }

  if (core) {
    // Five full turns, so the core ends where it started.
    scope.animate(
      core,
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(1800deg)' }],
      {
        duration: time.coreSpin,
        easing: 'cubic-bezier(0.6, 0, 1, 0.4)',
        composite: 'add',
      },
    );
    await scope.wait(time.coreLead);
  }

  const steps = 14;
  const rumble = Array.from({ length: steps + 1 }, (_, index) => {
    if (index === steps) return { transform: 'translate(0, 0) rotate(0deg)' };
    const amplitude = 0.6 + (index / steps) * 2.6;
    const side = index % 2 === 0 ? 1 : -1;
    return {
      transform: `translate(${side * amplitude}px, ${((index % 3) - 1) * amplitude * 0.35}px) rotate(${side * amplitude * 0.18}deg)`,
    };
  });
  await scope.animate(source, rumble, {
    duration: time.rumble,
    easing: 'linear',
    composite: 'add',
  }).done;
}

/** A click-through copy of `source`, fixed exactly over it. */
function makeGhost(source: HTMLElement, zIndex: number) {
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
 * No shrinking box: the source (or its ghost) fades and blurs away, leaving
 * its particles. A moved source stays hidden for good.
 */
function dissolve(
  source: HTMLElement,
  mode: Exclude<SwirlMode, 'none'>,
  time: Timeline,
  zIndex: number,
  scope: Scope,
  onCollapse: (() => void) | undefined,
) {
  const timing: KeyframeAnimationOptions = {
    duration: time.dissolve,
    easing: 'cubic-bezier(0.4, 0, 1, 1)',
    fill: 'forwards',
  };

  if (mode === 'ghost') {
    const ghost = makeGhost(source, zIndex);
    const offGhost = scope.onAbort(() => ghost.remove());
    void scope
      .animate(
        ghost,
        [
          { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
          { opacity: 0, filter: 'blur(6px)', transform: 'scale(1.06)' },
        ],
        timing,
      )
      .done.then(() => {
        offGhost();
        ghost.remove();
      });
    return;
  }

  const hide = () => {
    source.style.visibility = 'hidden';
  };
  const offHide = scope.onAbort(hide);
  const { animation, done } = scope.animate(
    source,
    [
      { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
      { opacity: 0, filter: 'blur(6px)', transform: 'scale(0.97)' },
    ],
    timing,
  );
  void done.then(() => {
    if (scope.aborted) return;
    offHide();
    // Hidden for good, so a later exit motion cannot flash it back.
    hide();
    animation?.cancel();
    onCollapse?.();
  });
}

/* ---------------------------------------------------------------------- */
/* Swirl, flight and impact flash                                         */
/* ---------------------------------------------------------------------- */

type Spark = { x: number; y: number; vx: number; vy: number; age: number };

type Flight = {
  from: Point;
  region: RectLike;
  style: SwirlStyle;
  palette: Palette;
  time: Timeline;
  turns: number;
  easing: ((t: number) => number) | null;
  gridSize: number;
  read: ReturnType<typeof targetReader>;
  zIndex: number;
  scope: Scope;
  /** `landed` is false when the target was off screen or gone. */
  onImpact: (point: Point, landed: boolean) => void;
};

/** Where the energy heads when it cannot land: just past the screen edge. */
function offScreenAim(rect: RectLike): Point {
  const center = centerOf(rect);
  return {
    x: clamp(center.x, -40, window.innerWidth + 40),
    y: clamp(center.y, -40, window.innerHeight + 40),
  };
}

/**
 * Gathers the particles of `region` into a ball at `from`, then flies it to
 * the target, re-read every frame so a target swapped mid-flight still
 * lands. An off-screen target gets a dive toward it that fades out.
 * Resolves after the landing flash.
 */
function energize(flight: Flight): Promise<void> {
  const { from, style, palette, time, scope } = flight;
  const stage = createCanvas(
    { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight },
    flight.zIndex,
    scope,
  );
  const context = stage.context;
  const first = flight.read();
  if (!context) {
    stage.remove();
    flight.onImpact(first ? landingPoint(first.rect) : from, false);
    return Promise.resolve();
  }

  const motes = sampleMotes(
    flight.region,
    from,
    palette,
    style,
    flight.gridSize,
    flight.turns,
  );
  const spinRate = flight.turns / 2;
  const trail: Point[] = [];
  const sparks: Spark[] = [];
  const flightStart = time.swirl + time.hold;
  let end: Point = first
    ? landingPoint(first.rect)
    : { x: from.x, y: window.innerHeight + 40 };
  let visible: boolean | null = null;
  let impactAt: number | null = null;
  let landing: Point | null = null;
  const began = performance.now();
  let last = began;

  const polar = (radius: number, angle: number) => ({
    x: from.x + Math.cos(angle) * radius,
    y: from.y + Math.sin(angle) * radius,
  });

  return scope
    .frames((now) => {
      const elapsed = Math.max(0, now - began);
      const seconds = elapsed / 1000;
      const delta = clamp(now - last, 0, 48);
      last = now;
      stage.clear();

      // 1. The particles gather into the core, per style.
      const swirl = elapsed / time.swirl;
      if (swirl < 1.05) {
        context.globalCompositeOperation = 'lighter';
        context.lineCap = 'round';
        for (const mote of motes) {
          const p = clamp((swirl - mote.delay) / mote.span, 0, 1);
          if (p <= 0 || p >= 1) continue;
          context.globalAlpha =
            p < 0.12 ? p / 0.12 : p > 0.88 ? (1 - p) / 0.12 : 1;
          context.fillStyle = mote.color;
          context.strokeStyle = mote.color;
          const size = mote.size * (1 - 0.45 * p);

          if (style === 'nova') {
            // Straight in, accelerating, each mote drawn as a speed streak.
            const head = polar(mote.radius * (1 - easeInQuart(p)), mote.angle);
            const tail = polar(
              mote.radius * (1 - easeInQuart(Math.max(0, p - 0.1))),
              mote.angle,
            );
            context.lineWidth = size;
            context.beginPath();
            context.moveTo(tail.x, tail.y);
            context.lineTo(head.x, head.y);
            context.stroke();
          } else if (style === 'orbit') {
            // Join one of three tilted orbits, spin, then collapse inward.
            const gather = easeOutCubic(clamp(p / 0.55, 0, 1));
            const collapse = easeInCubic(clamp((p - 0.55) / 0.45, 0, 1));
            const orbit = (14 + mote.ring * 10) * (1 - collapse);
            const turn =
              mote.angle + seconds * (6.5 - mote.ring * 1.5) * spinRate;
            const ex = Math.cos(turn) * orbit;
            const ey = Math.sin(turn) * orbit * 0.5;
            const tilt = mote.ring * 1.05 - 0.5;
            const target = {
              x: from.x + ex * Math.cos(tilt) - ey * Math.sin(tilt),
              y: from.y + ex * Math.sin(tilt) + ey * Math.cos(tilt),
            };
            const start = polar(mote.radius, mote.angle);
            dot(
              context,
              start.x + (target.x - start.x) * gather,
              start.y + (target.y - start.y) * gather,
              size,
            );
          } else if (style === 'pulse') {
            // Pulled in shell by shell with a slight sway.
            const at = polar(
              mote.radius * (1 - easeInOutQuad(p)),
              mote.angle + Math.sin(p * Math.PI) * 0.35 * spinRate,
            );
            dot(context, at.x, at.y, size * (1 + 0.35 * Math.sin(p * 9)));
          } else {
            // Galaxy swirl: several turns, faster near the core.
            const pull = easeInCubic(p);
            const at = polar(
              mote.radius * (1 - pull),
              mote.angle + mote.spin * TAU * pull,
            );
            dot(context, at.x, at.y, size);
          }
        }
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
      }

      // 2. The ball forms, flashes once, holds, then flies.
      const grow = clamp(
        (elapsed - time.swirl * 0.3) / (time.swirl * 0.7),
        0,
        1,
      );
      let radius = BALL_RADIUS * easeOutBack(grow);
      let at = from;
      let alpha = 1;

      const formed = (elapsed - time.swirl) / time.form;
      if (formed > 0 && formed < 1) {
        // A soft glow pulse as the ball forms.
        const pulse = BALL_RADIUS * (1.4 + formed * 3);
        const glow = context.createRadialGradient(
          from.x,
          from.y,
          BALL_RADIUS * 0.6,
          from.x,
          from.y,
          pulse,
        );
        glow.addColorStop(0, `rgba(${palette.glow}, 0)`);
        glow.addColorStop(0.6, `rgba(${palette.glow}, ${(1 - formed) * 0.4})`);
        glow.addColorStop(1, `rgba(${palette.glow}, 0)`);
        context.fillStyle = glow;
        dot(context, from.x, from.y, pulse);
      }
      if (elapsed >= time.swirl && elapsed < flightStart) {
        radius *= 1 + 0.08 * Math.sin(seconds * 40);
      }

      if (elapsed >= flightStart && impactAt === null) {
        const t = clamp((elapsed - flightStart) / time.flight, 0, 1);
        const target = flight.read();
        if (visible === null) visible = !!target && isOnScreen(target.rect);
        if (target) {
          end = visible ? landingPoint(target.rect) : offScreenAim(target.rect);
        }
        const dx = end.x - from.x;
        const dy = end.y - from.y;
        if (style === 'nova') {
          // A launched dash: straight line, accelerating.
          const u = flight.easing ? flight.easing(t) : easeInCubic(t);
          at = { x: from.x + dx * u, y: from.y + dy * u };
        } else if (style === 'pulse') {
          // Three hops along the line, lower each time.
          const u = flight.easing ? flight.easing(t) : easeInOutQuad(t);
          const hop =
            Math.abs(Math.sin(u * Math.PI * 3)) *
            Math.min(46, Math.hypot(dx, dy) * 0.14) *
            (1 - u * 0.6);
          at = { x: from.x + dx * u, y: from.y + dy * u - hop };
        } else {
          // A soft arc that rises a little before it falls.
          const lift = Math.min(70, Math.abs(dy) * 0.22);
          const u = flight.easing ? flight.easing(t) : easeInOutQuad(t);
          at = {
            x: from.x + 2 * (1 - u) * u * dx * 0.4 + u * u * dx,
            y: from.y + 2 * (1 - u) * u * (dy * 0.2 - lift * 2) + u * u * dy,
          };
        }
        radius *= 1 - 0.15 * t;
        if (!visible) alpha = 1 - clamp((t - 0.75) / 0.25, 0, 1);

        trail.push(at);
        if (trail.length > (style === 'nova' ? 32 : 22)) trail.shift();
        for (let i = 0; i < 3; i += 1) {
          sparks.push({
            x: at.x + (Math.random() - 0.5) * BALL_RADIUS,
            y: at.y + (Math.random() - 0.5) * BALL_RADIUS,
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.5) * 0.08 - 0.015,
            age: 0,
          });
        }

        if (t >= 1) {
          if (!visible) {
            flight.onImpact(end, false);
            return false;
          }
          impactAt = now;
          landing = at;
          flight.onImpact(at, true);
        }
      }

      drawTail(context, trail, seconds, palette, style, alpha);
      context.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.age += delta;
        spark.x += spark.vx * delta;
        spark.y += spark.vy * delta;
        if (spark.age > time.spark) {
          sparks.splice(i, 1);
          continue;
        }
        const life = 1 - spark.age / time.spark;
        context.fillStyle = `rgba(255, 255, 255, ${life * 0.75})`;
        dot(context, spark.x, spark.y, 0.8 * life + 0.25);
      }
      context.globalCompositeOperation = 'source-over';

      if (impactAt === null) {
        drawBall(context, at, radius, seconds, palette, style, alpha);
        return true;
      }
      if (!landing) return false;
      // The ball sinks into the target in a soft burst of light.
      const flash = clamp((now - impactAt) / time.flash, 0, 1);
      drawBall(
        context,
        landing,
        BALL_RADIUS * (1 - flash),
        seconds,
        palette,
        style,
        1 - flash,
      );
      const burst = BALL_RADIUS * (1.5 + flash * 4.5);
      const glow = context.createRadialGradient(
        landing.x,
        landing.y,
        0,
        landing.x,
        landing.y,
        burst,
      );
      glow.addColorStop(0, `rgba(255, 255, 255, ${(1 - flash) * 0.75})`);
      glow.addColorStop(0.35, `rgba(${palette.glow}, ${(1 - flash) * 0.45})`);
      glow.addColorStop(1, `rgba(${palette.glow}, 0)`);
      context.fillStyle = glow;
      dot(context, landing.x, landing.y, burst);
      trail.shift();
      return flash < 1 || sparks.length > 0;
    })
    .then(() => stage.remove());
}

/* ---------------------------------------------------------------------- */
/* Public API                                                             */
/* ---------------------------------------------------------------------- */

function findCore(source: HTMLElement | null, core: SwirlOptions['core']) {
  if (isElement(core)) return core;
  if (!source) return null;
  return source.querySelector<HTMLElement>(
    typeof core === 'string' ? core : '[data-landfall-core]',
  );
}

/** Reduced motion: the source fades out, then the reveal fades in. */
async function reducedSwirl(
  from: Source,
  mode: SwirlMode,
  read: ReturnType<typeof targetReader>,
  layers: HTMLElement[],
  options: SwirlOptions,
  scope: Scope,
) {
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
  options.onImpact?.(centerOf(target ? target.rect : rectOf(from)));
  await fadeIn(layers, scope);
}

/**
 * Swirls `from` into `to`: the source charges up and dissolves into a
 * swirling ball of energy that flies into the target and lands with a
 * ripple. Resolves when everything has finished, or at once on abort.
 *
 * @example
 * await swirl(queueCard, galleryTile, { style: 'nova', reveal: tileImage });
 */
export async function swirl(
  from: Source,
  to: Target,
  options: SwirlOptions = {},
): Promise<void> {
  if (typeof window === 'undefined') return;
  const scope = createScope(options.signal);
  if (scope.aborted) return;
  try {
    await run(from, to, options, scope);
  } finally {
    scope.dispose();
  }
  if (!scope.aborted) options.onComplete?.();
}

async function run(
  from: Source,
  to: Target,
  options: SwirlOptions,
  scope: Scope,
) {
  const style = toStyle(options.style);
  const mode: SwirlMode =
    options.mode === 'ghost' || options.mode === 'none' ? options.mode : 'move';
  const zIndex = options.zIndex ?? 9999;
  const read = targetReader(to);
  const source = isElement(from) ? from : null;
  const layers = revealLayers(options.reveal, read()?.element ?? null);
  hideLayers(layers);
  scope.onAbort(() => layers.forEach(showLayer));

  if (document.hidden) {
    // A hidden page runs no frames: jump straight to the end state.
    if (source && mode === 'move') {
      source.style.visibility = 'hidden';
      options.onCollapse?.();
    }
    const target = read();
    options.onImpact?.(centerOf(target ? target.rect : rectOf(from)));
    layers.forEach(showLayer);
    return;
  }

  if (prefersReduced(options.reducedMotion)) {
    await reducedSwirl(from, mode, read, layers, options, scope);
    return;
  }

  const core = findCore(source, options.core);
  const spinsCore = !!core && core !== source;
  const charge: Charge =
    options.charge === false || !source
      ? null
      : mode === 'none'
        ? 'nudge'
        : 'rumble';
  const ripple = options.ripple !== false;
  const palette = toPalette(options.colors);
  const gridSize = options.gridSize ?? 14;
  const time = timeline(style, charge, spinsCore, ripple, options.duration);

  if (source && charge) {
    await chargeUp(source, spinsCore ? core : null, charge, time, scope);
    if (scope.aborted) return;
  }

  const origin = centerOf(rectOf(core ?? from));
  // A dissolving source gives all its particles; `none` draws only the
  // particles around its core, and the source stays.
  const region =
    mode === 'none'
      ? { left: origin.x - 64, top: origin.y - 64, width: 128, height: 128 }
      : rectOf(from);
  if (source && mode !== 'none') {
    dissolve(source, mode, time, zIndex, scope, options.onCollapse);
  }

  let revealing: Promise<void> = Promise.resolve();
  await energize({
    from: origin,
    region,
    style,
    palette,
    time,
    turns: Math.max(0, options.turns ?? 2),
    easing: toEasing(options.easing),
    gridSize,
    read,
    zIndex,
    scope,
    onImpact: (point, landed) => {
      options.onImpact?.(point);
      if (!landed) layers.forEach(showLayer);
      else if (ripple) {
        revealing = playRipple({
          read,
          origin: point,
          palette,
          style,
          duration: time.ripple,
          layers,
          gridSize,
          zIndex,
          scope,
        });
      } else revealing = fadeIn(layers, scope);
    },
  });
  await revealing;
}
