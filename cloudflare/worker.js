const ALLOWED_ORIGIN = "https://sefayazgan.github.io";
const GITHUB_OWNER = "sefayazgan";
const GITHUB_REPO = "eystrendyol";
const EYS_PATH = "roko360/data/eys-dashboard.json";

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin), "Cache-Control": "no-store" }
  });
}
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const raw = atob(s);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function issueToken(secret) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    sub: "roko360-owner",
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return payload + "." + b64url(new Uint8Array(signature));
}
async function validToken(request, secret) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const parts = auth.slice(7).split(".");
  if (parts.length !== 2) return false;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(parts[1]), new TextEncoder().encode(parts[0]));
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    return payload.sub === "roko360-owner" && payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
async function getEysReport(env) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${EYS_PATH}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ROKO-360"
    }
  });
  if (!res.ok) throw new Error("GitHub report fetch failed: " + res.status);
  const file = await res.json();
  const bytes = Uint8Array.from(atob((file.content || "").replace(/\n/g, "")), c => c.charCodeAt(0));
  const report = JSON.parse(new TextDecoder().decode(bytes));
  if (report.schema_version !== 1 || !report.orders || !report.products) throw new Error("Invalid EYS report schema");
  return report;
}
async function handle(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const url = new URL(request.url);
  if (url.pathname === "/" && request.method === "GET") return json({ status: "ROKO 360 API online", database: Boolean(env.DB) }, 200, origin);
  if (url.pathname === "/api/login" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!env.APP_PASSWORD || body.password !== env.APP_PASSWORD) return json({ error: "Invalid login" }, 401, origin);
      return json({ token: await issueToken(env.SESSION_SECRET) }, 200, origin);
    } catch { return json({ error: "Invalid request" }, 400, origin); }
  }
  if (!await validToken(request, env.SESSION_SECRET)) return json({ error: "Unauthorized" }, 401, origin);
  if (url.pathname === "/api/eys" && request.method === "GET") {
    try { return json(await getEysReport(env), 200, origin); }
    catch { return json({ error: "EYS report could not be loaded" }, 502, origin); }
  }
  if (url.pathname === "/api/data" && request.method === "GET") {
    if (!env.DB) return json({ error: "Database binding DB is missing" }, 503, origin);
    const row = await env.DB.prepare("SELECT value, updated_at FROM app_state WHERE id = ?").bind("owner").first();
    return json({ data: row ? JSON.parse(row.value) : null, updated_at: row?.updated_at || null }, 200, origin);
  }
  if (url.pathname === "/api/data" && request.method === "PUT") {
    if (!env.DB) return json({ error: "Database binding DB is missing" }, 503, origin);
    const raw = await request.text();
    if (raw.length > 100000) return json({ error: "Payload too large" }, 413, origin);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400, origin); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid data" }, 400, origin);
    const allowed = ["tasks", "finance", "rnd", "investments", "research", "automations"];
    const data = {};
    for (const key of allowed) {
      const value = body[key] ?? [];
      if (!Array.isArray(value)) return json({ error: "Invalid " + key }, 400, origin);
      data[key] = value;
    }
    await env.DB.prepare("INSERT INTO app_state (id, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
      .bind("owner", JSON.stringify(data)).run();
    return json({ saved: true }, 200, origin);
  }
  return json({ error: "Not found" }, 404, origin);
}
export default { fetch: handle };
