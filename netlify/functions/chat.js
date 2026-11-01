// Netlify Function: hides the Gemini API key on the server.
// Env vars (set in Netlify dashboard): GEMINI_API_KEY, GEMINI_MODEL, GEMINI_MODEL_BACKUP

const hits = new Map();           // simple per-IP rate limit (best effort, resets on cold start)
const LIMIT = 40;                 // max requests per IP per window
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(500, { error: "PROBLEM: the server has no GEMINI_API_KEY. FIX: in Netlify go to Site configuration → Environment variables, add GEMINI_API_KEY, then Deploys → Trigger deploy." });

  // rate limit
  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["x-forwarded-for"] ||
    "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT)
    return json(429, { error: "PROBLEM: too many requests from your connection (limit is 40 per hour). FIX: wait a while and try again." });
  recent.push(now);
  hits.set(ip, recent);

  // validate input
  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Bad request." });
  }
  const system = String(data.system || "").slice(0, 2000);
  const messages = Array.isArray(data.messages) ? data.messages.slice(-20) : [];
  if (!messages.length) return json(400, { error: "No messages." });
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, 8000) }],
  }));

  // optional image (Snap & Solve)
  const img = data.image;
  if (img && typeof img.data === "string" && /^image\/(jpeg|png|webp)$/.test(img.mime) && img.data.length < 4000000) {
    contents[contents.length - 1].parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
  }

  const models = [process.env.GEMINI_MODEL, process.env.GEMINI_MODEL_BACKUP].filter(Boolean);
  if (!models.length) return json(500, { error: "PROBLEM: the server has no GEMINI_MODEL. FIX: in Netlify add GEMINI_MODEL (and GEMINI_MODEL_BACKUP) under Environment variables, then trigger a deploy." });

  const errors = [];
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            ...(data.json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
          }),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error(d.error?.message || "Request failed");
        e.status = r.status;
        throw e;
      }
      const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (!text) {
        const block = d.promptFeedback?.blockReason || d.candidates?.[0]?.finishReason;
        const e = new Error("Empty response" + (block ? " (" + block + ")" : ""));
        e.blocked = block;
        throw e;
      }
      return json(200, { text });
    } catch (e) {
      errors.push({ model, status: e.status, message: e.message, blocked: e.blocked });
    }
  }
  console.error(JSON.stringify(errors)); // also visible in Netlify function logs
  const first = errors[0] || {};
  const all = errors.map((e) => e.model + " → " + (e.status ? e.status + " " : "") + e.message).join(" | ");
  const msg = (first.message || "").toLowerCase();
  let problem;
  if (first.status === 400 && /api key|api_key/.test(msg)) problem = "your Gemini API key is not valid. FIX: create a new key in Google AI Studio and update GEMINI_API_KEY in Netlify, then redeploy.";
  else if (first.status === 403 || /permission|denied/.test(msg)) problem = "your key is not allowed to use this model or API. FIX: check the key in Google AI Studio and the model ID.";
  else if (first.status === 404 || /not found|not supported/.test(msg)) problem = "the model name was not found. FIX: copy the exact model ID from Google AI Studio into GEMINI_MODEL / GEMINI_MODEL_BACKUP in Netlify, then redeploy.";
  else if (first.status === 429 || /quota|rate|exhausted/.test(msg)) problem = "Gemini free quota or rate limit reached. FIX: wait a minute and retry, or check your usage in Google AI Studio.";
  else if (first.blocked || /safety|blocked/.test(msg)) problem = "Gemini blocked this request or returned nothing (" + (first.blocked || "safety filter") + "). FIX: try rewording it.";
  else if (first.status >= 500) problem = "Google's servers had an error. FIX: try again in a moment.";
  else problem = "the AI request failed.";
  return json(502, { error: "PROBLEM: " + problem, detail: all });
};
