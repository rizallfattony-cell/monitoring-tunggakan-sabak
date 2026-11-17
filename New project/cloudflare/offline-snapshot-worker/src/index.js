const MANIFEST_KEY = "manifests/latest.json";
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error("offline snapshot worker error", error);
      return jsonResponse({ error: error.message || "Layanan snapshot gagal." }, status, request, env);
    }
  },
};

export async function routeRequest(request, env) {
  if (request.method === "OPTIONS") return corsResponse(request, env);

  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return jsonResponse({ ok: true, service: "monalisa-offline-snapshot" }, 200, request, env);
  }

  if (url.pathname === "/v1/publish" && request.method === "POST") {
    const actor = await authenticate(request, env);
    if (actor.profile.role !== "admin") {
      return jsonResponse({ error: "Hanya admin yang dapat menerbitkan snapshot." }, 403, request, env);
    }
    return publishSnapshot(request, env, actor.token);
  }

  if (url.pathname === "/v1/manifest" && request.method === "GET") {
    await authenticate(request, env);
    const manifest = await readManifest(env);
    if (!manifest) return jsonResponse({ error: "Snapshot belum tersedia." }, 404, request, env);
    return jsonResponse(publicManifest(manifest), 200, request, env, { "Cache-Control": "no-store" });
  }

  if (url.pathname === "/v1/snapshot" && request.method === "GET") {
    await authenticate(request, env);
    const manifest = await readManifest(env);
    const requestedVersion = url.searchParams.get("version") || "";
    if (!manifest || requestedVersion !== manifest.version) {
      return jsonResponse({ error: "Versi snapshot tidak ditemukan." }, 404, request, env);
    }
    const compressed = await env.OFFLINE_SNAPSHOTS.get(manifest.objectKey, { type: "arrayBuffer" });
    if (!compressed) return jsonResponse({ error: "File snapshot tidak ditemukan." }, 404, request, env);

    const headers = corsHeaders(request, env);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Content-Encoding", "gzip");
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("ETag", `"${manifest.sha256}"`);
    headers.set("X-Snapshot-Version", manifest.version);
    return new Response(compressed, { status: 200, headers });
  }

  return jsonResponse({ error: "Endpoint tidak ditemukan." }, 404, request, env);
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Sesi login diperlukan.");

  const userResponse = await fetch(`${trimSlash(env.SUPABASE_URL)}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: authorization,
    },
  });
  if (!userResponse.ok) throw new HttpError(401, "Sesi login tidak valid atau sudah habis.");
  const user = await userResponse.json();

  const profileUrl = new URL(`${trimSlash(env.SUPABASE_URL)}/rest/v1/monitoring_profiles`);
  profileUrl.searchParams.set("select", "role,petugas");
  profileUrl.searchParams.set("user_id", `eq.${user.id}`);
  profileUrl.searchParams.set("limit", "1");
  const profileResponse = await fetch(profileUrl, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: authorization,
      Accept: "application/json",
    },
  });
  if (!profileResponse.ok) throw new HttpError(403, "Profil MONALISA tidak dapat diperiksa.");
  const profiles = await profileResponse.json();
  if (!profiles.length || !["admin", "petugas"].includes(profiles[0].role)) {
    throw new HttpError(403, "Akun tidak memiliki akses snapshot aplikasi.");
  }
  return { user, profile: profiles[0], token: authorization };
}

async function publishSnapshot(request, env, authorization) {
  const previousManifest = await readManifest(env);
  const rows = await fetchOfflineRows(env, authorization);
  const generatedAt = new Date().toISOString();
  const sourceVersion = latestSourceVersion(rows) || generatedAt;
  const snapshot = JSON.stringify({
    schemaVersion: 1,
    version: sourceVersion,
    generatedAt,
    count: rows.length,
    rows,
  });
  const sha256 = await sha256Hex(snapshot);
  const version = `${safeVersion(sourceVersion)}-${sha256.slice(0, 12)}`;
  const objectKey = `snapshots/${version}.json.gz`;
  const compressed = await gzipText(snapshot);

  await env.OFFLINE_SNAPSHOTS.put(objectKey, compressed);

  const manifest = {
    schemaVersion: 1,
    version,
    sourceVersion,
    generatedAt,
    count: rows.length,
    sha256,
    bytes: compressed.byteLength,
    objectKey,
  };
  await env.OFFLINE_SNAPSHOTS.put(MANIFEST_KEY, JSON.stringify(manifest));
  if (previousManifest?.objectKey && previousManifest.objectKey !== objectKey) {
    try {
      await env.OFFLINE_SNAPSHOTS.delete(previousManifest.objectKey);
    } catch (error) {
      console.warn("old snapshot cleanup failed", error);
    }
  }

  return jsonResponse(publicManifest(manifest), 201, request, env, { "Cache-Control": "no-store" });
}

async function fetchOfflineRows(env, authorization) {
  const rowsByIdpel = new Map();
  let offset = 0;
  while (true) {
    const response = await fetch(`${trimSlash(env.SUPABASE_URL)}/rest/v1/rpc/monitoring_sync_offline_page`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_offset: offset, p_limit: PAGE_SIZE }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new HttpError(response.status === 401 ? 401 : 502, `Supabase gagal menyiapkan snapshot: ${detail || response.status}`);
    }
    const page = await response.json();
    for (const row of page) {
      const idpel = String(row.idpel || "").trim();
      if (idpel) rowsByIdpel.set(idpel, normalizeRow(row));
    }
    if (rowsByIdpel.size > MAX_ROWS) throw new HttpError(413, "Jumlah data melewati batas pengaman 50.000 IDPEL.");
    if (page.length < PAGE_SIZE) break;
    offset += page.length;
  }
  return [...rowsByIdpel.values()];
}

export function normalizeRow(row) {
  return {
    petugas: String(row.petugas || ""),
    idpel: String(row.idpel || ""),
    nama: String(row.nama || ""),
    tarif: String(row.tarif || ""),
    daya: String(row.daya || ""),
    alamat: String(row.alamat || ""),
    lembar: Number(row.lembar || 0),
    kolok: String(row.kolok || ""),
    koked: String(row.koked || ""),
    rptag: Number(row.rptag || 0),
    uploaded_at: String(row.uploaded_at || ""),
    stand_awal: String(row.stand_awal || ""),
    stand_akhir: String(row.stand_akhir || ""),
  };
}

export function latestSourceVersion(rows) {
  return rows.reduce((latest, row) => {
    const value = String(row.uploaded_at || "");
    return value > latest ? value : latest;
  }, "");
}

async function readManifest(env) {
  const raw = await env.OFFLINE_SNAPSHOTS.get(MANIFEST_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function publicManifest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    version: manifest.version,
    sourceVersion: manifest.sourceVersion,
    generatedAt: manifest.generatedAt,
    count: manifest.count,
    sha256: manifest.sha256,
    bytes: manifest.bytes,
    downloadPath: `/v1/snapshot?version=${encodeURIComponent(manifest.version)}`,
  };
}

async function gzipText(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function safeVersion(value) {
  return String(value).replace(/[^0-9A-Za-z._-]+/g, "-").replace(/^-+|-+$/g, "") || "snapshot";
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.MONALISA_ORIGIN || "").trim();
  if (!origin) return configured || "*";
  if (!configured || origin === configured) return origin;
  return configured;
}

function corsHeaders(request, env) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", allowedOrigin(request, env));
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Vary", "Origin");
  return headers;
}

function corsResponse(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function jsonResponse(payload, status, request, env, extraHeaders = {}) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(payload), { status, headers });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
