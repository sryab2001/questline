# Builds dist\questline-server.tar.gz: everything needed to install the sync
# server on a Linux machine (install script, data import script, schema).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$stage = Join-Path $env:TEMP 'questline-server'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$stage\pb_migrations" | Out-Null

# Shell scripts must have LF line endings to run on Linux.
foreach ($f in 'install.sh', 'import-data.sh', 'README.md') {
    $text = [IO.File]::ReadAllText((Join-Path "$PSScriptRoot\deploy" $f)) -replace "`r`n", "`n"
    [IO.File]::WriteAllText((Join-Path $stage $f), $text, (New-Object Text.UTF8Encoding $false))
}
Copy-Item .\pb_migrations\*.js "$stage\pb_migrations\"

New-Item -ItemType Directory -Force ..\dist | Out-Null
$out = Resolve-Path ..\dist
# Use Windows' bsdtar explicitly; Git's GNU tar reads "A:\..." as a remote host.
& "$env:SystemRoot\System32\tar.exe" -czf "$out\questline-server.tar.gz" -C $env:TEMP questline-server
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
Remove-Item $stage -Recurse -Force
Write-Host "Built $out\questline-server.tar.gz"
