import { createDeterministicRealityParserAdapter } from './v12-reality-capture.js';
import {
  createRealityParserRouter,
  selectRelevantRealityContext,
  validateParserInterpretation
} from './v12-1-reality-parser.js';

export function createServerRealityParserAdapter(options = {}) {
  const endpoint = String(options.endpoint || '/api/reality/parse');
  const fetchImpl = options.fetchImpl || fetch;
  return Object.freeze({
    id: 'deepseek-v4-flash',
    provider: 'deepseek',
    sendsDataExternally: true,
    async parse(text, context) {
      const minimal = selectRelevantRealityContext(text, context);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: String(text || '').trim().slice(0, 1000), ...minimal })
      });
      if (!response.ok) throw new Error('provider_unavailable');
      const interpretation = await response.json();
      const validation = validateParserInterpretation(interpretation);
      if (!validation.valid) throw new Error('provider_schema_invalid');
      return interpretation;
    }
  });
}

export function createV12_1RealityParser(options = {}) {
  return createRealityParserRouter({
    localAdapter: options.localAdapter || createDeterministicRealityParserAdapter(),
    llmAdapter: options.llmAdapter || createServerRealityParserAdapter(options)
  });
}
