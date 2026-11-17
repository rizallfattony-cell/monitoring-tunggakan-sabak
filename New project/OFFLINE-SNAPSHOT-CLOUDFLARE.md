# Snapshot Offline Cloudflare KV

MONALISA tetap memakai Supabase untuk login, profil, data transaksi, realtime, dan histori. Paket sinkronisasi offline Android diterbitkan ke Cloudflare Workers KV agar setiap perangkat tidak mengunduh puluhan halaman data langsung dari Supabase.

## Alur

1. Admin mengunggah Saldo Akhir atau Stand Meter melalui web.
2. Web menyimpan tabel utama ke Supabase.
3. Worker membaca RPC `monitoring_sync_offline_page` satu kali dengan sesi admin.
4. Worker membuat satu JSON terkompresi gzip dan menyimpannya ke Workers KV.
5. APK memeriksa manifest kecil lalu mengunduh satu snapshot. Jika Worker gagal atau belum dikonfigurasi, APK otomatis memakai RPC Supabase lama.

## Konfigurasi

Worker berada di folder `cloudflare/offline-snapshot-worker`. Binding `OFFLINE_SNAPSHOTS` pada `wrangler.toml` mengarah ke namespace produksi dan preview yang sudah dibuat.

1. Jalankan `npm install` dan `npx wrangler login` bila komputer belum terhubung ke Cloudflare.
2. Jalankan `npm test`, lalu `npm run deploy`.
3. Salin URL Worker ke `offlineSnapshotUrl` di `supabase-config.js`.
4. Salin URL yang sama ke `OFFLINE_SNAPSHOT_URL` pada `SIMONTOK-Android-Admin/app/build.gradle.kts`.
5. Build APK percobaan. Update ini tidak perlu dijadikan wajib sampai uji lapangan selesai.

Endpoint snapshot tidak publik. Semua permintaan harus membawa sesi Supabase yang masih aktif; publikasi hanya diizinkan untuk profil admin. Workers KV Free menyediakan 1 GB penyimpanan dan batas 25 MiB per nilai, sehingga cocok untuk satu snapshot terkompresi. Worker menghapus versi lama setelah manifest baru tersimpan.
