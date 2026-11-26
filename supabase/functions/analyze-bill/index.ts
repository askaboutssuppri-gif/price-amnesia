// Supabase Edge Function: analyze-bill (Price Amnesia — Bill Lens)
// Reads a photo of ANY bill (utility, phone, internet, medical, rent…)
// with Google Gemini and returns the extraction AND a plain-English
// interpretation in a single call.
// Secret needed: GEMINI_API_KEY (already in the project for receipts).
// Verify JWT must be OFF (the app calls it without a user session).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

// Tried in order — if Google retires one, the reader falls through to the next.
const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

const PROMPT = `You are a bill reader and interpreter. Look at this photo of a bill, statement, or invoice and extract:
- biller: the company or organization sending the bill (or null if unreadable)
- type: one of "electric", "gas", "water", "internet", "phone", "medical", "insurance", "rent", "credit-card", "loan", "subscription", "other"
- amountDue: the total amount currently due as a number (not a previous balance), or null
- dueDate: the payment due date in YYYY-MM-DD format, or null
- periodStart / periodEnd: the service/billing period dates in YYYY-MM-DD, or null
- accountLast4: last 4 digits of the account number if visible, or null
- usage: the main usage figure exactly as printed (e.g. "812 kWh", "1,240 gal", "unlimited"), or null
- lineItems: every charge line you can read as { label, amount } — delivery charges, usage charges, taxes, fees, credits (credits negative)
- summary: 2-3 sentences of plain-English interpretation: what this bill is for, the biggest things driving the total, and anything unusual printed on it (late fee, rate change, estimated reading, balance forward, autopay note). Warm and clear, written for the person who has to pay it.
- watchFor: an array of short flags worth the payer's attention (e.g. "Late fee of $12 included", "Due date is very soon after the statement date", "Usage looks like an estimated reading"). Empty array if nothing stands out.
Return ONLY valid JSON, no markdown:
{"biller": "...", "type": "electric", "amountDue": 0.00, "dueDate": "YYYY-MM-DD", "periodStart": null, "periodEnd": null, "accountLast4": null, "usage": null, "lineItems": [{"label": "...", "amount": 0.00}], "summary": "...", "watchFor": []}
If the image is not a bill or statement at all, return: {"biller": null, "type": "other", "amountDue": null, "dueDate": null, "periodStart": null, "periodEnd": null, "accountLast4": null, "usage": null, "lineItems": [], "summary": "This doesn't look like a bill — try a clearer photo of the full page.", "watchFor": []}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function readBill(base64Data: string) {
  let lastErr = "";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let jsonStr = text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
      }
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
    const result = await readBill(base64Data);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String((error as Error).message || error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
