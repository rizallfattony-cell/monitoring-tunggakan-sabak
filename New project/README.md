# Monitoring Saldo Tunggakan

Aplikasi web lokal untuk membuat laporan performa petugas dari file Excel DIL, saldo awal, dan saldo akhir.

## Jalankan

```powershell
node server.js
```

Buka:

```text
http://127.0.0.1:5173
```

Untuk dibuka dari laptop/HP lain dalam WiFi yang sama, cari IPv4 laptop utama lalu buka:

```text
http://IP-LAPTOP-UTAMA:5173
```

Contoh:

```text
http://192.168.1.25:5173
```

## Format Excel

DIL:

```text
IDPEL | NAMA | RBM | KOLOK | KOKED | PETUGAS
```

Saldo awal dan saldo akhir:

```text
IDPEL | NAMA | RPTAG | RPBK
```

Nilai tagihan dihitung dari:

```text
RPTAG + RPBK
```

## Catatan

DIL dan saldo awal akan tersimpan di browser lokal. Saldo akhir bisa diganti setiap hari. File Excel asli tidak diubah; hasil laporan bisa diexport ke Excel baru.

## Mode Online Supabase

1. Buat project Supabase.
2. Jalankan isi `supabase-schema.sql` di SQL Editor Supabase.
3. Aktifkan Auth Email/Password di Supabase.
4. Buat user dari menu Authentication.
5. Isi `supabase-config.js`:

```js
window.MONITORING_SUPABASE = {
  url: "https://PROJECT_ID.supabase.co",
  anonKey: "ANON_OR_PUBLISHABLE_KEY",
};
```

Setelah login di aplikasi, gunakan **Simpan ke Online** untuk menyimpan data agar bisa dibuka dari device lain, atau **Ambil Data Online** untuk mengambil data terbaru.

## Buka Dari Jaringan Berbeda

Untuk bisa dibuka dari mana pun, aplikasi perlu di-hosting publik. Ikuti panduan di `DEPLOY.md`.
