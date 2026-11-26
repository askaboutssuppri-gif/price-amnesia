// Supabase Edge Function: extract-receipt (Price Amnesia) — v2, model fallback
// Paste into: Supabase Dashboard -> Edge Functions -> New function
// Name it EXACTLY: extract-receipt   |   Verify JWT: OFF
// Secret needed: GEMINI_API_KEY = your Google Gemini API key (aistudio.google.com)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

// Tried in order — if Google retires one, the reader falls through to the next.
const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

const PROMPT = `You are a receipt parser. Look at this grocery receipt image and extract:
- store: the store name (or null if not visible)
- date: the purchase date in YYYY-MM-DD format (or null if not visible)
- items: array of { name, price, quantity, unit } where name is normalized to lowercase simple form (e.g. "EGGS 12CT" -> "eggs"), price is the item total as a number, quantity number or null, unit like "lb"/"oz"/"ct" or null.
Return ONLY valid JSON, no markdown: {"store": "...", "date": "YYYY-MM-DD", "items": [{"name": "...", "price": 0.00, "quantity": null, "unit": null}]}
If you cannot read the receipt, return: {"store": null, "date": null, "items": []}`;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

async function readReceipt(base64Data: string) {
  let lastErr = "";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: base64Data } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let jsonStr = text.trim();
      if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
      return JSON.parse(jsonStr);
    }
    const body = await res.text();
    lastErr = `${model}: ${res.status} ${body}`;
    if (res.status !== 404 && !body.includes("NOT_FOUND") && !body.includes("not found")) break;
  }
  throw new Error(`Gemini API error: ${lastErr}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY secret is not set");
    const { imageBase64 } = await req.json();
    if (!imageBase64) throw new Error("imageBase64 is required");
    const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const result = await readReceipt(base64Data);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", ...CORS } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String((error as Error).message || error) }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }
});
