import { ADMIN_HTML } from "./admin_html";

export interface Env {
  DB_OTP_MAIL: D1Database;
  VIEW_TOKEN: string;
  LOG_RETENTION_DAYS?: string;
  MAX_MESSAGES_PER_MAILBOX?: string;
  CF_API_TOKEN?: string;   // Cloudflare API token to list zones
  CF_ACCOUNT_ID?: string;  // Cloudflare Account ID (optional filter)
  // Admin auth (set via `wrangler secret put`)
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}

interface StoredMessage {
  id: number;
  recipient: string;
  sender: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  created_at: string;
}

interface EmailHeaders {
  get(name: string): string | null;
  entries(): IterableIterator<[string, string]>;
}

interface EmailMessage {
  to: string;
  from: string;
  headers: EmailHeaders;
  raw: ReadableStream;
  rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  reply(message: EmailMessage): void;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseReceivedAt(headers: EmailHeaders): string {
  const date = headers.get("Date");
  if (date) {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return nowIso();
}

function extractOriginalRecipient(headers: EmailHeaders): string | null {
  // X-ICLOUD-HME contains the original HME alias e.g. p=alias@icloud.com
  const hme = headers.get("X-ICLOUD-HME");
  if (hme) {
    const m = hme.match(/p=([^;\s]+@[^;\s]+)/);
    if (m) return m[1].trim().toLowerCase();
  }
  // iCloud Hide My Mail forwards keep the original To in most cases.
  const candidates = [
    headers.get("X-Original-To"),
    headers.get("Delivered-To"),
    headers.get("Envelope-To"),
    headers.get("X-Forwarded-To"),
    headers.get("To"),
    headers.get("Cc"),
  ];
  const found: string[] = [];
  for (const c of candidates) {
    if (!c || c === "Hide My Email") continue;
    for (const m of c.matchAll(/[A-Za-z0-9._%+=-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      found.push(m[0].trim().toLowerCase());
    }
  }
  // Prefer an iCloud alias (the HME address the user searches by)
  const icloud = found.find((e) => e.endsWith("@icloud.com") || e.endsWith("@privaterelay.appleid.com"));
  return icloud || found[0] || null;
}

function decodeQuotedPrintable(s: string, charset = "utf-8"): string {
  const noSoft = s.replace(/=\r?\n/g, ""); // soft line breaks (must be first)
  const bytes: number[] = [];
  for (let i = 0; i < noSoft.length; i++) {
    if (noSoft[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(noSoft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(noSoft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(noSoft.charCodeAt(i) & 0xff);
    }
  }
  return decodeBytes(new Uint8Array(bytes), charset);
}

function decodeBase64(s: string, charset = "utf-8"): string {
  // Remove ALL whitespace then strip any non-base64 chars (e.g. trailing MIME boundary fragments)
  const cleaned = s.replace(/\s/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  if (!cleaned) return "";
  // Fix padding
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return decodeBytes(bytes, charset);
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

// Decode RFC 2047 encoded-words in headers, e.g. =?UTF-8?B?...?= / =?UTF-8?Q?...?=
function decodeMimeWords(s: string): string {
  return s
    .replace(/\?=\s+=\?/g, "?==?") // join adjacent encoded-words
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset, enc, data) => {
      try {
        if (enc.toUpperCase() === "B") return decodeBase64(data, charset.toLowerCase());
        return decodeQuotedPrintable(data.replace(/_/g, " "), charset.toLowerCase());
      } catch {
        return match;
      }
    });
}

function stripHtmlTags(s: string): string {
  return s
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    // Preserve link targets: <a href="url">text</a> -> text [url]
    .replace(/<a\b[^>]*\bhref=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!label || label === href) return ` ${href} `;
      return ` ${label} [${href}] `;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseMimePart(part: string): { contentType: string; encoding: string; charset: string; body: string } {
  // Strip leading CRLF/LF that appears after boundary split
  const trimmedPart = part.replace(/^(\r?\n)+/, "");
  const headerEnd = trimmedPart.search(/\r?\n\r?\n/);
  if (headerEnd === -1) return { contentType: "", encoding: "", charset: "", body: trimmedPart };
  const headerSection = trimmedPart.slice(0, headerEnd).toLowerCase();
  const body = trimmedPart.slice(headerEnd).replace(/^\r?\n\r?\n/, "");
  const ctMatch = headerSection.match(/content-type:\s*([^;\r\n]+)/);
  const encMatch = headerSection.match(/content-transfer-encoding:\s*([^\r\n]+)/);
  const csMatch = headerSection.match(/charset="?([^"\r\n;]+)"?/);
  return {
    contentType: ctMatch ? ctMatch[1].trim() : "",
    encoding: encMatch ? encMatch[1].trim() : "",
    charset: csMatch ? csMatch[1].trim() : "",
    body,
  };
}

async function extractBodies(raw: ReadableStream): Promise<{ text: string; html: string }> {
  let text = "";
  let html = "";
  try {
    const reader = raw.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const rawBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      rawBytes.set(c, offset);
      offset += c.length;
    }
    const rawText = new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);

    // Find all boundaries (support nested multipart)
    const boundaryMatches = [...rawText.matchAll(/boundary="?([^"\r\n;]+)"?/gi)];
    if (boundaryMatches.length) {
      let parts: string[] = [rawText];
      for (const bm of boundaryMatches) {
        const boundary = "--" + bm[1].trim();
        parts = parts.flatMap((p) => p.split(boundary));
      }
      for (const part of parts) {
        const { contentType, encoding, charset, body } = parseMimePart(part);
        if (!contentType || contentType.startsWith("multipart/")) continue;
        let decoded = body;
        if (encoding === "quoted-printable") decoded = decodeQuotedPrintable(body, charset);
        else if (encoding === "base64") {
          try { decoded = decodeBase64(body, charset); } catch { decoded = body; }
        }
        if (contentType.includes("text/plain") && !text) {
          text = decoded.trim();
        } else if (contentType.includes("text/html") && !html) {
          html = decoded.trim();
        }
      }
      if (!text && html) text = stripHtmlTags(html);
    }

    // Non-multipart single-part email
    if (!text && !html) {
      const topEncMatch = rawText.match(/content-transfer-encoding:\s*([^\r\n]+)/i);
      const topEnc = topEncMatch ? topEncMatch[1].trim().toLowerCase() : "";
      const topCsMatch = rawText.match(/charset="?([^"\r\n;]+)"?/i);
      const topCharset = topCsMatch ? topCsMatch[1].trim() : "";
      const bodyStart = rawText.search(/\r?\n\r?\n/);
      let body = bodyStart !== -1 ? rawText.slice(bodyStart).replace(/^\r?\n\r?\n/, "") : rawText;
      if (topEnc === "quoted-printable") body = decodeQuotedPrintable(body, topCharset);
      else if (topEnc === "base64") {
        try { body = decodeBase64(body, topCharset); } catch (e) {
          // Last resort: try stripping everything to just base64 chars
          try {
            const b64only = body.replace(/\s/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
            if (b64only.length > 20) body = decodeBase64(b64only, topCharset);
          } catch { /* ignore */ }
        }
      }
      if (body.includes("<html") || body.includes("<!DOCTYPE") || body.includes("<div")) {
        html = body;
        text = stripHtmlTags(body);
      } else {
        text = body;
      }
    }
  } catch {
    // ignore parsing errors
  }
  return { text, html };
}

async function storeMessage(
  db: D1Database,
  recipient: string,
  sender: string,
  subject: string,
  bodyText: string,
  bodyHtml: string,
  receivedAt: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages (recipient, sender, subject, body_text, body_html, received_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      recipient.toLowerCase(),
      sender,
      subject,
      bodyText.length > 100_000 ? bodyText.slice(0, 100_000) : bodyText,
      bodyHtml.length > 100_000 ? bodyHtml.slice(0, 100_000) : bodyHtml,
      receivedAt,
    )
    .run();
}

async function cleanupOldMessages(db: D1Database, retentionDays: number): Promise<void> {
  try {
    await db
      .prepare(`DELETE FROM messages WHERE created_at < datetime('now', '-' || ? || ' days')`)
      .bind(retentionDays)
      .run();
  } catch {
    // best-effort cleanup
  }
}

async function handleEmail(message: EmailMessage, env: Env): Promise<void> {
  // Never reject: fall back to the actual envelope recipient so no mail is lost
  const recipient = extractOriginalRecipient(message.headers) || (message.to || "").trim().toLowerCase();
  if (!recipient) return;

  const subject = decodeMimeWords(message.headers.get("Subject") || "");
  const sender = decodeMimeWords(message.from || message.headers.get("From") || "");
  const receivedAt = parseReceivedAt(message.headers);
  const { text, html } = await extractBodies(message.raw);

  await storeMessage(env.DB_OTP_MAIL, recipient, sender, subject, text, html, receivedAt);

  // Cleanup old messages after each insert (best-effort)
  const retentionDays = parseInt(env.LOG_RETENTION_DAYS || "7", 10);
  if (!isNaN(retentionDays)) {
    await cleanupOldMessages(env.DB_OTP_MAIL, retentionDays);
  }
}

// URL query decoding turns unencoded '+' into spaces; spaces are invalid in
// email addresses, so map them back to support plus-addressing on any domain.
function normalizeMailbox(raw: string | null): string {
  return (raw || "").trim().replace(/ /g, "+").toLowerCase();
}

function authCheck(request: Request, url: URL, env: Env): boolean {
  const authHeader = request.headers.get("Authorization") || "";
  const queryToken = url.searchParams.get("token") || "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : queryToken;
  return !!(env.VIEW_TOKEN && provided === env.VIEW_TOKEN);
}

async function handleLogsRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const mailbox = normalizeMailbox(url.searchParams.get("mail"));
  if (!mailbox || !mailbox.includes("@")) {
    return errorResponse("Missing or invalid ?mail= parameter", 422);
  }
  if (!authCheck(request, url, env)) return errorResponse("Unauthorized", 401);

  // mode=latest → 1 message only; mode=full (default) → up to limit
  const mode = url.searchParams.get("mode") || "full";
  const maxLimit = parseInt(env.MAX_MESSAGES_PER_MAILBOX || "100", 10) || 100;
  const limit = mode === "latest" ? 1 : Math.min(
    parseInt(url.searchParams.get("limit") || "100", 10) || 100,
    maxLimit
  );

  try {
    const { results } = await env.DB_OTP_MAIL.prepare(
      `SELECT id, recipient, sender, subject, body_text, body_html, received_at, created_at
       FROM messages
       WHERE recipient = ?
       ORDER BY received_at DESC
       LIMIT ?`
    )
      .bind(mailbox, limit)
      .all<StoredMessage>();

    const messages = (results || []).map((m) => ({
      id: m.id,
      to: m.recipient,
      from: m.sender,
      subject: m.subject,
      bodyText: m.body_text,
      bodyHtml: m.body_html,
      text: m.body_text,
      html: m.body_html,
      date: m.received_at,
      receivedAt: m.received_at,
      created_at: m.created_at,
    }));

    return jsonResponse({ messages, mode, total: messages.length });
  } catch (err) {
    return errorResponse(`Database error: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}

// GET /zones — proxy Cloudflare API to list domains on the account
async function handleZonesRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "GET") return errorResponse("Method not allowed", 405);

  const url = new URL(request.url);
  if (!authCheck(request, url, env)) return errorResponse("Unauthorized", 401);

  if (!env.CF_API_TOKEN) return errorResponse("CF_API_TOKEN secret not configured on worker", 503);

  try {
    const cfUrl = env.CF_ACCOUNT_ID
      ? `https://api.cloudflare.com/client/v4/zones?account.id=${env.CF_ACCOUNT_ID}&per_page=200&status=active`
      : `https://api.cloudflare.com/client/v4/zones?per_page=200&status=active`;

    const res = await fetch(cfUrl, {
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const data: any = await res.json();
    if (!data.success) return errorResponse("Cloudflare API error: " + JSON.stringify(data.errors), 502);

    const zones = (data.result || []).map((z: any) => ({ id: z.id, name: z.name, status: z.status }));
    return jsonResponse({ zones });
  } catch (err) {
    return errorResponse(`Fetch error: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}

async function handleDeleteRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed. Use DELETE.", 405);
  }

  const url = new URL(request.url);
  if (!authCheck(request, url, env)) return errorResponse("Unauthorized", 401);

  const mailbox = normalizeMailbox(url.searchParams.get("mail"));

  try {
    if (mailbox && mailbox.includes("@")) {
      // Delete messages for a specific mailbox
      const result = await env.DB_OTP_MAIL.prepare(
        `DELETE FROM messages WHERE recipient = ?`
      ).bind(mailbox).run();
      return jsonResponse({
        deleted: true,
        mail: mailbox,
        rows_deleted: result.meta?.changes ?? 0,
      });
    } else {
      // Delete ALL messages (no mail param = nuke everything)
      const result = await env.DB_OTP_MAIL.prepare(`DELETE FROM messages`).run();
      return jsonResponse({
        deleted: true,
        mail: "all",
        rows_deleted: result.meta?.changes ?? 0,
      });
    }
  } catch (err) {
    return errorResponse(`Database error: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}

function extractOtpFromText(text: string | null): string | null {
  if (!text) return null;
  // Priority 1: explicit label near digits
  const labeled = text.match(/(?:code|otp|verification\s+code|passcode)[^\d]{0,30}(\d{4,8})/i);
  if (labeled) return labeled[1];
  // Priority 2: standalone digit line
  const standalone = text.match(/(?:^|\n)\s*(\d{4,8})\s*(?:\n|$)/m);
  if (standalone) return standalone[1];
  // Priority 3: digit block avoiding years and date context
  const dateLike = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}\/\d{1,2})/i;
  for (const m of [...text.matchAll(/\b(\d{4,8})\b/g)]) {
    const val = m[1];
    if (/^20[12]\d$/.test(val)) continue;
    const ctx = text.slice(Math.max(0, m.index! - 30), m.index! + val.length + 30);
    if (dateLike.test(ctx)) continue;
    return val;
  }
  return null;
}

async function handleOtpRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const mailbox = normalizeMailbox(url.searchParams.get("mail"));
  if (!mailbox || !mailbox.includes("@")) {
    return errorResponse("Missing or invalid ?mail= parameter", 422);
  }

  // Token auth
  const authHeader = request.headers.get("Authorization") || "";
  const queryToken = url.searchParams.get("token") || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : queryToken;
  if (!env.VIEW_TOKEN || providedToken !== env.VIEW_TOKEN) {
    return errorResponse("Unauthorized", 401);
  }

  // Optional: only consider emails received after this ISO timestamp
  const afterRaw = url.searchParams.get("after") || "";
  const afterIso = afterRaw ? new Date(afterRaw).toISOString() : null;

  // How many recent emails to scan for OTP (default 5, max 20)
  const scan = Math.min(parseInt(url.searchParams.get("scan") || "5", 10) || 5, 20);

  try {
    let query: string;
    let bindings: (string | number)[];
    if (afterIso && !isNaN(new Date(afterIso).getTime())) {
      query = `SELECT id, subject, body_text, body_html, received_at FROM messages
               WHERE recipient = ? AND received_at > ?
               ORDER BY received_at DESC LIMIT ?`;
      bindings = [mailbox, afterIso, scan];
    } else {
      query = `SELECT id, subject, body_text, body_html, received_at FROM messages
               WHERE recipient = ?
               ORDER BY received_at DESC LIMIT ?`;
      bindings = [mailbox, scan];
    }

    const { results } = await env.DB_OTP_MAIL.prepare(query)
      .bind(...bindings)
      .all<{ id: number; subject: string | null; body_text: string | null; body_html: string | null; received_at: string }>();

    for (const row of (results || [])) {
      const bodyText = row.body_text || "";
      const otp = extractOtpFromText(bodyText);
      if (otp) {
        return jsonResponse({
          otp,
          mail: mailbox,
          message_id: row.id,
          subject: row.subject,
          received_at: row.received_at,
        });
      }
    }

    return jsonResponse({ otp: null, mail: mailbox, message: "No OTP found in recent emails" }, 404);
  } catch (err) {
    return errorResponse(`Database error: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}

// ─────────────────────────────────────────────────────────────
// Address registration (log created address + creator IP)
// ─────────────────────────────────────────────────────────────
function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
    ""
  );
}

async function handleRegisterRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return errorResponse("Method not allowed. Use POST.", 405);

  const url = new URL(request.url);
  if (!authCheck(request, url, env)) return errorResponse("Unauthorized", 401);

  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const email = normalizeMailbox(typeof body?.email === "string" ? body.email : "");
  if (!email || !email.includes("@") || !email.includes(".")) {
    return errorResponse("Missing or invalid email", 422);
  }
  const domain = email.split("@")[1] || "";
  const ip = getClientIp(request);
  const ua = (request.headers.get("User-Agent") || "").slice(0, 300);

  try {
    await env.DB_OTP_MAIL.prepare(
      `INSERT INTO addresses (email, domain, ip, user_agent, created_at, last_seen, hits)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 1)
       ON CONFLICT(email) DO UPDATE SET
         ip = excluded.ip,
         user_agent = excluded.user_agent,
         last_seen = datetime('now'),
         hits = hits + 1`
    ).bind(email, domain, ip, ua).run();
    return jsonResponse({ ok: true, email });
  } catch (err) {
    return errorResponse(`Database error: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}

// ─────────────────────────────────────────────────────────────
// Admin: crypto / session / cookie helpers
// ─────────────────────────────────────────────────────────────
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromStr(s: string): string {
  return b64urlFromBytes(new TextEncoder().encode(s));
}
function strFromB64url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}
function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let r = 0;
  for (let i = 0; i < ea.length; i++) r |= ea[i] ^ eb[i];
  return r === 0;
}
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function makeSession(env: Env, user: string): Promise<string> {
  const payload = b64urlFromStr(JSON.stringify({ u: user, exp: Date.now() + SESSION_TTL_MS }));
  const sig = await hmacSign(env.SESSION_SECRET || "", payload);
  return payload + "." + sig;
}
async function verifySession(env: Env, token: string | null): Promise<{ u: string; exp: number } | null> {
  if (!token || !env.SESSION_SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = await hmacSign(env.SESSION_SECRET, payload);
  if (!constantTimeEqual(sig, expect)) return null;
  try {
    const o = JSON.parse(strFromB64url(payload));
    if (!o || typeof o.exp !== "number" || Date.now() > o.exp) return null;
    return o;
  } catch { return null; }
}
function parseCookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = request.headers.get("Cookie") || "";
  raw.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const ADMIN_COOKIE = "admin_session";
function sessionCookie(token: string, maxAgeSec: number): string {
  return `${ADMIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${maxAgeSec}`;
}
function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...(extra || {}),
  };
}
function adminJson(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: adminHeaders(extra) });
}

async function getAllowedIps(db: D1Database): Promise<string[]> {
  try {
    const row = await db.prepare(`SELECT value FROM admin_config WHERE key = 'allowed_ips'`).first<{ value: string }>();
    if (row && row.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string");
    }
  } catch { /* table may not exist yet */ }
  return [];
}
async function setAllowedIps(db: D1Database, ips: string[]): Promise<void> {
  await db.prepare(
    `INSERT INTO admin_config (key, value) VALUES ('allowed_ips', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(JSON.stringify(ips)).run();
}
async function adminSessionUser(request: Request, env: Env): Promise<string | null> {
  const token = parseCookies(request)[ADMIN_COOKIE] || null;
  const sess = await verifySession(env, token);
  return sess ? sess.u : null;
}

// ─────────────────────────────────────────────────────────────
// Admin router
// ─────────────────────────────────────────────────────────────
async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const ip = getClientIp(request);

  // IP allowlist (if configured) gates EVERYTHING under /admin, incl. the page + login.
  // Return 404 to avoid revealing that an admin surface exists.
  const allowed = await getAllowedIps(env.DB_OTP_MAIL);
  if (allowed.length && allowed.indexOf(ip) < 0) {
    return new Response("Not found", { status: 404 });
  }

  // Serve the admin SPA shell.
  if (path === "/admin" || path === "/admin/") {
    return new Response(ADMIN_HTML, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  const adminConfigured = !!(env.ADMIN_USERNAME && env.ADMIN_PASSWORD && env.SESSION_SECRET);

  // Login
  if (path === "/admin/login") {
    if (request.method !== "POST") return adminJson({ error: "Method not allowed" }, 405);
    if (!adminConfigured) return adminJson({ error: "Admin chưa được cấu hình trên worker" }, 503);

    // Rate limit: max 8 failed attempts / 15 min / IP
    try {
      const row = await env.DB_OTP_MAIL.prepare(
        `SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND ok = 0 AND at > datetime('now','-15 minutes')`
      ).bind(ip).first<{ c: number }>();
      if (row && row.c >= 8) {
        return adminJson({ error: "Quá nhiều lần thử. Vui lòng đợi 15 phút." }, 429);
      }
    } catch { /* table may not exist yet */ }

    let body: any = {};
    try { body = await request.json(); } catch { /* ignore */ }
    const user = typeof body?.username === "string" ? body.username : "";
    const pass = typeof body?.password === "string" ? body.password : "";
    const ok = constantTimeEqual(user, env.ADMIN_USERNAME || "") &&
               constantTimeEqual(pass, env.ADMIN_PASSWORD || "");

    try {
      await env.DB_OTP_MAIL.prepare(`INSERT INTO login_attempts (ip, ok) VALUES (?, ?)`).bind(ip, ok ? 1 : 0).run();
      await env.DB_OTP_MAIL.prepare(`DELETE FROM login_attempts WHERE at < datetime('now','-1 day')`).run();
    } catch { /* best effort */ }

    if (!ok) return adminJson({ error: "Sai tên đăng nhập hoặc mật khẩu" }, 401);

    const token = await makeSession(env, env.ADMIN_USERNAME || "admin");
    return adminJson({ ok: true, user: env.ADMIN_USERNAME }, 200, {
      "Set-Cookie": sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
    });
  }

  // Logout
  if (path === "/admin/logout") {
    return adminJson({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }

  // Session probe
  if (path === "/admin/api/session") {
    const user = await adminSessionUser(request, env);
    return adminJson({ authed: !!user, user: user || null, configured: adminConfigured });
  }

  // Everything below requires a valid session
  const user = await adminSessionUser(request, env);
  if (!user) return adminJson({ error: "Unauthorized" }, 401);

  if (path === "/admin/api/stats") {
    try {
      const q = async (sql: string) => (await env.DB_OTP_MAIL.prepare(sql).first<{ c: number }>())?.c ?? 0;
      const addresses_today = await q(`SELECT COUNT(*) AS c FROM addresses WHERE date(created_at) = date('now')`);
      const addresses_total = await q(`SELECT COUNT(*) AS c FROM addresses`);
      const messages_total = await q(`SELECT COUNT(*) AS c FROM messages`);
      const messages_today = await q(`SELECT COUNT(*) AS c FROM messages WHERE date(received_at) = date('now')`);
      return adminJson({ addresses_today, addresses_total, messages_total, messages_today });
    } catch (err) {
      return adminJson({ error: `Database error: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
  }

  if (path === "/admin/api/addresses") {
    try {
      const { results } = await env.DB_OTP_MAIL.prepare(
        `SELECT email, domain, ip, user_agent, created_at, last_seen, hits
         FROM addresses ORDER BY created_at DESC LIMIT 500`
      ).all();
      return adminJson({ rows: results || [] });
    } catch (err) {
      return adminJson({ error: `Database error: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
  }

  if (path === "/admin/api/messages") {
    if (request.method === "DELETE") {
      try {
        const result = await env.DB_OTP_MAIL.prepare(`DELETE FROM messages`).run();
        return adminJson({ deleted: true, rows_deleted: result.meta?.changes ?? 0 });
      } catch (err) {
        return adminJson({ error: `Database error: ${err instanceof Error ? err.message : String(err)}` }, 500);
      }
    }
    try {
      const { results } = await env.DB_OTP_MAIL.prepare(
        `SELECT id, recipient, sender, subject, body_text, body_html, received_at
         FROM messages ORDER BY received_at DESC LIMIT 500`
      ).all();
      return adminJson({ rows: results || [] });
    } catch (err) {
      return adminJson({ error: `Database error: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
  }

  if (path === "/admin/api/security") {
    if (request.method === "POST") {
      let body: any = {};
      try { body = await request.json(); } catch { /* ignore */ }
      const action = typeof body?.action === "string" ? body.action : "";
      let ips = await getAllowedIps(env.DB_OTP_MAIL);
      if (action === "add_current") {
        if (ip && ips.indexOf(ip) < 0) ips.push(ip);
      } else if (action === "remove") {
        const rm = typeof body?.ip === "string" ? body.ip : "";
        ips = ips.filter((x) => x !== rm);
      } else if (action === "clear") {
        ips = [];
      } else if (action === "set" && Array.isArray(body?.ips)) {
        ips = body.ips.filter((x: unknown) => typeof x === "string");
      } else {
        return adminJson({ error: "Hành động không hợp lệ" }, 400);
      }
      try {
        await setAllowedIps(env.DB_OTP_MAIL, ips);
      } catch (err) {
        return adminJson({ error: `Database error: ${err instanceof Error ? err.message : String(err)}` }, 500);
      }
      return adminJson({ ok: true, allowed_ips: ips, current_ip: ip });
    }
    return adminJson({ allowed_ips: allowed, current_ip: ip });
  }

  return adminJson({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, url);
    }
    if (url.pathname === "/register") {
      return handleRegisterRequest(request, env);
    }
    if (url.pathname === "/logs") {
      return handleLogsRequest(request, env);
    }
    if (url.pathname === "/otp") {
      return handleOtpRequest(request, env);
    }
    if (url.pathname === "/messages") {
      return handleDeleteRequest(request, env);
    }
    if (url.pathname === "/zones") {
      return handleZonesRequest(request, env);
    }
    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        worker: "read-icloud-mail-worker",
        endpoints: {
          "GET /logs": "?mail=&mode=latest|full&limit=&token=",
          "GET /otp": "?mail=&after=ISO&scan=5&token=",
          "POST /register": "{email} + token — log created address + IP",
          "DELETE /messages": "?mail= (omit for all)&token=",
          "GET /zones": "?token= — list Cloudflare domains",
          "GET /admin": "admin dashboard (login required)",
          "GET /health": "status check",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  },

  async email(message: EmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },
};
