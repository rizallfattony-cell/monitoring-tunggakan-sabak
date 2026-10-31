# Riwayat Performa Tunggakan Dashboard

Dashboard menyimpan agregat Saldo Awal dan Saldo Akhir per petugas untuk setiap bulan.
Riwayat dapat dilihat untuk keseluruhan petugas atau satu petugas dengan rentang satu,
tiga, empat, enam, atau dua belas bulan.

## Aturan Data

- Snapshot bulan ditentukan dari waktu upload Saldo Akhir dalam zona Asia/Jakarta.
- Upload ulang pada bulan yang sama memperbarui snapshot bulan itu, bukan menggandakan data.
- Pencapaian keseluruhan dihitung dari total rupiah, bukan rata-rata persentase 17 petugas.
- Bulan yang belum pernah dipublikasikan ditampilkan sebagai `Belum ada snapshot`, bukan nol.
- Admin dapat melihat seluruh petugas. Akun petugas hanya dapat membaca namanya sendiri.
- Tabel menyimpan agregat bulanan, bukan daftar pelanggan, sehingga tidak menggandakan database tunggakan.

## Aktivasi

Migrasi berada di `supabase-schema-step-23-debt-performance-history.sql` dan sudah dimasukkan
ke persiapan rilis 1.7.5. Jalankan dari folder workspace:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& ".\tools\publish-release-1.7.5.ps1"
```

Script meminta password database secara tersembunyi, menerapkan migrasi, mengunggah web dan APK,
memastikan marker web serta hash APK benar, lalu mengaktifkan rilis. Sesudah aktif, upload Saldo Akhir
atau klik Simpan ke Online untuk merekam snapshot bulan berjalan.

## Verifikasi

- PostgreSQL: upsert bulanan, agregasi tertimbang, rentang, bulan kosong, RLS dan pembatasan role.
- JavaScript: normalisasi data, ringkasan, grafik, dan penentuan bulan WIB.
- Chrome headless: 17 pilihan petugas, rentang 1/3/4/6/12 bulan, desktop dan mobile tanpa overflow halaman.
