import { handleRealityParserRequest } from './v12-1-deepseek.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

// V12.1 has one server responsibility: turn natural language into uncommitted
// candidate facts. It does not own user data or any retired product capability.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/reality/parse') return handleRealityParserRequest(request, env);
    return json({ error: 'not_found' }, 404);
  }
};
