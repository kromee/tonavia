import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const handlers = {
  '/api/spotify/callback': require('../api/spotify/callback.js'),
  '/api/spotify/search': require('../api/spotify/search.js')
};

const host = process.env.TONAVIA_API_HOST ?? '127.0.0.1';
const port = Number(process.env.TONAVIA_API_PORT ?? 3001);

function withVercelResponse(response) {
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };

  response.json = (payload) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
  };

  return response;
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);

  const handler = handlers[url.pathname];
  if (!handler) {
    response.statusCode = 404;
    response.end();
    return;
  }

  request.query = Object.fromEntries(url.searchParams.entries());
  handler(request, withVercelResponse(response));
}).listen(port, host, () => {
  console.log(`API local lista en http://${host}:${port}`);
});
