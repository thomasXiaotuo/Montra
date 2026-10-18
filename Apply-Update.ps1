param(
  [string]$TargetPath = 'C:\zhuomian\meC\Montra',
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$targetRoot = (Resolve-Path -LiteralPath $TargetPath).Path.TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $targetRoot 'package.json'))) { throw 'Target must be the existing Montra project folder.' }
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'update-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $manifest.files) {
  if ([IO.Path]::IsPathRooted($entry.path) -or $entry.path.Split('/') -contains '..') { throw 'Invalid update path.' }
  $sourceFile = [IO.Path]::GetFullPath((Join-Path $sourceRoot $entry.path))
  $targetFile = [IO.Path]::GetFullPath((Join-Path $targetRoot $entry.path))
  if (-not $sourceFile.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $targetFile.StartsWith($targetRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Update path escaped project.' }
  if ((Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash -ne $entry.updatedSha256) { throw "Update file verification failed: $($entry.path)" }
  if (Test-Path -LiteralPath $targetFile) {
    $actual = (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
    if ($actual -ne $entry.originalSha256 -and $actual -ne $entry.updatedSha256) { throw "Source changed since this update was prepared: $($entry.path). No files copied." }
  } elseif ($entry.originalSha256) { throw "Expected source file is missing: $($entry.path). No files copied." }
}
if ($CheckOnly) { Write-Host 'Update verified. No files changed.'; exit 0 }
$backupRoot = Join-Path $targetRoot ('code-backups\account-login-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
foreach ($entry in $manifest.files) {
  $targetFile = Join-Path $targetRoot $entry.path
  if (Test-Path -LiteralPath $targetFile) {
    $backupFile = Join-Path $backupRoot $entry.path
    New-Item -ItemType Directory -Path (Split-Path $backupFile) -Force | Out-Null
    Copy-Item -LiteralPath $targetFile -Destination $backupFile
  }
}
foreach ($entry in $manifest.files) {
  $targetFile = Join-Path $targetRoot $entry.path
  New-Item -ItemType Directory -Path (Split-Path $targetFile) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceRoot $entry.path) -Destination $targetFile -Force
}
Write-Host 'Source update installed. Existing data and Cloudflare deployment are unchanged.'
Write-Host "Source backup: $backupRoot"
Write-Host 'Next: configure Cloudflare Access using docs/account-login.md, then run npm run cloud:upgrade-accounts.'
