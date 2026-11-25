// daily plan email
// cron calls this at 7:40am (with x-cron-secret), settings page calls it for a test email
import { cors, json, requireUser } from "../_shared/ai.ts";
import { accessToken, admin, canEmail, gapi, sendGmail, shopOwnerOf, todayMY, TZ } from "../_shared/google.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const time12 = (t?: string | null) => {
  if (!t) return "Any time";
  const [h, m] = t.split(":").map(Number);
  return `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};
const KIND: Record<string, string> = { MEETUP: "Meetup", LISTING: "Listing", THREADS: "Threads", SOURCING: "Sourcing", CALENDAR: "Event" };

type Db = ReturnType<typeof admin>;

async function buildAndSend(db: Db, owner: string, test: boolean) {
  const [{ data: prof }, { data: acct }] = await Promise.all([
    db.from("profiles").select("display_name, shop_name, business_email, daily_email, last_daily_email").eq("id", owner).maybeSingle(),
    db.from("google_accounts").select("refresh_token, calendar_id, scopes, email").eq("owner", owner).maybeSingle(),
  ]);
  if (!prof?.business_email) throw new Error("Add your business email in Settings first");
  if (!acct) throw new Error("Connect Google in Settings first");
  if (!canEmail(acct.scopes)) throw new Error("Reconnect Google in Settings and allow sending email");

  const today = todayMY();
  const shop = await shopOwnerOf(db, owner);
  const [{ data: tasks }, { data: posts }, { count: forSale }] = await Promise.all([
    db.from("tasks").select("title, kind, due_time, notes, done").eq("owner", shop).eq("due_date", today).order("due_time", { nullsFirst: false }),
    db.from("posts").select("text, status").eq("owner", shop).eq("scheduled_for", today),
    db.from("listings").select("id", { count: "exact", head: true }).eq("owner", shop).eq("status", "listed"),
  ]);

  const token = await accessToken(acct.refresh_token);
  let events: { title: string; time: string }[] = [];
  try {
    const q = new URLSearchParams({ timeMin: `${today}T00:00:00+08:00`, timeMax: `${today}T23:59:59+08:00`, singleEvents: "true", orderBy: "startTime", timeZone: TZ, maxResults: "50" });
    const data = await gapi(token, `/calendars/${encodeURIComponent(acct.calendar_id || "primary")}/events?${q}`);
    const fmt = new Intl.DateTimeFormat("en-MY", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
    events = (data?.items ?? [])
      .filter((e: Record<string, any>) => e.status !== "cancelled" && !e.extendedProperties?.private?.reloved_task)
      .map((e: Record<string, any>) => ({ title: e.summary ?? "(no title)", time: e.start?.date ? "All day" : fmt.format(new Date(e.start.dateTime)) }));
  } catch { /* calendar is a bonus; the email still goes out */ }

  const open = (tasks ?? []).filter((t) => !t.done);
  const dateLabel = new Intl.DateTimeFormat("en-MY", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const name = prof.display_name && prof.display_name !== "there" ? prof.display_name : "";
  const appUrl = (Deno.env.get("ALLOWED_ORIGIN") ?? "").split(",")[0].trim();

  const row = (left: string, right: string, sub = "") =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:15px;color:#111">${left}${sub ? `<div style="font-size:13px;color:#777;margin-top:2px">${sub}</div>` : ""}</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#E65416;text-align:right;white-space:nowrap;vertical-align:top">${right}</td></tr>`;
  const section = (title: string, rows: string) => rows
    ? `<h3 style="margin:26px 0 6px;font-size:13px;letter-spacing:.06em;color:#777">${title}</h3><table width="100%" cellspacing="0" cellpadding="0">${rows}</table>` : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
 <div style="background:#303236;border-radius:20px;padding:24px;color:#F5F5F5">
  <div style="font-size:13px;opacity:.7">${esc(prof.shop_name || "Reloved.Market")}${test ? " · test email" : ""}</div>
  <div style="font-size:24px;font-weight:700;margin-top:4px">Good morning${name ? ", " + esc(name) : ""} ☀️</div>
  <div style="font-size:15px;margin-top:6px;opacity:.85">${esc(dateLabel)} · ${open.length} task${open.length === 1 ? "" : "s"} to do · ${forSale ?? 0} item${forSale === 1 ? "" : "s"} for sale</div>
 </div>
 <div style="background:#fff;border-radius:20px;padding:4px 24px 24px;margin-top:12px">
  ${section("TODAY'S TASKS", (tasks ?? []).map((t) => row(t.done ? `<s style="color:#999">${esc(t.title)}</s>` : esc(t.title), esc(time12(t.due_time)), esc(KIND[t.kind] ?? "") + (t.notes ? " · " + esc(t.notes) : ""))).join(""))}
  ${section("GOOGLE CALENDAR", events.map((e) => row(esc(e.title), esc(e.time))).join(""))}
  ${section("THREADS POSTS FOR TODAY", (posts ?? []).map((p) => row(esc(String(p.text).slice(0, 90)) + (String(p.text).length > 90 ? "…" : ""), esc(p.status))).join(""))}
  ${!(tasks ?? []).length && !events.length && !(posts ?? []).length ? `<p style="font-size:15px;color:#555;margin-top:22px">Nothing planned today. A good day to list something new or draft a Threads post.</p>` : ""}
  ${appUrl ? `<p style="margin-top:24px"><a href="${esc(appUrl)}" style="display:inline-block;background:#E65416;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Open Reloved.Market</a></p>` : ""}
 </div>
 <p style="font-size:12px;color:#999;text-align:center;margin-top:16px">Sent by your Reloved.Market app. Turn it off in Settings → Daily plan email.</p>
</div></body></html>`;

  const subject = `${test ? "[Test] " : ""}Today's plan · ${dateLabel} · ${open.length} task${open.length === 1 ? "" : "s"}`;
  await sendGmail(token, prof.business_email, subject, html);
  if (!test) await db.from("profiles").update({ last_daily_email: today }).eq("id", owner);
  return { to: prof.business_email, tasks: open.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();

  // from cron
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data: ok } = await db.rpc("check_cron_secret", { s: cronSecret });
    if (ok !== true) return json({ error: "Forbidden" }, 403);
    const today = todayMY();
    const { data: due } = await db.from("profiles").select("id, last_daily_email").eq("daily_email", true).not("business_email", "is", null);
    const results = [];
    for (const p of due ?? []) {
      if (p.last_daily_email === today) continue;
      try { results.push({ ok: true, ...(await buildAndSend(db, p.id, false)) }); }
      catch (e) { console.error("daily-email", p.id, (e as Error).message); results.push({ ok: false, error: (e as Error).message }); }
    }
    return json({ sent: results.filter((r) => r.ok).length, results });
  }

  // test email from settings
  const user = await requireUser(req);
  if (!user) return json({ error: "Please sign in" }, 401);
  try { return json({ ok: true, ...(await buildAndSend(db, user.id, true)) }); }
  catch (e) { console.error("daily-email test", (e as Error).message); return json({ error: (e as Error).message }, 400); }
});
