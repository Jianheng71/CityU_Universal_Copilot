const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';

app.post('/api/ai', async (req, res) => {
  try {
    const { provider = 'deepseek', intent = '', workflow = null } = req.body || {};
    const prompt = `User intent: ${intent}\n\nWorkflow context: ${workflow ? JSON.stringify(workflow, null, 2) : 'No workflow matched'}\n\nProvide a concise, practical answer for CityU AIMS users.`;

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'Missing GEMINI_API_KEY in server environment.' });
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
        })
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text });
      }

      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join(' ') || 'No answer returned by Gemini.';
      return res.json({ provider: 'gemini', answer });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY in server environment.' });
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: 'You are CityU Universal Sinno, a concise and privacy-first CityU AIMS guide.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No answer returned by DeepSeek.';
    return res.json({ provider: 'deepseek', answer });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown server error' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cityu-sinno-ai-proxy' });
});

app.listen(port, () => {
  console.log(`CityU Sinno AI proxy ready on http://localhost:${port}`);
});
