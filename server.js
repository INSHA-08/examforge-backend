const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

app.use(cors());
app.use(express.json({ limit: '50kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', hasKey: Boolean(GEMINI_API_KEY) });
});

async function askGemini(prompt) {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) {
    const err = new Error('Server configuration error: GEMINI_API_KEY is missing.');
    err.statusCode = 500;
    throw err;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY.trim())}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMsg = data?.error?.message || `Gemini API request failed (${response.status})`;
    const err = new Error(apiMsg);
    err.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw err;
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) {
    const err = new Error('Empty response received from Gemini model.');
    err.statusCode = 502;
    throw err;
  }

  return text;
}

app.post('/api/expand-note', async (req, res) => {
  try {
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const chapterTitle = typeof req.body?.chapterTitle === 'string' ? req.body.chapterTitle.trim() : '';

    if (!subject || !chapterTitle) {
      return res.status(400).json({ error: 'Both subject and chapterTitle are required.' });
    }

    const prompt = [
      `You are an ISC Class 12 tutor for ${subject}.`,
      `Provide a clear, thorough explanation of the ENTIRE chapter: "${chapterTitle}".`,
      'Include: 1) Beginner-friendly overview, 2) Core concepts/laws/themes, 3) Key formulas/definitions/examples/quotes as relevant, 4) Common exam mistakes & quick revision summary.'
    ].join('\n');

    const explanation = await askGemini(prompt);
    return res.json({ explanation });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to generate chapter note.' });
  }
});

app.post('/api/chapter-chat', async (req, res) => {
  try {
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const chapterTitle = typeof req.body?.chapterTitle === 'string' ? req.body.chapterTitle.trim() : '';
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];

    if (!subject || !chapterTitle || !question) {
      return res.status(400).json({ error: 'subject, chapterTitle, and question are required.' });
    }

    if (question.length > 1000) {
      return res.status(400).json({ error: 'Question is too long (max 1000 characters).' });
    }

    const formattedHistory = history
      .filter((m) => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text.trim()}`)
      .join('\n');

    const prompt = [
      `You are an ISC Class 12 tutor helping a student with "${chapterTitle}" (${subject}).`,
      'Answer clearly and stay focused on this chapter. If a question is unrelated to the chapter, politely guide the student back to this chapter.',
      formattedHistory ? `Recent conversation:\n${formattedHistory}` : '',
      `Student question: ${question}`
    ].filter(Boolean).join('\n\n');

    const reply = await askGemini(prompt);
    return res.json({ reply });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to process chat question.' });
  }
});

app.listen(PORT, () => {
  console.log(`ExamForge AI backend running on port ${PORT}`);
});
                      
