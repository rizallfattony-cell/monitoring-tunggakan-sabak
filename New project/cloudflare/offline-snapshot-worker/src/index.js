const MANIFEST_KEY = "manifests/latest.json";
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
const AUTH_CACHE_SECONDS = 300;

export default {
  async fetch(request, env, ctx) {
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error("offline snapshot worker error", error);
      return jsonResponse({ error: error.message || "Layanan snapshot gagal." }, status, request, env);
    }
  },
};

export async function routeRequest(request, env, ctx) {
  if (request.method === "OPTIONS") return corsResponse(request, env);

  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return jsonResponse({ ok: true, service: "monalisa-offline-snapshot" }, 200, request, env);
  }

  if (url.pathname === "/v1/publish" && request.method === "POST") {
    const actor = await authenticate(request, env, ctx);
    if (actor.profile.role !== "admin") {
      return jsonResponse({ error: "Hanya admin yang dapat menerbitkan snapshot." }, 403, request, env);
    }
    return publishSnapshot(request, env, actor);
  }

  if (url.pathname === "/v1/manifest" && request.method === "GET") {
    const actor = await authenticate(request, env, ctx);
    const manifest = await readManifest(env);
    if (!manifest) return jsonResponse({ error: "Snapshot belum tersedia." }, 404, request, env);

    const etag = `"${manifest.version}"`;
    if (request.headers.get("If-None-Match") === etag) {
      const headers = corsHeaders(request, env);
      headers.set("Cache-Control", "private, max-age=30");
      headers.set("ETag", etag);
      return new Response(null, { status: 304, headers });
    }
    return jsonResponse(publicManifest(manifest, actor.profile), 200, request, env, {
      "Cache-Control": "private, max-age=30",
      ETag: etag,
    });
  }

  if (url.pathname === "/v1/snapshot" && request.method === "GET") {
    const actor = await authenticate(request, env, ctx);
    const manifest = await readManifest(env);
    const requestedVersion = url.searchParams.get("version") || "";
    if (!manifest || requestedVersion !== manifest.version) {
      return jsonResponse({ error: "Versi snapshot tidak ditemukan." }, 404, request, env);
    }

    const descriptor = selectPackage(manifest, actor.profile, url.searchParams.get("scope") || "all");
    if (!descriptor?.objectKey) {
      return jsonResponse({ error: "Paket snapshot tidak ditemukan." }, 404, request, env);
    }

    const etag = `"${descriptor.sha256}"`;
    if (request.headers.get("If-None-Match") === etag) {
      const headers = corsHeaders(request, env);
      headers.set("Cache-Control", "private, max-age=300");
      headers.set("ETag", etag);
      return new Response(null, { status: 304, headers });
    }

    const compressed = await env.OFFLINE_SNAPSHOTS.get(descriptor.objectKey, { type: "arrayBuffer" });
    if (!compressed) return jsonResponse({ error: "File snapshot tidak ditemukan." }, 404, request, env);

    const headers = corsHeaders(request, env);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Content-Encoding", "gzip");
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("ETag", etag);
    headers.set("X-Snapshot-Version", manifest.version);
    headers.set("X-Snapshot-Scope", url.searchParams.get("scope") === "own" ? "own" : "all");
    return new Response(compressed, { status: 200, headers });
  }

  return jsonResponse({ error: "Endpoint tidak ditemukan." }, 404, request, env);
}

async function authenticate(request, env, ctx) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Sesi login diperlukan.");

  const edgeCache = globalThis.caches?.default;
  const cacheKey = edgeCache
    ? new Request(`https://monalisa-auth-cache.internal/${await sha256Hex(authorization)}`)
    : null;
  if (edgeCache && cacheKey) {
    const cached = await edgeCache.match(cacheKey);
    if (cached) {
      const actor = await cached.json();
      return { ...actor, token: authorization };
    }
  }

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

  const cachedActor = {
    user: { id: String(user.id || "") },
    profile: {
      role: String(profiles[0].role || ""),
      petugas: profiles[0].petugas == null ? null : String(profiles[0].petugas),
    },
  };
  if (edgeCache && cacheKey) {
    const cacheWrite = edgeCache.put(
      cacheKey,
      new Response(JSON.stringify(cachedActor), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${AUTH_CACHE_SECONDS}`,
        },
      }),
    );
    if (ctx?.waitUntil) ctx.waitUntil(cacheWrite);
    else await cacheWrite;
  }
  return { ...cachedActor, token: authorization };
}

async function publishSnapshot(request, env, actor) {
  const previousManifest = await readManifest(env);
  const rows = await fetchOfflineRows(env, actor.token);
  const generatedAt = new Date().toISOString();
  const sourceVersion = latestSourceVersion(rows) || generatedAt;

  const allPackage = await createSnapshotPackage(rows, sourceVersion, generatedAt);
  const version = `${safeVersion(sourceVersion)}-${allPackage.sha256.slice(0, 12)}`;
  const all = packageDescriptor(allPackage, `snapshots/${version}/all.json.gz`);

  const groupedRows = new Map();
  for (const row of rows) {
    const key = normalizePetugasKey(row.petugas);
    if (!key) continue;
    const group = groupedRows.get(key) || [];
    group.push(row);
    groupedRows.set(key, group);
  }

  const packageEntries = await Promise.all(
    [...groupedRows.entries()].map(async ([key, group]) => {
      const snapshotPackage = await createSnapshotPackage(group, sourceVersion, generatedAt);
      const objectKey = `snapshots/${version}/officers/${encodeURIComponent(key)}.json.gz`;
      return [key, packageDescriptor(snapshotPackage, objectKey), snapshotPackage.compressed];
    }),
  );
  const packages = Object.fromEntries(packageEntries.map(([key, descriptor]) => [key, descriptor]));

  await Promise.all([
    env.OFFLINE_SNAPSHOTS.put(all.objectKey, allPackage.compressed),
    ...packageEntries.map(([, descriptor, compressed]) =>
      env.OFFLINE_SNAPSHOTS.put(descriptor.objectKey, compressed)),
  ]);

  const manifest = {
    schemaVersion: 2,
    version,
    sourceVersion,
    generatedAt,
    all,
    packages,
  };
  await env.OFFLINE_SNAPSHOTS.put(MANIFEST_KEY, JSON.stringify(manifest));
  await cleanupOldPackages(env, previousManifest, manifest);

  return jsonResponse(publicManifest(manifest, actor.profile), 201, request, env, {
    "Cache-Control": "no-store",
    ETag: `"${manifest.version}"`,
  });
}

async function createSnapshotPackage(rows, sourceVersion, generatedAt) {
  const snapshot = JSON.stringify({
    schemaVersion: 1,
    version: sourceVersion,
    generatedAt,
    count: rows.length,
    rows,
  });
  const [sha256, compressed] = await Promise.all([sha256Hex(snapshot), gzipText(snapshot)]);
  return {
    count: rows.length,
    sha256,
    bytes: compressed.byteLength,
    compressed,
  };
}

function packageDescriptor(snapshotPackage, objectKey) {
  return {
    count: snapshotPackage.count,
    sha256: snapshotPackage.sha256,
    bytes: snapshotPackage.bytes,
    objectKey,
  };
}

async function cleanupOldPackages(env, previousManifest, nextManifest) {
  if (!previousManifest) return;
  const nextKeys = new Set(manifestObjectKeys(nextManifest));
  const staleKeys = manifestObjectKeys(previousManifest).filter((key) => !nextKeys.has(key));
  await Promise.all(staleKeys.map(async (key) => {
    try {
      await env.OFFLINE_SNAPSHOTS.delete(key);
    } catch (error) {
      console.warn("old snapshot cleanup failed", error);
    }
  }));
}

function manifestObjectKeys(manifest) {
  const keys = new Set();
  if (manifest?.objectKey) keys.add(manifest.objectKey);
  if (manifest?.all?.objectKey) keys.add(manifest.all.objectKey);
  for (const descriptor of Object.values(manifest?.packages || {})) {
    if (descriptor?.objectKey) keys.add(descriptor.objectKey);
  }
  return [...keys];
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
      throw new HttpError(
        response.status === 401 ? 401 : 502,
        `Supabase gagal menyiapkan snapshot: ${detail || response.status}`,
      );
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

export function normalizePetugasKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
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

function legacyAllDescriptor(manifest) {
  if (manifest?.all?.objectKey) return manifest.all;
  if (!manifest?.objectKey) return null;
  return {
    count: manifest.count,
    sha256: manifest.sha256,
    bytes: manifest.bytes,
    objectKey: manifest.objectKey,
  };
}

function selectPackage(manifest, profile, scope) {
  const all = legacyAllDescriptor(manifest);
  if (scope !== "own" || profile?.role === "admin") return all;
  const key = normalizePetugasKey(profile?.petugas);
  return manifest?.packages?.[key] || all;
}

function publicManifest(manifest, profile) {
  const all = legacyAllDescriptor(manifest);
  const own = selectPackage(manifest, profile, "own") || all;
  const allPath = `/v1/snapshot?version=${encodeURIComponent(manifest.version)}&scope=all`;
  const ownPath = `/v1/snapshot?version=${encodeURIComponent(manifest.version)}&scope=own`;
  return {
    schemaVersion: manifest.schemaVersion || 1,
    version: manifest.version,
    sourceVersion: manifest.sourceVersion,
    generatedAt: manifest.generatedAt,
    count: all?.count || 0,
    sha256: all?.sha256 || "",
    bytes: all?.bytes || 0,
    downloadPath: allPath,
    allCount: all?.count || 0,
    allSha256: all?.sha256 || "",
    allBytes: all?.bytes || 0,
    allDownloadPath: allPath,
    ownCount: own?.count || 0,
    ownSha256: own?.sha256 || "",
    ownBytes: own?.bytes || 0,
    ownDownloadPath: ownPath,
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
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-None-Match");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "ETag, X-Snapshot-Version, X-Snapshot-Scope");
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
