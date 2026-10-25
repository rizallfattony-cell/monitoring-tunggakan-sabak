$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools\publish-release-1.7.4.ps1'
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$errors)
if ($errors) { throw 'Syntax script publikasi tidak valid.' }
$definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Resolve-SimontokGitExecutable' }, $false)
if (-not $definition) { throw 'Resolver Git tidak ditemukan.' }
# Load only the resolver; never run publication, read passwords, or contact a database.
. ([scriptblock]::Create($definition.Extent.Text))
$originalPath = $env:PATH
try {
    $env:PATH = "$env:WINDIR\System32"
    $resolved = Resolve-SimontokGitExecutable
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw 'Git tidak ditemukan ketika PATH kosong dari Git.' }
    & $resolved --version
    if ($LASTEXITCODE -ne 0) { throw 'Git fallback tidak bisa berjalan.' }
    if ((Resolve-SimontokGitExecutable -ExplicitPath $resolved) -ne (Resolve-Path -LiteralPath $resolved).ProviderPath) { throw 'GitPath tidak sesuai.' }
    $rejected = $false
    try { Resolve-SimontokGitExecutable -ExplicitPath (Join-Path $PSScriptRoot 'missing-git.exe') | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw 'GitPath yang salah tidak ditolak.' }
    Write-Host 'PASS: Git ditemukan tanpa PATH; path eksplisit dan penolakan path salah lulus.'
} finally { $env:PATH = $originalPath }
