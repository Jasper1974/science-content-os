// Vercel Serverless Function - AI API proxy
// Forwards requests to any OpenAI-compatible API, bypassing browser CORS
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-base-url');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const baseUrl = req.headers['x-base-url'] || 'https://api.openai.com/v1';
  const stream = req.body?.stream;

  if (!apiKey) { res.status(401).json({ error: 'Missing API key' }); return; }

  try {
    const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(req.body)
    });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      if (!upstream.ok) {
        const errText = await upstream.text();
        res.status(upstream.status).send(errText);
        return;
      }
      if (!upstream.body) {
        res.status(502).json({ error: 'Upstream returned empty stream body' });
        return;
      }
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }
      res.end();
    } else {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
