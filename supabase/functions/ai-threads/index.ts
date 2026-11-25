// rewrite my threads idea + hashtags
import { askAIJSON, cors, json, requireUser } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "Please sign in" }, 401);

  let body: { text?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const idea = String(body.text ?? "").trim().slice(0, 800);
  if (!idea) return json({ error: "Write your idea first" }, 400);

  const prompt = `You write Threads posts for Reloved.Market (Carousell @relov3d.market), a Malaysian preloved shop selling furniture, home items and electronics.
Rewrite this idea as one Threads post: a punchy first-line hook, short lines, casual Malaysian English (a little Manglish is fine), at most 2 emojis, max 450 characters, end with a soft call to action. Keep the facts; don't invent prices or claims.
Then suggest 5-7 hashtags that fit Threads Malaysia and this post (mix English and Malay where natural, e.g. #barangterpakai). The first should be the best topic tag.

Idea: """${idea}"""

Reply with only JSON: {"post":"","hashtags":["#..."]}`;
  try {
    const r = await askAIJSON([{ type: "text", text: prompt }], 800);
    const tags = (Array.isArray(r.hashtags) ? r.hashtags : []).map((t: unknown) => "#" + String(t).replace(/^#+/, "").replace(/\s+/g, "")).slice(0, 7);
    return json({ post: String(r.post ?? "").slice(0, 500), hashtags: tags });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
