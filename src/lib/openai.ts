// src/lib/openai.ts
import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable on the server');
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

// Lazy singleton: Proxy defers client creation until first property access,
// so importing `openai` at module load does not throw when OPENAI_API_KEY is
// missing (e.g. Next.js build-time "Collecting page data" phase).
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    const client = getOpenAIClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// Centralized default model (overridable via env)
export const defaultOpenAIModel = process.env.OPENAI_MODEL || 'gpt-5-mini';

