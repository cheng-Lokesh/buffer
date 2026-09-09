import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleRealityParserRequest } from './server/v12-1-deepseek.js';
import { resolveAllowedRequestOrigin } from './server/v12-1-local-origin.js';

function realityParserApi() {
  const install = (middlewares) => middlewares.use('/api/reality/parse', async (request, response) => {
    const origin = resolveAllowedRequestOrigin(request.headers);
    if (!origin) {
      response.statusCode = 403;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'origin_not_allowed' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const host = request.headers.host || '127.0.0.1';
    const webRequest = new Request(`http://${host}/api/reality/parse`, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks)
    });
    const webResponse = await handleRealityParserRequest(webRequest, {
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      ALLOWED_ORIGIN: origin
    });
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  });
  return {
    name: 'buffer-reality-parser-api',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); }
  };
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/buffer/' : '/',
  plugins: [react(), realityParserApi()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('/node_modules/')) return undefined;
          if (normalizedId.includes('/lucide-react/')) return 'vendor-icons';
          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/scheduler/')
          ) return 'vendor-react';
          return 'vendor';
        }
      }
    }
  }
});
