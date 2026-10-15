const DEEPSEEK_MODEL = 'deepseek-chat';
const GEMINI_MODEL = 'gemini-2.5-flash';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestsByIP = new Map();

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  }
});

function isRateLimited(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const recent = (requestsByIP.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestsByIP.set(ip, recent);
    return true;
  }

  if (requestsByIP.size >= 5000) {
    for (const [address, requests] of requestsByIP) {
      if (requests.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
        requestsByIP.delete(address);
      }
    }
  }

  recent.push(now);
  requestsByIP.set(ip, recent);
  return false;
}

function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }
  if (body.provider !== undefined && !['deepseek', 'gemini'].includes(body.provider)) {
    return 'Provider must be "deepseek" or "gemini".';
  }
  if (typeof body.intent !== 'string' || !body.intent.trim()) {
    return 'Intent must be a non-empty string.';
  }
  if (body.intent.length > 2000) {
    return 'Intent must not exceed 2000 characters.';
  }
  if (body.workflow !== undefined && body.workflow !== null) {
    if (typeof body.workflow !== 'object' || Array.isArray(body.workflow)) {
      return 'Workflow must be a JSON object or null.';
    }
    if (JSON.stringify(body.workflow).length > 20000) {
      return 'Workflow context must not exceed 20000 characters.';
    }
  }
  return null;
}

function providerError(status, provider) {
  if (status === 401 || status === 403) {
    return `${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} rejected the configured API key. Check the Worker secret.`;
  }
  if (status === 402) return 'The selected AI provider has no available balance or quota.';
  if (status === 429) return 'The selected AI provider rate limit was reached. Please wait and retry.';
  if (status === 404) return 'The selected model was not found at the AI provider.';
  return 'The AI provider could not complete the request.';
}

async function callDeepSeek(apiKey, prompt) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: 'You are CityU Universal Sinno, a concise and privacy-first CityU AIMS guide.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 600
    }),
    signal: AbortSignal.timeout(25000)
  });

  if (!response.ok) return { status: 502, body: { error: providerError(response.status, 'deepseek') } };
  const data = await response.json();
  return {
    status: 200,
    body: { provider: 'deepseek', answer: data.choices?.[0]?.message?.content?.trim() || 'No answer returned by DeepSeek.' }
  };
}

async function callGemini(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
      }),
      signal: AbortSignal.timeout(25000)
    }
  );

  if (!response.ok) return { status: 502, body: { error: providerError(response.status, 'gemini') } };
  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join(' ').trim();
  return { status: 200, body: { provider: 'gemini', answer: answer || 'No answer returned by Gemini.' } };
}

async function handleAI(body, env) {
  const validationError = validateRequest(body);
  if (validationError) return { status: 400, body: { error: validationError } };

  const provider = body.provider ?? 'deepseek';
  const apiKey = provider === 'gemini' ? env.GEMINI_API_KEY : env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      status: 503,
      body: { error: `Add the ${provider === 'gemini' ? 'GEMINI_API_KEY' : 'DEEPSEEK_API_KEY'} Worker secret in Cloudflare.` }
    };
  }

  const prompt = `User intent: ${body.intent.trim()}\n\nWorkflow context: ${body.workflow ? JSON.stringify(body.workflow, null, 2) : 'No workflow matched'}\n\nProvide a concise, practical answer for CityU AIMS users.`;
  try {
    return provider === 'gemini'
      ? await callGemini(apiKey, prompt)
      : await callDeepSeek(apiKey, prompt);
  } catch {
    return { status: 502, body: { error: 'The AI provider is temporarily unavailable. Check the Worker logs for details.' } };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, service: 'cityu-universal-sinno-ai' }, 200, corsHeaders);
    }
    if (url.pathname !== '/api/ai') return json({ error: 'Not found.' }, 404, corsHeaders);
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405, { ...corsHeaders, Allow: 'POST, OPTIONS' });
    }
    if (isRateLimited(request)) {
      return json({ error: 'Too many requests. Please try again shortly.' }, 429, corsHeaders);
    }

    let body;
    try {
      const rawBody = await request.text();
      if (rawBody.length > 32_000) return json({ error: 'Request body is too large.' }, 413, corsHeaders);
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400, corsHeaders);
    }

    const result = await handleAI(body, env);
    return json(result.body, result.status, corsHeaders);
  }
};
