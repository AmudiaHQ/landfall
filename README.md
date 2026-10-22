# Landfall

A→B UI effects with zero dependencies, by [Amudia](https://amudia.com).

The first effect, **swirl**, hands one element off to another: the source charges up and dissolves into particles that swirl into a ball of light. The ball flies into the target and lands with a ripple, and hidden content fades in behind the wave.

Contents: [Install](#install) · [Usage](#usage) · [Options](#options) · [React](#react) · [Ripple only](#ripple-only) · [Accessibility](#accessibility) · [Browser support](#browser-support) · [Development](#development) · [License and credit](#license-and-credit)

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

```ts
import { swirl } from '@amudiahq/landfall';

const card = document.querySelector('.queue-card')!;
const tile = document.querySelector('.gallery-tile')!;

await swirl(card, tile, {
  style: 'plasma',
  reveal: tile.querySelector('img')!, // fades in behind the ripple
  onCollapse: () => card.remove(),
});
```

- `from`: an element, or a box on screen (`{ left, top, width, height }` in viewport pixels, such as a `DOMRect`).
- `to`: an element, a box, or a function that returns either. A function is read on every frame, so the energy still lands if the target moves or is replaced mid-flight.
- Put `data-landfall-core` on a child of the source to make the particles gather there. That child also spins during the charge.
- `swirl()` returns a Promise that resolves when everything has finished, or at once on abort.

## Options

| Option          | Default                | What it does                                                                                                                                                                         |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `style`         | `'plasma'`             | `plasma`: galaxy swirl, soft arc. `nova`: implosion, straight dash, rays. `orbit`: three orbits, helix tail. `pulse`: shells, three hops.                                            |
| `colors`        | blue                   | `{ from, to, glow }`, any CSS colors. `glow` defaults to `from`.                                                                                                                     |
| `duration`      | about 4000             | Total run time in ms. Every phase scales to fit.                                                                                                                                     |
| `easing`        | per style              | Flight progress: a function, `'linear'`, `'ease'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'` or `'cubic-bezier(…)'`.                                                                |
| `turns`         | `2`                    | How many times the particles circle as they gather.                                                                                                                                  |
| `mode`          | `'move'`               | `move`: the source dissolves and stays hidden (`visibility: hidden`). `ghost`: a copy dissolves and the source stays. `none`: the source stays and only sparks a ball from its core. |
| `core`          | `[data-landfall-core]` | Element or selector inside the source where the particles gather.                                                                                                                    |
| `charge`        | `true`                 | A rumble before the swirl (a nudge in `none` mode).                                                                                                                                  |
| `ripple`        | `true`                 | A ripple of light over the target on landing.                                                                                                                                        |
| `reveal`        | none                   | Element(s) hidden at the start and faded in behind the ripple. `true` means the target itself.                                                                                       |
| `gridSize`      | `14`                   | Spacing in px of the dot grid that the particles and the ripple use.                                                                                                                 |
| `reducedMotion` | `'user'`               | `user` follows the OS setting. `always` and `never` force it.                                                                                                                        |
| `zIndex`        | `9999`                 | Stacking order of the overlay.                                                                                                                                                       |
| `signal`        | none                   | An `AbortSignal`. Aborting removes the overlay at once and jumps to the end state.                                                                                                   |
| `onCollapse`    | none                   | The source has faded out (`move` mode): a good time to remove it.                                                                                                                    |
| `onImpact`      | none                   | `(point) => void`, called when the energy lands.                                                                                                                                     |
| `onComplete`    | none                   | Everything has finished. It is not called after an abort.                                                                                                                            |

If the target is off screen, the energy dives toward it and fades out. In that case there is no ripple, and the reveal shows at once. In a hidden browser tab, which runs no animation frames, the effect jumps straight to its end state.

## React

```tsx
import { useRef } from 'react';
import { useSwirl } from '@amudiahq/landfall/react';

export function Hand() {
  const card = useRef<HTMLDivElement>(null);
  const tile = useRef<HTMLDivElement>(null);
  const launch = useSwirl();
  return (
    <>
      <div ref={card}>Ready</div>
      <div ref={tile} />
      <button onClick={() => launch(card, tile, { style: 'orbit' })}>
        Send
      </button>
    </>
  );
}
```

- `useSwirl()` accepts refs or elements.
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

- By default the effect follows `prefers-reduced-motion`: it swaps the motion for short fades.
- Overlays are `aria-hidden` and click-through, and the ghost copy is `inert`.
- Importing the package has no side effects. On the server, `swirl()` resolves at once.

## Browser support

- It works in current Chrome, Edge, Firefox and Safari.
- It needs the Web Animations API, Canvas 2D and CSS masks (the masks are only for `reveal`).
- During the charge, existing transforms are kept through `composite: 'add'`. Older browsers replace them for a moment instead.

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
