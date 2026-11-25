// google calendar + gmail helpers (server side only, tokens stay here)
import { createClient } from "jsr:@supabase/supabase-js@2";

export const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export const CLIENT_ID = () => Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
export const CLIENT_SECRET = () => Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
export const REDIRECT_URI = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/gcal-callback`;
export const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send";
export const canEmail = (scopes?: string | null) => String(scopes ?? "").includes("gmail.send");
export const TZ = "Asia/Kuala_Lumpur";

// whose shop this person works on (their own, or the owner they were added to)
export async function shopOwnerOf(db: ReturnType<typeof admin>, userId: string) {
  const { data } = await db.from("team_members").select("owner").eq("member", userId).maybeSingle();
  return (data?.owner as string) ?? userId;
}

// only redirect back to localhost or my live site
export function safeReturn(url: string) {
  try {
    const u = new URL(url);
    const allowed = (Deno.env.get("ALLOWED_ORIGIN") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const local = (u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.protocol === "http:";
    if (local || allowed.includes(u.origin)) return u.origin + u.pathname;
  } catch { /* fall through */ }
  return null;
}

export async function accessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  if (!res.ok) {
    const e = new Error(data.error === "invalid_grant" ? "Google access expired. Reconnect Google Calendar in Settings." : `Google sign-in error: ${data.error ?? res.status}`);
    (e as Error & { expired?: boolean }).expired = data.error === "invalid_grant";
    throw e;
  }
  return data.access_token as string;
}

export async function gapi(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204 || res.status === 410) return null; // already deleted
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}: ${data.error?.message ?? ""}`.trim());
  return data;
}

type Task = { id: string; title: string; due_date: string; due_time?: string | null; notes?: string | null; kind?: string; done?: boolean };

const LABELS: Record<string, string> = { MEETUP: "Meetup", LISTING: "Listing", THREADS: "Threads", SOURCING: "Sourcing", CALENDAR: "Event" };

// task -> calendar event (1 hour, or all day if no time)
export function toEvent(t: Task) {
  const summary = (t.done ? "✓ " : "") + String(t.title).slice(0, 200);
  const description = `${LABELS[t.kind ?? ""] ?? "Task"} · Reloved.Market${t.notes ? "\n" + String(t.notes).slice(0, 500) : ""}`;
  const base = { summary, description, extendedProperties: { private: { reloved_task: t.id } } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due_date)) throw new Error("Bad date");
  if (t.due_time && /^\d{2}:\d{2}/.test(t.due_time)) {
    const [h, m] = t.due_time.split(":").map(Number);
    const endH = Math.min(h + 1, 23), endM = h + 1 > 23 ? 59 : m;
    const p = (n: number) => String(n).padStart(2, "0");
    return { ...base, start: { dateTime: `${t.due_date}T${p(h)}:${p(m)}:00`, timeZone: TZ }, end: { dateTime: `${t.due_date}T${p(endH)}:${p(endM)}:00`, timeZone: TZ } };
  }
  const next = new Date(t.due_date + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
  return { ...base, start: { date: t.due_date }, end: { date: next.toISOString().slice(0, 10) } };
}

// today in malaysia time
export const todayMY = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const b64url = (bytes: Uint8Array) => {
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64 = (s: string) => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };

// send email from my gmail
export async function sendGmail(token: string, to: string, subject: string, html: string) {
  if (!/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(to)) throw new Error("Bad email address");
  const body = b64(html).replace(/.{76}/g, "$&\r\n");
  const mime = [`To: ${to}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body].join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: b64url(new TextEncoder().encode(mime)) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail error ${res.status}: ${data.error?.message ?? ""}`.trim());
  return data.id as string;
}
