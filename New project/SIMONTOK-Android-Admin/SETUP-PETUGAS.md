# Setup 17 User Petugas SIMONTOK

APK menampilkan kolom **Username**, tetapi Supabase Auth tetap membutuhkan email. Karena itu username dikonversi otomatis menjadi email internal.

Contoh:

```text
Username di APK: 14390.ADRI
Email Supabase: 14390.adri@simontok.local
Password: Pln@123
```

## User Yang Harus Dibuat Di Supabase

Buat user berikut di **Supabase > Authentication > Users**:

```text
14390.adri@simontok.local
14390.anang@simontok.local
14390.cecep@simontok.local
14390.dedi@simontok.local
14390.roby@simontok.local
14390.tohir@simontok.local
14390.suwardi@simontok.local
14390.tri@simontok.local
14390.amrizal@simontok.local
14390.arbain@simontok.local
14390.bun@simontok.local
14390.dwi@simontok.local
14390.eko@simontok.local
14390.hasim@simontok.local
14390.rahul@simontok.local
14390.nico@simontok.local
14390.ilvan@simontok.local
```

Password semua user:

```text
Pln@123
```

Aktifkan **Auto Confirm User** saat membuat user.

## Mapping Profil Petugas

Setelah semua user dibuat, jalankan query ini untuk melihat user id:

```sql
select id, email
from auth.users
where email like '%@simontok.local'
order by email;
```

Lalu masukkan data ke `monitoring_profiles`. Ganti setiap `USER_ID_...` dengan id dari query di atas.

```sql
insert into public.monitoring_profiles (user_id, email, role, petugas)
values
  ('USER_ID_ADRI', '14390.adri@simontok.local', 'petugas', 'ADRI'),
  ('USER_ID_ANANG', '14390.anang@simontok.local', 'petugas', 'ANANG'),
  ('USER_ID_CECEP', '14390.cecep@simontok.local', 'petugas', 'CECEP'),
  ('USER_ID_DEDI', '14390.dedi@simontok.local', 'petugas', 'DEDI'),
  ('USER_ID_ROBY', '14390.roby@simontok.local', 'petugas', 'ROBY'),
  ('USER_ID_TOHIR', '14390.tohir@simontok.local', 'petugas', 'TOHIR'),
  ('USER_ID_SUWARDI', '14390.suwardi@simontok.local', 'petugas', 'SUWARDI'),
  ('USER_ID_TRI', '14390.tri@simontok.local', 'petugas', 'TRI'),
  ('USER_ID_AMRIZAL', '14390.amrizal@simontok.local', 'petugas', 'AMRIZAL'),
  ('USER_ID_ARBAIN', '14390.arbain@simontok.local', 'petugas', 'ARBAIN'),
  ('USER_ID_BUN', '14390.bun@simontok.local', 'petugas', 'BUN'),
  ('USER_ID_DWI', '14390.dwi@simontok.local', 'petugas', 'DWI'),
  ('USER_ID_EKO', '14390.eko@simontok.local', 'petugas', 'EKO'),
  ('USER_ID_HASIM', '14390.hasim@simontok.local', 'petugas', 'HASIM'),
  ('USER_ID_RAHUL', '14390.rahul@simontok.local', 'petugas', 'RAHUL'),
  ('USER_ID_NICO', '14390.nico@simontok.local', 'petugas', 'NICO'),
  ('USER_ID_ILVAN', '14390.ilvan@simontok.local', 'petugas', 'ILVAN')
on conflict (user_id) do update set
  email = excluded.email,
  role = excluded.role,
  petugas = excluded.petugas;
```

Nama petugas di kolom `petugas` harus sama dengan kolom `PETUGAS` di DIL. Kalau DIL memakai nama lengkap seperti `M TOHIR`, maka mapping user TOHIR harus diganti menjadi `M TOHIR`.
