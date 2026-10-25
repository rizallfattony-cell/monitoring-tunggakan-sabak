# Pembaruan Pengingat Tagihan APK

Versi terbaru adalah 1.7.3. Ikuti `PREMIUM-BILLING-1.7.3.md` untuk pengingat per jam,
paket baru dan rekening salin. Instruksi 1.7.2 di bawah disimpan sebagai riwayat;
jangan gunakan script 1.7.2 setelah migrasi paket baru.

## Status

Backend step 19 dan integrasi APK 1.7.2 disiapkan dari folder
`SIMONTOK-Android-Admin` yang dikonfirmasi pengguna. Konfigurasi APK diperbarui ke
Supabase baru dan versionCode 11. Jangan menaikkan minimum_version sebelum APK
baru berhasil dibangun, diuji, dan tersedia di hosting.

Verifikasi APK 1.7.2:

- Build APK dan paket tes berhasil.
- Sembilan unit test cache/validasi status lulus.
- Tiga tes emulator lulus: pengingat bisa ditutup, gagal verifikasi tidak
  memberikan akses, dan kunci menolak Back lalu terbuka setelah cek status lunas.
- Seluruh tes PostgreSQL lokal untuk migrasi dan aktivasi rilis lulus.
- Sertifikat penandatangan sama dengan APK 1.7.1 (pembaruan tanpa uninstall).
- SHA-256 APK: `86AC5293C2BBAAF7CB4EC7F97BC5312AA809D1602EE03B55B4AA5BAD316D4D03`.
- Database produksi belum diubah otomatis; aktivasi memerlukan password admin
  melalui script di bagian Penerapan.

## Aturan

- Waktu penagihan menggunakan tanggal server Asia/Jakarta, bukan jam HP.
- Tanggal 1-19: tidak ada pengingat tagihan bulan berjalan.
- Tanggal 20 sampai sebelum tiga hari terakhir: popup bisa ditutup.
- Tiga hari terakhir: seluruh fitur operasional dikunci jika belum dibayar.
- Oktober 2026 dikunci mulai tanggal 29; November mulai tanggal 28.
- Februari 28 hari dikunci mulai tanggal 26; Februari kabisat mulai tanggal 27.
- Tagihan yang masih tertunggak tetap mengunci setelah pergantian bulan.
- Setelah admin menyimpan pembayaran di web, cek ulang dari APK akan membuka akses
  jika tidak ada tagihan lain yang masih menyebabkan penguncian.
- Nominal mengikuti snapshot paket pada rekap bulanan, bukan Rp50.000 tetap.
- Akun admin dan akun FREE tidak dikenai aturan penagihan ini.
- Data lama tidak dihapus; step 19 tidak otomatis mengubah status lunas.

## Kontrak APK

Panggil POST `/rest/v1/rpc/get_my_premium_billing_status` dengan body `{}`,
publishable key aplikasi dan Authorization Bearer dari sesi pengguna.
Jangan mengirim user_id atau tanggal HP; RPC menentukan keduanya sendiri.

Respons memiliki `enrolled`, `billing_month`, `package_code`, `amount`,
`due_start`, `due_end`, `lock_start`, `paid_at`, `should_remind`,
`access_blocked`, `reason`, `server_date`, `server_now`, `server_now_ms`,
`next_check_at` dan `next_check_at_ms`.
Akun yang dikecualikan hanya mendapat status akses serta waktu server.

Perilaku integrasi APK:

1. Cek setelah login, saat aplikasi kembali aktif, serta saat lewat batas
   `next_check_at` (tengah malam WIB) selama aplikasi terbuka.
2. Letakkan gate pada root aplikasi; saat terkunci jangan compose layar operasional
   atau dialog operasional di belakangnya. Tombol Back tidak boleh menutup gate.
3. Popup menampilkan bulan tagihan, nominal sebenarnya, batas pembayaran,
   tombol konfirmasi manual ke admin dan tombol cek status pembayaran.
   WhatsApp admin: +6285783042643 (dikonfirmasi pengguna).
   QRIS yang sudah ada tetap tersedia pada menu Status Premium.
4. Popup pengingat bisa ditutup; popup penguncian tidak bisa ditutup.
   Logout dan konfirmasi/cek pembayaran tetap tersedia.
5. Jangan menafsirkan timeout/gagal server sebagai lunas. Status kunci yang sudah
   diketahui tetap berlaku ketika offline. Cache izin akses tidak boleh dipakai
   melewati `next_check_at`; verifikasi online diperlukan saat cache kedaluwarsa.
   Cache menggunakan elapsedRealtime dan identitas boot, bukan jam/tanggal HP.
6. Setelah migrasi dan APK lolos tes, barulah rilis APK dengan versionCode lebih
   tinggi dan aktifkan update wajib agar APK lama tidak melewati aturan baru.

## Penerapan

Setelah APK tersedia di hosting, jalankan sekali dari folder workspace:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& ".\tools\apply-premium-admin.ps1" -MigrationFile ".\.deploy-repo\New project\supabase-release-1.7.2.sql"
```

File release menerapkan step 19, lalu mengaktifkan update wajib 1.7.2 dengan URL
APK versi spesifik. Masukkan password database baru hanya saat diminta script.
Jangan aktifkan file release sebelum URL APK versi 1.7.2 dapat diunduh.

Tidak ada password atau secret key yang perlu dikirim ke chat.

Step 19 juga memperbolehkan pembayaran lewat bulan dicatat dengan tanggal
sebenarnya: sejak tanggal 20 bulan tagihan sampai hari ini WIB, tidak di masa depan.
Kontrol tanggal pada web juga disesuaikan agar pembayaran lewat bulan bisa dicatat.

## Tes Lokal

Jalankan container tanpa jaringan dan mount folder project sebagai read-only:

```powershell
docker run --rm --network none --user postgres --mount "type=bind,source=C:/Users/rizal/OneDrive/Documents/New project/.deploy-repo/New project,target=/project,readonly" --entrypoint /bin/sh public.ecr.aws/supabase/postgres:17.11.0.004 /project/tests/run-premium-billing.sh
```

Tes membuat PostgreSQL kosong sementara. Tidak terhubung ke produksi dan seluruh
data pengujian dibuang ketika container selesai.
