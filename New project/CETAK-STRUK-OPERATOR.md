# Akun Khusus Cetak Struk

Halaman `cetak-struk.html` memakai akun Supabase Auth yang tercatat di
`monitoring_receipt_operators`. Akun ini dapat mencari semua IDPEL, tetapi
tidak masuk ke dashboard admin, daftar 17 petugas, atau rekap premium. Akun
cetak tidak menerima izin SELECT langsung ke tabel tunggakan.

## Aktivasi di proyek Supabase yang sedang dipakai

1. Di SQL Editor, jalankan seluruh isi `supabase-schema-step-27-receipt-operator.sql`.
   Jalankan sekali saja setelah tabel `monitoring_profiles`,
   `monitoring_remaining_customers`, `monitoring_receipt_meters`, dan
   `monitoring_receipt_settings` tersedia.
2. Terbitkan halaman `cetak-struk.html` dan perubahan akun cetak ke web,
   lalu pastikan deployment Vercel berstatus Ready. Jangan ikut menerbitkan
   perubahan lain yang belum siap.
3. Di Authentication > Users, buat **akun baru** dengan email khusus cetak struk.
   Jangan gunakan email akun admin atau petugas yang sudah ada. Simpan password
   secara pribadi; jangan masukkan ke GitHub atau chat.
4. Sebelum akun baru dipakai untuk login, di SQL Editor ganti
   `cetak@example.com` dengan email akun baru, lalu jalankan:

```sql
insert into public.monitoring_receipt_operators (user_id, email)
select u.id, u.email
from auth.users u
where lower(u.email) = lower('cetak@example.com')
  and not exists (
    select 1 from public.monitoring_profiles p where p.user_id = u.id
  )
on conflict (user_id) do nothing;

select email, user_id, created_at
from public.monitoring_receipt_operators
where lower(email) = lower('cetak@example.com');
```

Baris verifikasi harus menampilkan satu akun cetak. Jika tidak muncul, cek
email akun Auth dan pastikan akun itu belum tercatat sebagai admin/petugas di
`monitoring_profiles`. Jangan mengubah peran akun yang sudah ada; buat akun Auth
baru dengan email lain.

## Pengujian sebelum dipakai

1. Masuk di `cetak-struk.html` memakai akun baru. Cek IDPEL dari dua petugas
   berbeda; keduanya harus ditemukan bila masih menunggak.
2. Cek IDPEL yang tidak ada atau sudah lunas; tidak boleh menghasilkan struk.
3. Buka `index.html` dengan akun cetak; halaman harus mengarahkan kembali ke
   `cetak-struk.html`.
4. Cetak dua IDPEL ke PDF A4; keduanya harus berada pada satu lembar. Cetak
   ketiga harus memulai lembar berikutnya.
5. Pastikan akun cetak tidak bisa SELECT langsung tabel
   `monitoring_remaining_customers`, `monitoring_receipt_meters`, dan
   `monitoring_receipt_settings` lewat Data API. Admin dan petugas lama harus
   tetap dapat memakai fitur mereka seperti sebelumnya.

Migrasi dan pembuatan akun harus dijalankan di database produksi secara
terpisah. Jangan login dengan akun baru sebelum baris operator terverifikasi.
