// shared stuff for the edge functions
import { createClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  // * is ok because every function still checks the login token
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// only me (logged in) can call these
export async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  // also need the 2-step code done (aal2)
  try {
    const payload = JSON.parse(atob(auth.replace(/^Bearer\s+/i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.aal !== "aal2") return null;
  } catch {
    return null;
  }
  return data.user;
}

type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function parseJSON(text: string) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

// gemini (free). if a model is busy, wait a bit and try the next model
async function askGemini(key: string, content: Block[], maxTokens: number) {
  const models = [Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
    .filter((m, i, all) => all.indexOf(m) === i);
  const parts = content.map((b) => b.type === "text" ? { text: b.text } : { inline_data: { mime_type: b.source.media_type, data: b.source.data } });
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens * 2 },
  });
  let lastStatus = 0;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body,
      });
      if (res.ok) {
        const data = await res.json();
        const text: string = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        return parseJSON(text);
      }
      lastStatus = res.status;
      const busy = [429, 500, 503].includes(res.status);
      if (res.status === 404) break; // model not on this key, try next
      if (!busy) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await res.body?.cancel();
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(lastStatus === 429
    ? "Free AI limit reached for now. Try again in a minute (or tomorrow)."
    : "Google's AI is busy right now. Please try again in a minute.");
}

// ask gemini and get json back
export async function askAIJSON(content: Block[], maxTokens = 1200) {
  const gemini = Deno.env.get("GEMINI_API_KEY");
  if (gemini) return askGemini(gemini, content, maxTokens);
  throw new Error("No AI key yet: add GEMINI_API_KEY in Supabase → Edge Functions → Secrets");
}
