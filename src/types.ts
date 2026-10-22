// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

export type Point = { x: number; y: number };

/** A box in viewport (CSS pixel) coordinates. A `DOMRect` fits. */
export type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Where an effect starts: an element, or a fixed box on screen. */
export type Source = Element | RectLike;

/**
 * Where an effect lands. A function is read again on every frame, so the
 * effect still lands if the target moves or is swapped mid-flight.
 */
export type Target =
  Element | RectLike | (() => Element | RectLike | null | undefined);

/** How the energy looks at every step. */
export type SwirlStyle = 'plasma' | 'nova' | 'orbit' | 'pulse';

/**
 * - `move`: the source itself dissolves and stays hidden afterwards.
 * - `ghost`: a copy of the source dissolves; the source stays.
 * - `none`: the source stays and only sparks a ball from its core.
 */
export type SwirlMode = 'move' | 'ghost' | 'none';

/** `user` follows the OS setting; `always` and `never` force it. */
export type ReducedMotion = 'user' | 'always' | 'never';

/** A progress curve: a function, a CSS keyword or `cubic-bezier(…)`. */
export type Easing =
  | ((t: number) => number)
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | `cubic-bezier(${string})`;

/** Any CSS colors. `glow` defaults to `from`. */
export type Colors = { from?: string; to?: string; glow?: string };

export type SwirlOptions = {
  /** Look of the energy. Default `plasma`. */
  style?: SwirlStyle;
  colors?: Colors;
  /** Total run time in ms; every phase scales to fit. Default about 4 s. */
  duration?: number;
  /** Progress curve of the flight. Default depends on the style. */
  easing?: Easing;
  /** How many times the particles circle as they gather. Default 2. */
  turns?: number;
  /** What happens to the source. Default `move`. */
  mode?: SwirlMode;
  /**
   * The spot inside the source where particles gather, as an element or a
   * selector. Default: `[data-landfall-core]` inside the source, else its
   * center. A core element also spins during the charge.
   */
  core?: Element | string;
  /** Build-up on the source (rumble, or a nudge in `none` mode). Default true. */
  charge?: boolean;
  /** Ripple of light across the target on landing. Default true. */
  ripple?: boolean;
  /**
   * Elements hidden at the start and faded in behind the ripple; `true` means
   * the target itself.
   */
  reveal?: boolean | Element | Element[];
  /** Spacing of the dot grid the particles and ripple use, in px. Default 14. */
  gridSize?: number;
  /** Default `user`. Reduced motion swaps the effect for short fades. */
  reducedMotion?: ReducedMotion;
  /** Stacking order of the overlay. Default 9999. */
  zIndex?: number;
  /** Aborting removes the overlay at once and jumps to the end state. */
  signal?: AbortSignal;
  /** The source has faded out (`move` mode): a good time to remove it. */
  onCollapse?: () => void;
  /** The energy lands, at this viewport point: swap content in here. */
  onImpact?: (point: Point) => void;
  /** Everything has finished (not called after an abort). */
  onComplete?: () => void;
};

export type RippleOptions = Pick<
  SwirlOptions,
  | 'style'
  | 'colors'
  | 'reveal'
  | 'gridSize'
  | 'reducedMotion'
  | 'zIndex'
  | 'signal'
  | 'onComplete'
> & {
  /** Viewport point the waves start from. Default the target's center. */
  origin?: Point;
  /** Run time in ms. Default 1300. */
  duration?: number;
};
