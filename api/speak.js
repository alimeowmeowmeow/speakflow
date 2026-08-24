// Vercel serverless function (Node runtime).
// The browser calls POST /api/speak with { text }.
// This function attaches the real OpenAI API key (from an environment
// variable, never sent to the client) and returns synthesized speech audio.

const VOICE = "nova"; // OpenAI TTS — warm, natural American female voice

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing OPENAI_API_KEY" });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text must be a non-empty string" });
    return;
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: VOICE,
        input: text,
        response_format: "mp3",
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: errText || "OpenAI TTS API error" });
      return;
    }

    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.status(200).send(audioBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown server error" });
  }
}
