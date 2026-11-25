// google calendar
// actions: status, connect, disconnect, upsert, delete, list
import { cors, json, requireUser } from "../_shared/ai.ts";
import { accessToken, admin, canEmail, CLIENT_ID, shopOwnerOf, CLIENT_SECRET, gapi, REDIRECT_URI, safeReturn, SCOPES, toEvent, TZ } from "../_shared/google.ts";

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "Please sign in" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const db = admin();
  const configured = !!(CLIENT_ID() && CLIENT_SECRET());
  const { data: acct } = await db.from("google_accounts").select("email, refresh_token, calendar_id, scopes").eq("owner", user.id).maybeSingle();

  try {
    switch (body.action) {
      case "status":
        return json({ configured, connected: !!acct, email: acct?.email ?? null, canEmail: canEmail(acct?.scopes) });

      case "connect": {
        if (!configured) return json({ error: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Supabase first" }, 400);
        const returnTo = safeReturn(String(body.returnTo ?? ""));
        if (!returnTo) return json({ error: "This site isn't allowed yet. Add it to the ALLOWED_ORIGIN secret." }, 400);
        const bytes = crypto.getRandomValues(new Uint8Array(24));
        const state = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
        await db.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
        const { error } = await db.from("oauth_states").insert({ state, owner: user.id, return_to: returnTo });
        if (error) throw error;
        const q = new URLSearchParams({
          client_id: CLIENT_ID(), redirect_uri: REDIRECT_URI(), response_type: "code", scope: SCOPES,
          access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
          login_hint: user.email ?? "",
        });
        return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
      }

      case "disconnect": {
        if (acct) {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acct.refresh_token)}`, { method: "POST" }).catch(() => {});
          await db.from("google_accounts").delete().eq("owner", user.id);
        }
        return json({ ok: true });
      }
    }

    if (!acct) return json({ error: "Google Calendar isn't connected", notConnected: true }, 409);
    const token = await accessToken(acct.refresh_token);
    const cal = encodeURIComponent(acct.calendar_id || "primary");

    switch (body.action) {
      case "upsert": {
        const t = body.task as Record<string, unknown> | undefined;
        if (!t || typeof t.id !== "string" || typeof t.title !== "string" || !isDate(t.due_date)) return json({ error: "Bad task" }, 400);
        // make sure the task is mine
        const shop = await shopOwnerOf(db, user.id);
        const { data: own } = await db.from("tasks").select("id, google_event_id").eq("id", t.id).eq("owner", shop).maybeSingle();
        if (!own) return json({ error: "Task not found" }, 404);
        const ev = toEvent(t as never);
        let saved = null;
        if (own.google_event_id) saved = await gapi(token, `/calendars/${cal}/events/${encodeURIComponent(own.google_event_id)}`, { method: "PATCH", body: JSON.stringify(ev) }).catch(() => null);
        if (!saved) saved = await gapi(token, `/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(ev) });
        await db.from("tasks").update({ google_event_id: saved.id, in_google_calendar: true }).eq("id", t.id).eq("owner", shop);
        return json({ eventId: saved.id });
      }

      case "delete": {
        const id = String(body.eventId ?? "");
        if (!/^[a-zA-Z0-9_-]{5,1024}$/.test(id)) return json({ error: "Bad event id" }, 400);
        await gapi(token, `/calendars/${cal}/events/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
        return json({ ok: true });
      }

      case "list": {
        if (!isDate(body.from) || !isDate(body.to)) return json({ error: "Bad range" }, 400);
        const q = new URLSearchParams({
          timeMin: `${body.from}T00:00:00+08:00`, timeMax: `${body.to}T23:59:59+08:00`,
          singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: TZ,
        });
        const data = await gapi(token, `/calendars/${cal}/events?${q}`);
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
        const events = (data?.items ?? [])
          .filter((e: Record<string, any>) => e.status !== "cancelled" && !e.extendedProperties?.private?.reloved_task)
          .map((e: Record<string, any>) => {
            if (e.start?.date) return { id: e.id, title: e.summary ?? "(no title)", date: e.start.date, time: null, allDay: true, link: e.htmlLink };
            const parts = Object.fromEntries(fmt.formatToParts(new Date(e.start.dateTime)).map((p) => [p.type, p.value]));
            return { id: e.id, title: e.summary ?? "(no title)", date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, allDay: false, link: e.htmlLink };
          });
        return json({ events });
      }
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("gcal", String(body.action), (e as Error).message);
    if ((e as { expired?: boolean }).expired) await db.from("google_accounts").delete().eq("owner", user.id);
    return json({ error: (e as Error).message }, 502);
  }
});
