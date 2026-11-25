// price + description for a listing (from photo and/or name)
import { askAIJSON, cors, json, requireUser } from "../_shared/ai.ts";

const CATS: Record<string, string> = { furn: "Furniture", elec: "Electronics", home: "Home appliances", motor: "Motor / vehicle parts", pets: "Pet supplies" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "Please sign in" }, 401);

  let body: { name?: string; category?: string; condition?: string; imageBase64?: string; mediaType?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const name = String(body.name ?? "").slice(0, 120);
  const category = CATS[String(body.category)] ?? "Other";
  const condition = String(body.condition ?? "Lightly used").slice(0, 40);
  const img = body.imageBase64 && body.imageBase64.length < 7_000_000 ? body.imageBase64 : null;
  const mediaType = ["image/jpeg", "image/png", "image/webp"].includes(String(body.mediaType)) ? String(body.mediaType) : "image/jpeg";
  if (!name && !img) return json({ error: "Add a photo or a name" }, 400);

  const prompt = `You price and write listings for Reloved.Market, a Malaysian preloved seller on Carousell (@relov3d.market) and Facebook Marketplace.
Item: ${name || "(identify it from the photo)"}
Category: ${category}
Condition: ${condition}
${img ? "A photo of the item is attached; use it to identify brand/model and check condition." : "No photo; work from the name only and lower your confidence."}

Estimate a realistic asking price in Malaysian Ringgit for the Malaysian second-hand market (Carousell MY, Facebook Marketplace Malaysia, Mudah). Round like local sellers (RM 35, RM 45, RM 120). Leave room for nego.
Write a Carousell title (max 80 characters) and a description in natural Malaysian-seller English: what it is, condition honestly, price "slightly nego", meetup around Klang Valley or postage (Semenanjung / Sabah Sarawak), and "DM relov3d.market". Never invent exact sizes or authenticity you can't see.

Reply with only JSON: {"price":0,"low":0,"high":0,"quick":0,"confidence":"low|medium|high","why":"one sentence","title":"","description":""}`;

  const content: Parameters<typeof askAIJSON>[0] = [];
  if (img) content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: img } });
  content.push({ type: "text", text: prompt });
  try {
    const r = await askAIJSON(content);
    const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
    return json({ price: n(r.price), low: n(r.low), high: n(r.high), quick: n(r.quick), confidence: String(r.confidence ?? "medium"),
      why: String(r.why ?? ""), title: String(r.title ?? name).slice(0, 80), description: String(r.description ?? "") });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
