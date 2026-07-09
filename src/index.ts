export interface Env {
  DB_OTP_MAIL: D1Database;
  VIEW_TOKEN: string;
  LOG_RETENTION_DAYS?: string;
  MAX_MESSAGES_PER_MAILBOX?: string;
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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
  ];
  for (const c of candidates) {
    if (c && c !== "Hide My Email") {
      const match = c.match(/<([^>]+)>/);
      const email = match ? match[1] : c;
      if (email.includes("@")) {
        return email.trim().toLowerCase();
      }
    }
  }
  return null;
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
  const bin = atob(s.replace(/\s/g, ""));
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
  const headerEnd = part.search(/\r?\n\r?\n/);
  if (headerEnd === -1) return { contentType: "", encoding: "", charset: "", body: part };
  const headerSection = part.slice(0, headerEnd).toLowerCase();
  const body = part.slice(headerEnd).replace(/^\r?\n\r?\n/, "");
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
        try { body = decodeBase64(body, topCharset); } catch { /* ignore */ }
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
  const recipient = extractOriginalRecipient(message.headers);
  if (!recipient) {
    message.setReject("Cannot determine original recipient");
    return;
  }

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
  const mailbox = (url.searchParams.get("mail") || "").trim().toLowerCase();
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

async function handleDeleteRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed. Use DELETE.", 405);
  }

  const url = new URL(request.url);
  if (!authCheck(request, url, env)) return errorResponse("Unauthorized", 401);

  const mailbox = (url.searchParams.get("mail") || "").trim().toLowerCase();

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
  const mailbox = (url.searchParams.get("mail") || "").trim().toLowerCase();
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/logs") {
      return handleLogsRequest(request, env);
    }
    if (url.pathname === "/otp") {
      return handleOtpRequest(request, env);
    }
    if (url.pathname === "/messages") {
      return handleDeleteRequest(request, env);
    }
    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        worker: "read-icloud-mail-worker",
        endpoints: {
          "GET /logs": "?mail=&mode=latest|full&limit=&token=",
          "GET /otp": "?mail=&after=ISO&scan=5&token=",
          "DELETE /messages": "?mail= (omit for all)&token=",
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
