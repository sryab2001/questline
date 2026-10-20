# Downloads the pinned PocketBase release for Windows into .\bin and verifies its checksum.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$version = '0.40.5'
$name = "pocketbase_${version}_windows_amd64.zip"
$base = "https://github.com/pocketbase/pocketbase/releases/download/v$version"

New-Item -ItemType Directory -Force .\bin | Out-Null
$zip = Join-Path .\bin $name
Invoke-WebRequest "$base/$name" -OutFile $zip
$sums = (Invoke-WebRequest "$base/checksums.txt").Content

$expected = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($name) }) -replace '\s.*$', ''
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) {
    Remove-Item $zip
    throw "Checksum mismatch for $name (expected $expected, got $actual)"
}

Expand-Archive $zip -DestinationPath .\bin -Force
Remove-Item $zip
Write-Host "PocketBase $version ready in server\bin"
