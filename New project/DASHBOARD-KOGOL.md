# Dashboard Kogol

Dashboard Kogol adalah dashboard web khusus admin. Snapshot disimpan di tabel
`monitoring_kogol_debt_snapshots`, terpisah dari payload tunggakan yang dikirim
ke aplikasi Android.

## Kelompok

- `Kogol 0`: ambil dari file Saldo Awal atau Saldo Akhir Monitoring biasa yang
  memiliki kolom `KOGOL`.
- `Kogol 3 Perkantoran`: baris file Kogol 3 selain LPJU Muara Sabak.
- `Kogol 3 LPJU`: `SATKER_MIV` memuat `14032800` atau `LPJU MUARA SABAK`.
- `Kogol 4`: seluruh baris file Kogol 4.

## Cara kerja

1. Pada menu `Database > Upload Data`, pilih bulan saldo awal. Ada tujuh unggahan:
   DIL, saldo awal/akhir Kogol 0, saldo awal/akhir
   Kogol 3, dan saldo awal/akhir Kogol 4.
2. Upload Saldo Awal Kogol 0 dan Saldo Akhir Kogol 0 seperti file EIS biasa.
   Hanya baris `KOGOL=0` yang masuk laporan Monitoring dan APK Android. File
   wajib memiliki kolom KOGOL agar kelompok lain tidak tercampur.
3. Upload satu file Kogol 3 untuk saldo awal dan satu file untuk saldo akhir.
   Baris LPJU dipisah dengan `SATKER_MIV`; seluruh baris lainnya Perkantoran.
   Lakukan hal yang sama untuk Kogol 4. Kogol 3/4 tidak masuk APK.
4. Saldo awal disimpan sebagai baseline tanggal 1 bulan terpilih, meskipun
   diunggah belakangan. Saldo akhir otomatis memakai tanggal saat unggah dalam
   zona Asia/Jakarta; tidak perlu memilih tanggal. Unggah ulang kelompok pada
   hari yang sama mengganti snapshot hari itu saja. Pada tanggal 1, saldo akhir
   belum dapat disimpan karena menggunakan tanggal baseline yang sama.

Diagram memakai jumlah IDPEL. Nilai rupiah lunas dan belum lunas tetap
ditampilkan di setiap kartu. Tanpa baseline tanggal 1, realisasi belum
ditampilkan. Setelah awal dan akhir tersedia, `Lunas = saldo awal - saldo
terbaru`; angka tidak berubah hanya karena dashboard dibuka ulang.
