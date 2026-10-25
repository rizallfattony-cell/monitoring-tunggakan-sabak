# SIMONTOK 1.7.3

## Perubahan

- Pengingat muncul sekali pada pembukaan sesi aplikasi baru, kemudian minimal
  satu jam sejak pengingat ditutup. Pergantian layar, rotasi, refresh data,
  dan kembali dari WhatsApp tidak mereset waktu pengingat.
- Pengingat tidak ditumpuk ketika popup atau pilihan rekening masih terbuka.
- Penguncian tiga hari terakhir tetap berlaku sampai pembayaran dikonfirmasi admin.
- Tombol Cek Status Pembayaran dihapus. Status diperiksa otomatis saat kembali
  ke aplikasi, setiap lima menit ketika aktif, dan saat pergantian hari WIB.
- Tombol BAYAR berada di atas Konfirmasi ke Admin dan membuka daftar rekening salin.
- P1/P2/P3 lama diganti menjadi SIMONTOK PREMIUM. Admin juga bisa memilih BILLMAN PRO.
- Kedua paket Rp50.000. Tagihan bulan berjalan yang belum lunas mengikuti tarif baru;
  nominal, tanggal, dan status pembayaran yang sudah lunas tidak diubah.
- Riwayat sebelum bulan berjalan tidak diubah.

## Rekening

Semua a.n. RIZAL FATONI:

| Metode | Nomor |
| --- | --- |
| DANA | 085783042643 |
| BRI | 220701016142501 |
| BNI | 0796885247 |
| MANDIRI | 1100010691225 |

Tombol salin menyalin nomor sebagai teks agar nol di depan tetap utuh.
Konfirmasi membuka draf WhatsApp admin, tidak menandai tagihan sebagai lunas.

## Aktivasi

Pastikan APK versi 1.7.3 sudah tersedia di hosting dan Docker Desktop berjalan.
Dari PowerShell pada folder workspace `New project`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& ".\tools\apply-premium-admin.ps1" -MigrationFile ".\.deploy-repo\New project\supabase-release-1.7.3.sql"
```

Masukkan password database baru hanya ketika diminta script. File release menerapkan
migrasi paket step 20 dan mengaktifkan update wajib 1.7.3. Jika step 19 belum tersedia,
script menerapkannya lebih dahulu. Menjalankan ulang script yang sama tidak menggandakan
tagihan atau mengubah pembayaran yang sudah lunas.

Unduh `https://simontok-superweb.vercel.app/SIMONTOK-v1.7.3.apk` setelah migrasi berhasil.
Tidak perlu uninstall aplikasi sebelumnya. Gunakan script 1.7.3, bukan script 1.7.2.

## Verifikasi

- 15 unit test lulus, termasuk interval satu jam dan nomor rekening tepat.
- 4 tes emulator lulus, termasuk siklus background/foreground Android, urutan tombol,
  salin rekening, dan pembukaan akses otomatis setelah lunas.
- Tes PostgreSQL lokal lulus untuk migrasi nama, harga, riwayat lunas, hak akses,
  rekap admin dan penerapan ulang migrasi.
- SHA-256 APK: `5A914E77BE5232549D125427BB971E33E3FFD987F681B63F64F3656A1D63F700`.
- Aktivasi produksi tetap memerlukan password admin melalui script di atas.
