import frontend from '../frontend/index.html';
import landing from '../landing/index.html';
import { api } from "./api";

const isDev = process.env.NODE_ENV === 'development';

const server = Bun.serve({
  routes: {
    '/api/*': api.fetch,
    '/app/*': frontend, // matches with basepath in frontend
    '/': landing,
  },
  development: isDev,
})

console.log(
  `🐲 Bun is running at ${server.hostname}:${server.port}`
);

// Run @tanstack/router-cli watch if in development
if (isDev) {
  Bun.spawn(['bun', 'run', 'tsr', 'watch'], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
}