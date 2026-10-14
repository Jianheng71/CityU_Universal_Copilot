const express = require('express');
const { handleAI } = require('./ai-handler');

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json({ limit: '32kb' }));

app.post('/api/ai', async (req, res) => {
  const result = await handleAI(req.body);
  res.status(result.status).json(result.body);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'cityu-universal-sinno-ai' });
});

app.listen(port, () => {
  console.log(`CityU Sinno AI proxy ready on http://localhost:${port}`);
});
