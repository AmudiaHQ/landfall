// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef } from 'react';

import { swirl } from './swirl';
import type { RectLike, Source, SwirlOptions, Target } from './types';

/** A React ref, as `useRef` returns it. */
export type Ref<T> = { current: T | null };

const isRef = <T>(value: unknown): value is Ref<T> =>
  typeof value === 'object' && value !== null && 'current' in value;

/**
 * Returns a stable `swirl` that also takes refs. A target ref is read on
 * every frame, so the effect lands on whatever the ref points to by then.
 * Effects still running when the component unmounts are aborted.
 *
 * @example
 * const launch = useSwirl();
 * await launch(cardRef, tileRef, { style: 'orbit' });
 */
export function useSwirl() {
  const running = useRef(new Set<AbortController>());

  useEffect(() => {
    const controllers = running.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  return useCallback(
    (
      from: Source | Ref<Element | RectLike>,
      to: Target | Ref<Element | RectLike>,
      options: SwirlOptions = {},
    ): Promise<void> => {
      const source = isRef<Element | RectLike>(from) ? from.current : from;
      const target: Target = isRef<Element | RectLike>(to)
        ? () => to.current
        : to;
      if (!source) return Promise.resolve();

      const controller = new AbortController();
      const outer = options.signal;
      if (outer?.aborted) controller.abort();
      outer?.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
      running.current.add(controller);
      return swirl(source, target, {
        ...options,
        signal: controller.signal,
      }).finally(() => running.current.delete(controller));
    },
    [],
  );
}

export { swirl };
export { ripple } from './ripple';
export { SWIRL_STYLES } from './util';
export type * from './types';
