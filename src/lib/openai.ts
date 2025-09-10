// src/lib/openai.ts
import OpenAI from 'openai';

// Ensure API key exists on the server
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable on the server');
}

// Singleton OpenAI client for server usage
export const openai = new OpenAI({ apiKey });

// Centralized default model (overridable via env)
export const defaultOpenAIModel = process.env.OPENAI_MODEL || 'gpt-5-mini-2025-08-07';

