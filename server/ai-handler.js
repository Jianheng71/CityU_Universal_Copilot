const AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const GATEWAY_MODELS = {
  deepseek: 'deepseek/deepseek-v4-flash',
  gemini: 'google/gemini-2.5-flash'
};

function providerError(status, provider, gateway = false) {
  if (status === 401 || status === 403) {
    return gateway
      ? 'Vercel AI Gateway rejected the key. Check AI_GATEWAY_API_KEY in Vercel Production environment variables.'
      : `${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} rejected the configured API key.`;
  }
  if (status === 402) {
    return gateway
      ? 'Vercel AI Gateway has no available balance or budget for this request.'
      : 'The selected AI provider has no available balance or quota.';
  }
  if (status === 429) {
    return gateway ? 'Vercel AI Gateway rate limit reached. Please wait and retry.' : 'The selected AI provider rate limit was reached.';
  }
  if (status === 404) {
    return gateway ? 'The selected model is unavailable in Vercel AI Gateway.' : 'The selected model was not found at the AI provider.';
  }
  return 'The AI provider could not complete the request.';
}

async function requestGateway({ apiKey, provider, prompt }) {
  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GATEWAY_MODELS[provider],
      messages: [
        { role: 'system', content: 'You are CityU Universal Sinno, a concise and privacy-first CityU AIMS guide.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 600,
      stream: false
    }),
    signal: AbortSignal.timeout(25000)
  });

  if (!response.ok) {
    return { status: 502, body: { error: providerError(response.status, provider, true) } };
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  return {
    status: 200,
    body: { provider, answer: answer || 'No answer returned by the AI Gateway.' }
  };
}

function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }

  if (body.provider !== undefined && !['deepseek', 'gemini'].includes(body.provider)) {
    return 'Provider must be "deepseek" or "gemini".';
  }

  if (typeof body.intent !== 'string' || body.intent.trim().length === 0) {
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

async function requestAI({ provider, intent, workflow }) {
  const prompt = `User intent: ${intent}\n\nWorkflow context: ${workflow ? JSON.stringify(workflow, null, 2) : 'No workflow matched'}\n\nProvide a concise, practical answer for CityU AIMS users.`;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;

  if (gatewayKey) {
    return requestGateway({ apiKey: gatewayKey, provider, prompt });
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { status: 503, body: { error: 'Gemini is not configured on the AI service.' } };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
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

    if (!response.ok) return { status: 502, body: { error: providerError(response.status, provider) } };

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join(' ').trim();
    return { status: 200, body: { provider: 'gemini', answer: answer || 'No answer returned by Gemini.' } };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { status: 503, body: { error: 'DeepSeek is not configured on the AI service.' } };
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
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

  if (!response.ok) return { status: 502, body: { error: providerError(response.status, provider) } };

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  return { status: 200, body: { provider: 'deepseek', answer: answer || 'No answer returned by DeepSeek.' } };
}

async function handleAI(body) {
  const validationError = validateRequest(body);
  if (validationError) {
    return { status: 400, body: { error: validationError } };
  }

  if (!process.env.AI_GATEWAY_API_KEY &&
      (body.provider ?? 'deepseek') === 'deepseek' &&
      !process.env.DEEPSEEK_API_KEY) {
    return {
      status: 503,
      body: { error: 'Add AI_GATEWAY_API_KEY to the Vercel Production environment variables.' }
    };
  }

  if (!process.env.AI_GATEWAY_API_KEY &&
      (body.provider ?? 'deepseek') === 'gemini' &&
      !process.env.GEMINI_API_KEY) {
    return {
      status: 503,
      body: { error: 'Add AI_GATEWAY_API_KEY or GEMINI_API_KEY to the Vercel Production environment variables.' }
    };
  }

  try {
    return await requestAI({
      provider: body.provider ?? 'deepseek',
      intent: body.intent.trim(),
      workflow: body.workflow ?? null
    });
  } catch {
    return { status: 502, body: { error: 'The AI provider is temporarily unavailable.' } };
  }
}

module.exports = { handleAI };
