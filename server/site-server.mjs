import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleRealityParserRequest } from './v12-1-deepseek.js';

const port = Number(process.argv[2] || process.env.PORT || 8899);
const siteRoot = resolve(import.meta.dirname, '..', 'site');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8' };

function webRequest(request) {
  const origin = `http://${request.headers.host || `127.0.0.1:${port}`}`;
  const url = new URL(request.url || '/', origin);
  return new Request(url, { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method || 'GET') ? undefined : request, duplex: 'half' });
}

async function sendWebResponse(response, nodeResponse) {
  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || `127.0.0.1:${port}`}`);
    if (url.pathname === '/api/reality/parse') {
      return sendWebResponse(await handleRealityParserRequest(webRequest(request), process.env), response);
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = resolve(siteRoot, `.${relative}`);
    if (!(file === siteRoot || file.startsWith(`${siteRoot}${sep}`)) || !(await stat(file)).isFile()) throw new Error('not_found');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`Buffer site running at http://127.0.0.1:${port}\n`));

if (process.argv[1] && import.meta.url !== pathToFileURL(process.argv[1]).href) server.close();
