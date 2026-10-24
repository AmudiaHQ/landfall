# Landfall

A→B UI effects with zero dependencies, by [Amudia](https://amudia.com).

Each effect hands one element off to another:

- **swirl**: the source charges up and dissolves into particles that swirl into a ball of light. The ball flies into the target and lands with a ripple, and hidden content fades in behind the wave.
- **comet**: a bright head with a long, tapered, glowing tail arcs from the source to the target and lands in a small burst of sparks. The source stays.
- **beam**: a thin beam of light draws from the source to the target. A pulse of light travels along it, the target flashes, and the beam fades. Good for "connect" or "send" moments.
- **portal**: the source spins and shrinks into a glowing ring that closes. A ring opens over the target, and the target grows out of it.

Contents: [Install](#install) · [Usage](#usage) · [Shared options](#shared-options) · [Swirl](#swirl) · [Comet](#comet) · [Beam](#beam) · [Portal](#portal) · [React](#react) · [Ripple only](#ripple-only) · [Accessibility](#accessibility) · [Browser support](#browser-support) · [Development](#development) · [License and credit](#license-and-credit)

## Install

```bash
npm install @amudiahq/landfall
# or
pnpm add @amudiahq/landfall
yarn add @amudiahq/landfall
bun add @amudiahq/landfall
```

Without a bundler, import the minified ES module from a CDN:

```html
<script type="module">
  import { swirl } from 'https://cdn.jsdelivr.net/npm/@amudiahq/landfall@0.1/dist/landfall.min.js';
</script>
```

## Usage

Every effect has the same shape: `effect(from, to, options) → Promise<void>`.

```ts
import { beam, comet, portal, swirl } from '@amudiahq/landfall';

await swirl(card, tile, { reveal: tile.querySelector('img')! });
await comet(addButton, cartIcon, { arc: 0.3 });
await beam(avatar, inbox, { pulses: 2 });
await portal(card, slot, { mode: 'ghost' });
```

- `from`: an element, or a box on screen (`{ left, top, width, height }` in viewport pixels, such as a `DOMRect`).
- `to`: an element, a box, or a function that returns either. A function is read on every frame, so the effect still lands if the target moves or is replaced mid-flight.
- The Promise resolves when everything has finished, or at once on abort.
- If the target is off screen, swirl and comet dive toward it and fade out, beam points at the screen edge, and portal skips the target's ring.
- In a hidden browser tab, which runs no animation frames, every effect jumps straight to its end state.

## Shared options

Every effect takes these.

| Option          | Default    | What it does                                                                                                           |
| --------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `colors`        | blue       | `{ from, to, glow }`, any CSS colors. `glow` defaults to `from`.                                                       |
| `duration`      | per effect | Total run time in ms. Every phase scales to fit. About 4000 for swirl, 1560 for comet, 1300 for beam, 1900 for portal. |
| `easing`        | per effect | The main motion: a function, `'linear'`, `'ease'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'` or `'cubic-bezier(…)'`.  |
| `reducedMotion` | `'user'`   | `user` follows the OS setting. `always` and `never` force it.                                                          |
| `zIndex`        | `9999`     | Stacking order of the overlay.                                                                                         |
| `signal`        | none       | An `AbortSignal`. Aborting removes the overlay at once and jumps to the end state.                                     |
| `onImpact`      | none       | `(point) => void`, called when the effect reaches the target, with that viewport point.                                |
| `onComplete`    | none       | Everything has finished. It is not called after an abort.                                                              |

## Swirl

```ts
import { swirl } from '@amudiahq/landfall';

await swirl(card, tile, {
  style: 'plasma',
  reveal: tile.querySelector('img')!, // fades in behind the ripple
  onCollapse: () => card.remove(),
});
```

Put `data-landfall-core` on a child of the source to make the particles gather there. That child also spins during the charge. `easing` sets the flight's progress.

| Option       | Default                | What it does                                                                                                                                                                         |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `style`      | `'plasma'`             | `plasma`: galaxy swirl, soft arc. `nova`: implosion, straight dash, rays. `orbit`: three orbits, helix tail. `pulse`: shells, three hops.                                            |
| `turns`      | `2`                    | How many times the particles circle as they gather.                                                                                                                                  |
| `mode`       | `'move'`               | `move`: the source dissolves and stays hidden (`visibility: hidden`). `ghost`: a copy dissolves and the source stays. `none`: the source stays and only sparks a ball from its core. |
| `core`       | `[data-landfall-core]` | Element or selector inside the source where the particles gather.                                                                                                                    |
| `charge`     | `true`                 | A rumble before the swirl (a nudge in `none` mode).                                                                                                                                  |
| `ripple`     | `true`                 | A ripple of light over the target on landing.                                                                                                                                        |
| `reveal`     | none                   | Element(s) hidden at the start and faded in behind the ripple. `true` means the target itself.                                                                                       |
| `gridSize`   | `14`                   | Spacing in px of the dot grid that the particles and the ripple use.                                                                                                                 |
| `onCollapse` | none                   | The source has faded out (`move` mode): a good time to remove it.                                                                                                                    |

## Comet

```ts
import { comet } from '@amudiahq/landfall';

await comet(addButton, cartIcon, {
  arc: 0.3,
  onImpact: () => cartIcon.classList.add('has-items'),
});
```

The head kindles over the source, which stays as it is. `easing` sets the flight's progress; the default is `ease-in-out`.

| Option   | Default | What it does                                                                                                      |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `arc`    | `0.2`   | How far the path bows, as a share of the distance. Positive arcs upward, negative the other way, `0` is straight. |
| `tail`   | `160`   | Length of the tail in px.                                                                                         |
| `sparks` | `18`    | Sparks in the landing burst. `0` for none.                                                                        |

## Beam

```ts
import { beam } from '@amudiahq/landfall';

await beam(avatar, inbox, { pulses: 2, colors: { from: '#10b981' } });
```

The beam runs from edge to edge, and both ends follow their elements every frame, so it stays attached while the page scrolls. `onImpact` runs when the first pulse arrives. `easing` sets how the beam draws and how pulses travel.

| Option   | Default | What it does                                                   |
| -------- | ------- | -------------------------------------------------------------- |
| `width`  | `2`     | Width of the beam's bright core in px.                         |
| `pulses` | `1`     | Pulses of light that travel along the beam, 1 to 8.            |
| `arc`    | `0`     | How far the beam bows, as a share of the distance.             |
| `flash`  | `true`  | The target lights up inside its own shape as each pulse lands. |

## Portal

```ts
import { portal } from '@amudiahq/landfall';

await portal(card, slot, {
  mode: 'move',
  onCollapse: () => card.remove(),
});
```

Copies of the elements do the motion, so the real ones end visible and unchanged. In `move` mode the source ends hidden (`visibility: hidden`). `onImpact` runs as the target's ring opens, before its copy is made, so content you swap in then grows out of the ring. `easing` sets how the copies shrink and grow; by default they shrink with `ease-in` and grow with a small overshoot.

| Option       | Default  | What it does                                                                                           |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| `mode`       | `'move'` | `move`: the source passes through the ring and stays hidden. `ghost`: a copy passes; the source stays. |
| `turns`      | `1`      | Turns each element spins as it passes through a ring.                                                  |
| `onCollapse` | none     | The source has passed through its ring (`move` mode): a good time to remove it.                        |

## React

```tsx
import { useRef } from 'react';
import { comet, useLandfall } from '@amudiahq/landfall/react';

export function AddToCart() {
  const button = useRef<HTMLButtonElement>(null);
  const cart = useRef<HTMLDivElement>(null);
  const launch = useLandfall(comet);
  return (
    <>
      <div ref={cart}>Cart</div>
      <button ref={button} onClick={() => launch(button, cart, { arc: 0.3 })}>
        Add
      </button>
    </>
  );
}
```

- `useLandfall(effect)` returns a stable launcher for any effect. It accepts refs or elements.
- `useSwirl()` is short for `useLandfall(swirl)`.
- A target ref is read on every frame.
- Effects still running when the component unmounts are aborted.
- React is an optional peer dependency. The core has none.

## Ripple only

```ts
import { ripple } from '@amudiahq/landfall';

await ripple(tile, { reveal: tile.querySelector('img')! });
```

This is useful for content that arrives after the energy has landed.

## Accessibility

- By default every effect follows `prefers-reduced-motion`: it swaps the motion for short fades.
- Overlays are `aria-hidden` and click-through, and copies of elements are `inert`.
- Importing the package has no side effects. On the server, every effect resolves at once.

## Browser support

- It works in current Chrome, Edge, Firefox and Safari.
- It needs the Web Animations API and Canvas 2D. Swirl's `reveal` uses CSS masks, and portal uses CSS `filter` and `clip-path`.
- Short bumps and the swirl's charge keep existing transforms through `composite: 'add'`. Older browsers replace them for a moment instead.

## Development

```bash
bun install
bun run demo    # demo page at http://localhost:3050
bun run check   # format, lint, types
bun run build   # dist/: ESM, types, minified bundle
```

## License and credit

Apache-2.0. Copyright 2026 [Amudia](https://amudia.com).

Keep [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) with every copy or derivative (Apache-2.0, section 4). Built files start with a `/*! … @license */` banner; please keep it too. If Landfall appears in your product, a visible credit such as "Effects by Amudia" linking to https://amudia.com is warmly appreciated.
