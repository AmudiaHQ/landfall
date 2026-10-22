// Serves the demo page with live TypeScript bundling. Port 3050 is this
// project's port in D:\_Me\projects\ports.txt.
import page from '../demo/index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3050),
  routes: { '/': page },
  development: true,
});

console.log(`Landfall demo: ${server.url}`);
