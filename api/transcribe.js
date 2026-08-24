// Vercel serverless function (Node runtime).
// The browser calls POST /api/transcribe with { audioBase64, mimeType }.
// This function attaches the real OpenAI API key (from an environment
// variable, never sent to the client) and returns the transcribed text via
// Whisper. The key is never exposed to the browser.

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

  const { audioBase64, mimeType } = req.body || {};
  if (!audioBase64 || typeof audioBase64 !== "string") {
    res.status(400).json({ error: "audioBase64 must be a non-empty string" });
    return;
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = (mimeType || "").includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: mimeType || "audio/webm" }), `clip.${ext}`);
    form.append("model", "whisper-1");

    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: errText || "Whisper API error" });
      return;
    }

    const data = await upstream.json();
    res.status(200).json({ text: data.text || "" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown server error" });
  }
}
