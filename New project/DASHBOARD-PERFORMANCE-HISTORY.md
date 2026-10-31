# Dashboard Performa Tunggakan Harian

Dashboard mengambil data dari menu **Upload Saldo Harian**. File Excel tunggakan yang
diunggah pada menu ini hanya memperbarui dashboard performa dan tidak mempublikasikan
data tunggakan ke aplikasi petugas.

Dashboard menyediakan tampilan keseluruhan unit dan detail per petugas, perbandingan
dua bulan, grafik saldo harian, leaderboard 17 petugas, serta riwayat satu, tiga, empat,
enam, atau dua belas bulan.

## Aturan Data

- Admin memilih tanggal data sebelum mengunggah file tunggakan harian.
- Upload ulang pada tanggal yang sama mengganti snapshot tanggal itu, bukan menggandakan data.
- Saldo awal bulan memakai tanggal upload paling awal; saldo terbaru memakai tanggal upload terakhir.
- Ringkasan bulanan diperbarui otomatis dari snapshot harian paling awal dan terakhir.
- Pencapaian keseluruhan dihitung dari total rupiah, bukan rata-rata persentase 17 petugas.
- Tanggal atau bulan yang belum diunggah ditampilkan sebagai data kosong, bukan nol.
- Admin dapat melihat seluruh petugas. Akun petugas hanya dapat membaca namanya sendiri.
- Tabel dashboard menyimpan agregat IDPEL dan rupiah per petugas, bukan daftar pelanggan.
- Rupiah tunggakan mengikuti parser laporan, yaitu `RPTAG + RPBK`.

## Aktivasi

Migrasi harian berada di `supabase-schema-step-24-daily-debt-performance.sql` dan sudah
dimasukkan ke persiapan rilis 1.7.5. Jalankan dari folder workspace:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& ".\tools\publish-release-1.7.5.ps1"
```

Script meminta password database secara tersembunyi, menerapkan migrasi, mengunggah web dan APK,
memastikan marker web serta hash APK benar, lalu mengaktifkan rilis. Sesudah aktif, buka menu
**Tunggakan > Upload Saldo Harian**, pilih tanggal, kemudian upload file Excel tunggakan.

## Verifikasi

- PostgreSQL: replace per tanggal, pembaruan ringkasan bulanan, penghapusan, RLS dan pembatasan role.
- JavaScript: agregasi unit, persentase tertimbang, leaderboard, grafik harian dan bulan WIB.
- Chrome headless: mode unit/petugas, dua bulan pembanding, 17 petugas, riwayat 1/3/4/6/12 bulan,
  desktop dan mobile tanpa overflow halaman.
