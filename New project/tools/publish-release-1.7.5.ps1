[CmdletBinding()]
param([string]$ConnectionsFile = '', [string]$GitPath = '')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'publish-release-1.7.4.ps1') -ConnectionsFile $ConnectionsFile -GitPath $GitPath -ReleaseVersion '1.7.5'
