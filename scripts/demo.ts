// Copyright 2026 Amudia (https://amudia.com)
// SPDX-License-Identifier: Apache-2.0

// Serves the demo page with live TypeScript bundling.
import page from '../demo/index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3050),
  routes: { '/': page },
  development: true,
});

console.log(`Landfall demo: ${server.url}`);
