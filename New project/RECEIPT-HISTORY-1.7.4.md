# Riwayat Cetak SIMONTOK 1.7.4

## Perilaku

- Android: Menu > Riwayat Cetak. Bulan, pencarian IDPEL/nama/referensi, preview asli, status sinkronisasi dan jumlah cetak ulang.
- Web admin: Simontok Super App > Riwayat Cetak. Ringkasan bulanan, rekap 17 petugas termasuk nol transaksi, detail berpaginasi, filter dan Excel dua sheet.
- Pendapatan tambahan hanya jumlah kolom Tambah Tagihan pada cetak asli. Biaya admin bank, tagihan asli dan cetak ulang tidak menambah pendapatan.
- Tanggal transaksi dan periode pendapatan memakai WIB. Cetak ulang yang dilakukan bulan berikutnya tetap terhubung ke transaksi aslinya.
- Teks struk, jam, ID transaksi, referensi, stand meter, identitas toko dan nominal dibekukan. Preview yang dirender ulang tidak membuat referensi/jam baru. Riwayat tidak dapat diedit/dihapus oleh pengguna.
- Satu akun hanya melihat riwayat miliknya. Web admin dapat melihat semuanya. Pemilik ditentukan dari sesi server, bukan username kiriman aplikasi.

## Offline dan Batasan

- Sebelum mengirim ke printer, aplikasi menulis draft ke SQLite. Setelah pengiriman selesai, draft menjadi riwayat berhasil dan antrean sinkronisasi. Gagal kirim tidak menambah transaksi atau pendapatan.
- Job Android tersimpan dan memerlukan jaringan; antrean dicoba lagi dengan backoff. Membuka aplikasi dan halaman riwayat juga memicu sinkronisasi. Pengiriman ulang memakai UUID asli, termasuk jika balasan server terputus.
- Riwayat dipisahkan per akun dan tidak dihapus saat logout. Antrean akun A tidak dikirim dengan sesi akun B. Login kembali akun A untuk menyelesaikannya.
- Riwayat yang sudah tersinkron dapat diunduh kembali di HP pengganti. Daftar hanya mengunduh metadata; teks asli diunduh saat detail dibuka dan dicache untuk cetak ulang offline.
- Jangan uninstall/hapus data aplikasi sebelum antrean tersinkron. Data offline yang belum terkirim tidak dapat dipulihkan dari server.
- Printer Bluetooth tidak memberikan konfirmasi bahwa kertas benar-benar keluar. Berhasil berarti seluruh data dikirim tanpa error. Jika aplikasi tertutup setelah pengiriman tetapi sebelum pencatatan selesai, draft diberi status hasil belum pasti; pengguna harus memeriksa kertas sebelum memilih Konfirmasi Sudah Tercetak.
- Riwayat baru dimulai dari penggunaan versi 1.7.4. Struk yang dicetak versi lama tidak pernah disimpan dan tidak dapat direkonstruksi identik.
- Snapshot merekam hasil cetak aplikasi, bukan verifikasi pembayaran dari sistem bank/PLN. Nominal rekap merupakan tambahan yang dicetak, bukan bukti dana sudah diterima bank.

## Aktivasi Produksi

Kode dan APK dipersiapkan lokal. Jangan aktifkan update wajib sebelum migrasi berhasil dan APK tersedia.
Pastikan Docker Desktop menunjukkan Engine running, lalu di PowerShell:

```powershell
cd "C:\Users\rizal\OneDrive\Documents\New project"
Set-ExecutionPolicy -Scope Process Bypass
& ".\tools\publish-release-1.7.4.ps1"
```

Masukkan password DATABASE BARU hanya pada prompt. Script tidak menyimpannya ke file.
Script memeriksa repo bersih/main, menerapkan persiapan database dan step 21, melakukan git push, memverifikasi hash APK hosted dan marker web, baru menjalankan release 1.7.4 untuk update wajib.
Script dapat diulang jika jaringan/deployment gagal. Tidak ada penurunan versi atau penambahan pendapatan ketika migrasi diulang.
Database Kelola Premium dan rekap pembayaran sebelumnya (step 17/18) harus sudah tersedia. Script persiapan menerapkan step 19 bila belum ada dan memperbarui step 20 (dua paket Rp50.000) tanpa mengubah pembayaran yang sudah lunas. Script tidak menurunkan versi produksi yang lebih baru.

Unduhan setelah rilis: https://simontok-superweb.vercel.app/SIMONTOK-v1.7.4.apk
Pasang tanpa uninstall. Metadata rilis memakai URL khusus versi, tidak mengganti SIMONTOK-latest.apk sebelum verifikasi.

## Antarmuka Database

- `save_receipt_history(p_snapshot jsonb)`: insert idempoten, mengunci snapshot yang sudah diterima; konflik isi/owner ditolak.
- `record_receipt_reprint(p_event_id uuid,p_receipt_id uuid,p_printed_at timestamptz)`: event idempoten, wajib struk milik sendiri.
- `list_receipt_history(p_month date,p_query text,p_offset int,p_limit int,p_user_id uuid,p_petugas text)`: rows metadata dan total, maksimum 200 baris per halaman; non-admin selalu dibatasi pemiliknya.
- `get_receipt_snapshot(p_id uuid)`: teks/data asli dan jumlah cetak ulang; hanya pemilik/admin.
- `admin_receipt_monthly_summary(p_month date)`: rekap per petugas; daftar utama 17 nama, akun tambahan yang melakukan cetak tidak disembunyikan.
- Tabel `monitoring_receipt_history` dan `monitoring_receipt_reprints` memiliki RLS, hanya SELECT langsung. Mutasi melalui RPC tervalidasi. Tidak ada service-role key di klien.

## Verifikasi

Kandidat APK: SHA-256 `6C289EA13700279E67272BE47F8D0D0F215FBC1A05E08553A2CF7E1EC077B8C2`.
Build berhasil; 18 unit test dan 12 tes emulator lulus. Suite PostgreSQL, tes Node dan uji browser desktop/mobile/XLSX juga lulus.

- Unit Android: identitas/waktu stabil, pergantian bulan WIB dan nominal.
- Emulator: printer simulasi berhasil/gagal, snapshot identik, antrean tahan buka ulang, isolasi akun, deduplikasi setelah balasan hilang, merge jumlah cetak ulang, preview daftar/detail.
- PostgreSQL lokal terisolasi: RLS, akses admin, immutable snapshot, UUID idempoten, batas bulan WIB, pagination, 17 petugas, Rp0 dan reprint tidak menggandakan pendapatan, migrasi berulang dan proteksi downgrade.
- Browser desktop/mobile: ringkasan, pencarian, filter, pagination, preview aman terhadap HTML, serta file XLSX yang dibuka ulang dan dicek tipe/nilai selnya.
- Belum diuji dengan printer Bluetooth fisik atau database produksi. Aktivasi produksi membutuhkan password admin melalui script di atas.
