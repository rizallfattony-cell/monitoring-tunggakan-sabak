# Deploy Online

Aplikasi ini adalah web statis. Supabase dipakai untuk data online, sedangkan hosting publik dipakai agar halaman aplikasinya bisa dibuka dari jaringan mana pun.

## Pilihan Paling Mudah: Netlify Drop

1. Pastikan `supabase-config.js` sudah berisi URL dan anon key Supabase.
2. Buka https://app.netlify.com/drop
3. Login atau daftar Netlify.
4. Drag seluruh folder project ini ke halaman Netlify Drop.
5. Tunggu proses upload selesai.
6. Netlify akan memberi link seperti:

```text
https://nama-random.netlify.app
```

7. Buka link itu dari HP/laptop mana pun.
8. Klik **Login Online**.
9. Login memakai user Supabase.
10. Klik **Ambil Data Online** untuk memuat data.

## Pilihan Rapi Jangka Panjang: Vercel

1. Buat akun GitHub.
2. Upload folder project ini ke repository GitHub.
3. Buka https://vercel.com
4. Login dengan GitHub.
5. Klik **Add New Project**.
6. Pilih repository aplikasi ini.
7. Framework preset biarkan **Other**.
8. Build command kosongkan.
9. Output directory kosongkan atau isi `.`.
10. Klik **Deploy**.
11. Vercel akan memberi link seperti:

```text
https://monitoring-tunggakan-sabak.vercel.app
```

## Setelah Online

Perbaikan aktivasi premium/perangkat pada APK 1.7.5 dijelaskan di
`PREMIUM-ACTIVATION-1.7.5.md`. Terapkan step 22 dan step 23 sebelum mengaktifkan update wajib;
script publikasi versi 1.7.5 mengatur urutan tersebut otomatis.

Riwayat performa tunggakan pada dashboard dijelaskan di
`DASHBOARD-PERFORMANCE-HISTORY.md`. Snapshot bulanan baru disimpan ketika data
Saldo Akhir dipublikasikan; bulan lama yang tidak pernah diarsipkan tetap kosong.

Untuk riwayat cetak dan rekap pendapatan Android 1.7.4, ikuti
`RECEIPT-HISTORY-1.7.4.md`. Script publikasi menerapkan database terlebih dahulu,
kemudian mengunggah web/APK, memverifikasi hosting, baru mengaktifkan update wajib.

Untuk mengaktifkan rekap pembayaran Premium bulanan, jalankan sekali file
`supabase-schema-step-18-premium-payments.sql` di SQL Editor Supabase setelah migrasi Premium step 17.

Untuk APK 1.7.3 dengan pengingat per jam, paket baru dan rekening salin, ikuti
`PREMIUM-BILLING-1.7.3.md`. Setelah APK versi khusus tersedia di hosting,
jalankan `supabase-release-1.7.3.sql` melalui script PowerShell migrasi,
bukan langsung melalui SQL Editor (file release memakai perintah psql `\ir`).

Alur admin:

```text
Buka link online
Login Online
Upload DIL / Saldo Awal / Saldo Akhir
Simpan ke Online
```

Alur device lain:

```text
Buka link online
Login Online
Ambil Data Online
```

## Catatan Keamanan

File `supabase-config.js` boleh berisi anon/publishable key. Jangan pernah masukkan service role key ke aplikasi ini.

Kalau nanti user makin banyak, sebaiknya role dibuat lebih ketat:

```text
Admin: upload dan simpan data
Viewer: hanya lihat dan export
```
