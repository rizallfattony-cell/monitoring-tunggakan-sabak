# Rencana APK Petugas

Aplikasi Android petugas bisa dibuat dari web online yang sudah dideploy ke Vercel. Cara paling cepat adalah membungkus web app menjadi APK dengan Capacitor atau Trusted Web Activity.

## Alur Data

```text
Admin upload DIL / saldo awal / saldo akhir di web
Admin klik Simpan ke Online
Data pelanggan tersisa disimpan ke Supabase per PETUGAS
Petugas login di aplikasi Android
Petugas hanya melihat data miliknya sendiri
```

## Setup 17 User Petugas

1. Buka Supabase.
2. Masuk ke **Authentication > Users**.
3. Buat 17 user, satu user untuk satu petugas.
4. Catat email dan `user_id` masing-masing user.
5. Masuk ke **SQL Editor**.
6. Insert profil user ke tabel `monitoring_profiles`.

Contoh:

```sql
insert into public.monitoring_profiles (user_id, email, role, petugas)
values
  ('USER_ID_ADMIN', 'admin@email.com', 'admin', null),
  ('USER_ID_PETUGAS_1', 'petugas1@email.com', 'petugas', 'ADRI'),
  ('USER_ID_PETUGAS_2', 'petugas2@email.com', 'petugas', 'ANANG');
```

Nama `petugas` harus sama dengan isi kolom `PETUGAS` di DIL.

## Membuat APK Nanti

Tahap berikutnya:

1. Pastikan link Vercel sudah final.
2. Bungkus link Vercel menjadi Android app.
3. Build APK.
4. Install APK ke 17 HP petugas.

Rekomendasi teknis:

```text
Capacitor Android
```

Alasannya: app tetap memakai kode web yang sama, tapi bisa di-build menjadi APK.
