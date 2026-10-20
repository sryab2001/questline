# Starts the Questline PocketBase server on this PC.
# Binds to localhost only; Tailscale Serve exposes it to your devices over HTTPS.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path .\bin\pocketbase.exe)) {
    Write-Host 'PocketBase not found. Running download-pocketbase.ps1 first...'
    & .\download-pocketbase.ps1
}

& .\bin\pocketbase.exe serve --http 127.0.0.1:8090 --dir .\pb_data --migrationsDir .\pb_migrations
