// google redirects here after login. checked with the one-time state
import { admin, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } from "../_shared/google.ts";

const back = (to: string, result: string) => new Response(null, { status: 302, headers: { location: `${to}#/settings?google=${result}`, "cache-control": "no-store" } });
const plain = (msg: string, status = 400) => new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return plain("Invalid sign-in link. Go back to the app and try again.");

  const db = admin();
  const { data: row } = await db.from("oauth_states").select("owner, return_to, expires_at").eq("state", state).maybeSingle();
  await db.from("oauth_states").delete().eq("state", state); // one use only
  if (!row || new Date(row.expires_at) < new Date()) return plain("This sign-in link expired. Go back to the app and tap Connect again.");

  const code = url.searchParams.get("code");
  if (!code) return back(row.return_to, "cancelled");

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), redirect_uri: REDIRECT_URI(), grant_type: "authorization_code" }),
    });
    const tok = await res.json();
    if (!res.ok || !tok.refresh_token) return back(row.return_to, "error");
    if (!String(tok.scope ?? "").includes("calendar.events")) return back(row.return_to, "noscope");

    let email: string | null = null;
    try {
      const payload = JSON.parse(atob(String(tok.id_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      email = payload.email ?? null;
    } catch { /* email is optional */ }

    const { error } = await db.from("google_accounts").upsert({ owner: row.owner, email, refresh_token: tok.refresh_token, scopes: String(tok.scope ?? ""), connected_at: new Date().toISOString() });
    if (error) return back(row.return_to, "error");
    return back(row.return_to, "connected");
  } catch {
    return back(row.return_to, "error");
  }
});
