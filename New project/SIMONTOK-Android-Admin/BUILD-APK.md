# Build APK SIMONTOK

## Buka Project

1. Buka Android Studio.
2. Klik **Open**.
3. Pilih folder:

```text
SIMONTOK-Android
```

4. Tunggu Gradle sync selesai.

## Jalankan Ke HP

1. Aktifkan Developer Options di HP.
2. Aktifkan USB Debugging.
3. Sambungkan HP ke laptop.
4. Klik tombol **Run** di Android Studio.

## Build APK Debug

1. Klik **Build**.
2. Pilih **Build Bundle(s) / APK(s)**.
3. Pilih **Build APK(s)**.
4. Klik **Locate** setelah selesai.

APK debug biasanya ada di:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Build APK Release

1. Klik **Build**.
2. Pilih **Generate Signed Bundle / APK**.
3. Pilih **APK**.
4. Buat keystore.
5. Pilih build variant **release**.
6. Centang V1 dan V2 signing.
7. Klik **Finish**.
