import test from "node:test";
import assert from "node:assert/strict";
import worker, { latestSourceVersion, normalizePetugasKey, normalizeRow } from "../src/index.js";

test("normalizes the compact offline row contract", () => {
  assert.deepEqual(normalizeRow({ idpel: 1439001, lembar: "2", rptag: "123456", stand_awal: 10 }), {
    petugas: "",
    idpel: "1439001",
    nama: "",
    tarif: "",
    daya: "",
    alamat: "",
    lembar: 2,
    kolok: "",
    koked: "",
    rptag: 123456,
    uploaded_at: "",
    stand_awal: "10",
    stand_akhir: "",
  });
});

test("uses the newest source upload as the snapshot source version", () => {
  assert.equal(latestSourceVersion([
    { uploaded_at: "2026-11-17T01:00:00Z" },
    { uploaded_at: "2026-11-17T03:00:00Z" },
    { uploaded_at: "2026-11-17T02:00:00Z" },
  ]), "2026-11-17T03:00:00Z");
});

test("normalizes officer names for staged packages", () => {
  assert.equal(normalizePetugasKey("  M.  Roby Mashrur "), "M. ROBY MASHRUR");
});

test("rejects snapshot access without a Supabase session", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/v1/manifest"),
    { MONALISA_ORIGIN: "https://monalisa-superweb.vercel.app" },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sesi login diperlukan." });
});

test("publishes full and per-officer KV snapshots with backward compatible metadata", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const values = new Map();
  const store = {
    async get(key, options) {
      const value = values.get(key);
      if (value == null) return null;
      if (options?.type === "arrayBuffer") return value;
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
  let activeProfile = { role: "admin", petugas: null };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "admin-user" });
    if (url.includes("/monitoring_profiles")) return Response.json([activeProfile]);
    if (url.includes("/monitoring_sync_offline_page")) {
      return Response.json([
        {
          petugas: "SUWARDI",
          idpel: "143900000001",
          nama: "PELANGGAN UJI",
          rptag: 125000,
          uploaded_at: "2026-11-17T08:00:00Z",
          stand_awal: "100",
          stand_akhir: "125",
        },
        {
          petugas: "ADRI",
          idpel: "143900000002",
          nama: "PELANGGAN LAIN",
          rptag: 225000,
          uploaded_at: "2026-11-17T08:00:00Z",
        },
      ]);
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const response = await worker.fetch(
      new Request("https://worker.test/v1/publish", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token", Origin: "https://monalisa-superweb.vercel.app" },
      }),
      {
        SUPABASE_URL: "https://supabase.test",
        SUPABASE_ANON_KEY: "anon",
        MONALISA_ORIGIN: "https://monalisa-superweb.vercel.app",
        OFFLINE_SNAPSHOTS: store,
      },
    );
    assert.equal(response.status, 201);
    const manifest = await response.json();
    assert.equal(manifest.count, 2);
    assert.equal(manifest.allCount, 2);
    assert.ok(values.has("manifests/latest.json"));

    const storedManifest = JSON.parse(values.get("manifests/latest.json"));
    assert.equal(storedManifest.schemaVersion, 2);
    assert.equal(storedManifest.packages.SUWARDI.count, 1);
    assert.equal(storedManifest.packages.ADRI.count, 1);

    const compressed = values.get(storedManifest.all.objectKey);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const snapshot = JSON.parse(await new Response(stream).text());
    assert.equal(snapshot.rows[0].idpel, "143900000001");
    assert.equal(snapshot.rows[0].stand_akhir, "125");

    activeProfile = { role: "petugas", petugas: "SUWARDI" };
    const officerManifestResponse = await worker.fetch(
      new Request("https://worker.test/v1/manifest", {
        headers: { Authorization: "Bearer officer-token" },
      }),
      {
        SUPABASE_URL: "https://supabase.test",
        SUPABASE_ANON_KEY: "anon",
        MONALISA_ORIGIN: "https://monalisa-superweb.vercel.app",
        OFFLINE_SNAPSHOTS: store,
      },
    );
    assert.equal(officerManifestResponse.status, 200);
    const officerManifest = await officerManifestResponse.json();
    assert.equal(officerManifest.ownCount, 1);
    assert.equal(officerManifest.allCount, 2);
    assert.match(officerManifest.ownDownloadPath, /scope=own/);

    const unchangedResponse = await worker.fetch(
      new Request("https://worker.test/v1/manifest", {
        headers: {
          Authorization: "Bearer officer-token",
          "If-None-Match": `"${manifest.version}"`,
        },
      }),
      {
        SUPABASE_URL: "https://supabase.test",
        SUPABASE_ANON_KEY: "anon",
        MONALISA_ORIGIN: "https://monalisa-superweb.vercel.app",
        OFFLINE_SNAPSHOTS: store,
      },
    );
    assert.equal(unchangedResponse.status, 304);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
