// Vercel serverless function (Node runtime).
// The browser calls GET/PUT /api/sync?code=XXXX to read/write its session
// history to a shared store, so the same code on another device sees the
// same progress. Backed by the Upstash Redis REST API (added via the
// Vercel Storage marketplace integration) — the URL/token never reach the
// browser.

function isValidCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9-]{4,64}$/.test(code);
}

export default async function handler(req, res) {
  const baseUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) {
    res.status(500).json({ error: "Server is missing KV_REST_API_URL/KV_REST_API_TOKEN" });
    return;
  }

  const code = req.query?.code;
  if (!isValidCode(code)) {
    res.status(400).json({ error: "code must be a short alphanumeric sync code" });
    return;
  }
  const key = `speakflow:${code}`;

  try {
    if (req.method === "GET") {
      const upstream = await fetch(`${baseUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: "Failed to read from store" });
        return;
      }
      const data = await upstream.json();
      let sessions = [];
      if (data.result) {
        try {
          sessions = JSON.parse(data.result);
        } catch {
          sessions = [];
        }
      }
      res.status(200).json({ sessions });
      return;
    }

    if (req.method === "PUT") {
      const { sessions } = req.body || {};
      if (!Array.isArray(sessions)) {
        res.status(400).json({ error: "sessions must be an array" });
        return;
      }
      const upstream = await fetch(`${baseUrl}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
        body: JSON.stringify(sessions),
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: "Failed to write to store" });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown server error" });
  }
}
