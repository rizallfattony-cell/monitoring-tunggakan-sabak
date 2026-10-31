[CmdletBinding()]
param(
    [string]$ConnectionsFile = '',
    [string]$GitPath = '',
    [ValidateSet('1.7.4', '1.7.5')][string]$ReleaseVersion = '1.7.4'
)
$ErrorActionPreference = 'Stop'

function Resolve-SimontokGitExecutable {
    param([string]$ExplicitPath = '')
    if ($ExplicitPath) {
        if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) { throw 'File Git pada -GitPath tidak ditemukan.' }
        return (Resolve-Path -LiteralPath $ExplicitPath).ProviderPath
    }
    $command = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    $candidates = @(
        "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe",
        "$env:ProgramFiles\Git\cmd\git.exe",
        "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'Git tidak ditemukan. Jalankan script dengan -GitPath yang menunjuk ke git.exe.'
}

$gitExecutable = Resolve-SimontokGitExecutable -ExplicitPath $GitPath
& $gitExecutable --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Git ditemukan tetapi tidak dapat dijalankan.' }
$workspace = Split-Path -Parent $PSScriptRoot
$repo = Join-Path $workspace '.deploy-repo'
$source = Join-Path $repo 'New project'
if (-not (Test-Path -LiteralPath $repo) -and (Test-Path -LiteralPath (Join-Path $workspace 'supabase-schema-step-21-receipt-history.sql'))) {
    $source = $workspace
    $repo = Split-Path -Parent $source
}
$apk = Join-Path $source "SIMONTOK-v$ReleaseVersion.apk"
$webMarker = if ($ReleaseVersion -eq '1.7.5') { '20261031-dashboard-history-v1' } else { '20261025-receipt-history-v174' }
$temporaryApk = Join-Path ([IO.Path]::GetTempPath()) ('simontok-174-' + [guid]::NewGuid().ToString() + '.apk')
if (-not (Test-Path -LiteralPath $apk)) { throw "APK $ReleaseVersion belum tersedia." }
if (-not $ConnectionsFile) {
    $ConnectionsFile = @("$HOME\OneDrive\Documents\SIMONTOK-MIGRATION\connections.txt", "$HOME\Documents\SIMONTOK-MIGRATION\connections.txt") |
        Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $ConnectionsFile) { throw 'connections.txt tidak ditemukan.' }
$line = Get-Content -LiteralPath $ConnectionsFile | Where-Object { $_.Trim().StartsWith('NEW_DATABASE_URL=') } | Select-Object -First 1
if (-not $line) { throw 'NEW_DATABASE_URL tidak ditemukan.' }
$template = $line.Trim().Substring('NEW_DATABASE_URL='.Length).Trim()
if (-not $template.Contains('[YOUR-PASSWORD]') -or -not $template.Contains('qkruxwirngbiscxdyjgc')) { throw 'Gunakan template koneksi DATABASE BARU dengan [YOUR-PASSWORD].' }
& docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Buka Docker Desktop dan tunggu Engine running.' }
$dirty = & $gitExecutable -C $repo status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Repositori rilis harus bersih dan sudah di-commit sebelum publikasi.' }
$branch = & $gitExecutable -C $repo branch --show-current
if ($branch -ne 'main') { throw 'Repositori rilis harus berada di main.' }
$expectedHash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash
$secure = Read-Host 'Masukkan password DATABASE BARU' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $databaseUrl = $template.Replace('[YOUR-PASSWORD]', [Uri]::EscapeDataString($password))
    $mount = ($source -replace '\\','/') + ':/migration:ro'
    Write-Host "[1/4] Menyiapkan database versi $ReleaseVersion..." -ForegroundColor Cyan
    & docker run --rm --volume $mount public.ecr.aws/supabase/postgres:17.11.0.004 psql --set 'ON_ERROR_STOP=1' --file "/migration/supabase-prepare-$ReleaseVersion.sql" --dbname $databaseUrl
    if ($LASTEXITCODE -ne 0) { throw 'Migrasi gagal. Web dan update wajib belum dipublikasikan.' }
    Write-Host '[2/4] Mengunggah web admin dan APK ke hosting...' -ForegroundColor Cyan
    & $gitExecutable -C $repo push origin main
    if ($LASTEXITCODE -ne 0) { throw 'Git push gagal. Update wajib belum diaktifkan; jalankan ulang script setelah koneksi pulih.' }
    Write-Host '[3/4] Memastikan APK dan web terbaru tersedia...' -ForegroundColor Cyan
    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            Invoke-WebRequest -Uri "https://simontok-superweb.vercel.app/SIMONTOK-v$ReleaseVersion.apk" -OutFile $temporaryApk -UseBasicParsing -TimeoutSec 30
            $page = Invoke-WebRequest -Uri 'https://simontok-superweb.vercel.app/' -UseBasicParsing -TimeoutSec 30
            if ((Get-FileHash -LiteralPath $temporaryApk -Algorithm SHA256).Hash -eq $expectedHash -and $page.Content.Contains($webMarker)) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 5
    }
    if (-not $ready) { throw 'Hosting belum sesuai. Update wajib TIDAK diaktifkan. Tunggu deployment Vercel lalu jalankan ulang script.' }
    Write-Host "[4/4] Mengaktifkan update wajib $ReleaseVersion..." -ForegroundColor Cyan
    & docker run --rm --volume $mount public.ecr.aws/supabase/postgres:17.11.0.004 psql --set 'ON_ERROR_STOP=1' --file "/migration/supabase-release-$ReleaseVersion.sql" --dbname $databaseUrl
    if ($LASTEXITCODE -ne 0) { throw 'Web dan APK sudah diunggah, tetapi update wajib belum aktif. Jalankan ulang script.' }
    Write-Host "RILIS SIMONTOK $ReleaseVersion BERHASIL. Pasang pembaruan tanpa uninstall." -ForegroundColor Green
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $password = $null
    $databaseUrl = $null
    if (Test-Path -LiteralPath $temporaryApk) { Remove-Item -LiteralPath $temporaryApk }
}
