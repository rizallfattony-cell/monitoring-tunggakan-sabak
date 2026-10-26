# Perbaikan Aktivasi Premium 1.7.5

## Penyebab dan Perbaikan

Status web Aktif dan Belum terikat berarti periode premium benar tetapi belum ada perangkat yang terikat.
Parser Android lama membaca JSON null sebagai teks "null", menganggapnya ID perangkat lain,
lalu menutup fitur premium. Banner peringatan perangkat juga tidak pernah tampil karena kondisinya saling bertentangan.

- JSON null, nilai kosong dan literal "null" tidak lagi dianggap perangkat lain.
- RPC `get_my_premium_access(p_device_id)` mengikat perangkat pertama secara atomik hanya jika paket/periode akun sendiri masih aktif. Perangkat lain tidak dapat mengambil alih ikatan.
- Client memeriksa hasil server, bukan menganggap PATCH yang tidak mengubah baris sebagai sukses.
- Cache versi lama diabaikan setelah update; status diperiksa saat membuka/kembali ke aplikasi dan membuka Menu.
- Status perangkat lain dan kegagalan pemeriksaan dijelaskan di Status Premium, bukan selalu ditampilkan sebagai paket belum aktif.
- Masa aktif, harga paket dan catatan pembayaran tidak diubah. Tidak perlu membayar ulang.

## Aktivasi

Database 1.7.4 harus sudah tersedia. Buka Docker Desktop hingga Engine running, lalu:

```powershell
cd "C:\Users\rizal\OneDrive\Documents\New project"
Set-ExecutionPolicy -Scope Process Bypass
& ".\tools\publish-release-1.7.5.ps1"
```

Masukkan password DATABASE BARU pada prompt. Script menerapkan step 22, mengunggah APK,
memverifikasi hash unduhan, lalu mengaktifkan update wajib 1.7.5. Jangan jalankan SQL release
sebelum APK tersedia. Script dapat dijalankan ulang dan memiliki proteksi penurunan versi.

Unduhan setelah publikasi: https://simontok-superweb.vercel.app/SIMONTOK-v1.7.5.apk

Pasang pembaruan di HP ADRI tanpa uninstall. Sambungkan internet, buka aplikasi dan Menu.
Jika web tetap Belum terikat atau aplikasi menyatakan Perangkat lain, periksa Status Premium;
jangan mengubah data pembayaran. Reset perangkat hanya oleh admin jika benar-benar terikat ke HP lama.

## Verifikasi

Build APK berhasil. 24 unit test, 17 tes emulator (termasuk riwayat cetak dan pengingat tagihan),
serta suite PostgreSQL lokal lulus. SHA-256 APK:
`C43B84A11D15E53422F3EDA40F0296D907785C8817B323F91272D09346682762`.

- Tes Android mereproduksi hasil optString JSON null lama, memastikan parser baru tidak menganggapnya perangkat lain, dan menguji kolom Tambah tagihan pada preview cetak sebenarnya.
- Unit test mencakup masa aktif ADRI, tanggal mulai/akhir, tanggal tidak valid, FREE, perangkat belum terikat dan perangkat lain.
- Tes PostgreSQL lokal memastikan pengikatan idempoten, perangkat lain tidak mengambil alih, paket/masa aktif/pembayaran tetap, dan akun kedaluwarsa/masa depan/FREE/anon tidak mendapat akses.
- Tidak ada password database, secret key, atau perubahan langsung data produksi pada proses pengembangan ini.
