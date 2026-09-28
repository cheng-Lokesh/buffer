import { handleRealityParserRequest } from '../../../server/v12-1-deepseek.js';

const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 30;
let windowStartedAt = 0;
let requestCount = 0;

const edgeLimiter = {
  async limit() {
    const now = Date.now();
    if (!windowStartedAt || now - windowStartedAt >= WINDOW_MS) {
      windowStartedAt = now;
      requestCount = 0;
    }
    requestCount += 1;
    return { success: requestCount <= REQUEST_LIMIT };
  }
};

export default async function onRequest(context) {
  const { success } = await edgeLimiter.limit();
  if (!success) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
  return handleRealityParserRequest(context.request, {
    ...context.env,
    ALLOWED_ORIGIN: context.env?.ALLOWED_ORIGIN || 'same-origin',
    PROVIDER_TIMEOUT_MS: context.env?.PROVIDER_TIMEOUT_MS || '12000'
  });
}
