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

1. Pilih bulan dan tanggal pada menu `Tunggakan > Dashboard Kogol`.
2. Untuk Kogol 0, tekan `Ambil Saldo Awal Kogol 0` pada awal bulan. Pada hari
   berikutnya gunakan `Simpan Saldo Kogol 0` setelah Saldo Akhir Monitoring
   dimuat.
3. Upload file Kogol 3 atau Kogol 4 sesuai tanggal data. Upload pertama dalam
   bulan menjadi baseline. Upload terakhir menjadi saldo belum lunas.
4. Upload ulang jenis Kogol yang sama pada tanggal sama mengganti snapshot itu
   saja; kelompok lain pada tanggal yang sama tidak dihapus.

Diagram memakai jumlah IDPEL. Nilai rupiah lunas dan belum lunas tetap
ditampilkan di setiap kartu. Dashboard menghitung `Lunas = saldo awal - saldo
terbaru`; jadi angka tidak akan berubah hanya karena dashboard dibuka ulang.
