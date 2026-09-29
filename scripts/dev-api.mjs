import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const handlers = {
  '/api/spotify/callback': require('../api/spotify/callback.js'),
  '/api/spotify/search': require('../api/spotify/search.js')
};

const port = Number(process.env.TONAVIA_API_PORT ?? 3001);

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

  const handler = handlers[url.pathname];
  if (!handler) {
    response.statusCode = 404;
    response.end();
    return;
  }

  request.query = Object.fromEntries(url.searchParams.entries());
  handler(request, response);
}).listen(port, () => {
  console.log(`API local lista en http://127.0.0.1:${port}`);
});
