# Builds dist\questline-server.tar.gz: everything needed to install the sync
# server on a Linux machine (Docker setup, systemd installer, data import, schema).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$stage = Join-Path $env:TEMP 'questline-server'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $stage 'pb_migrations'), (Join-Path $stage 'pb_hooks'), (Join-Path $stage 'docker') | Out-Null

# Shell scripts must have LF line endings to run on Linux.
$files = 'install.sh', 'import-data.sh', 'README.md', 'docker/Dockerfile', 'docker/compose.yaml', 'docker/setup.sh'
foreach ($f in $files) {
    $text = [IO.File]::ReadAllText((Join-Path "$PSScriptRoot\deploy" $f)) -replace "`r`n", "`n"
    [IO.File]::WriteAllText((Join-Path $stage $f), $text, (New-Object Text.UTF8Encoding $false))
}
Copy-Item .\pb_migrations\*.js (Join-Path $stage 'pb_migrations')
# Hooks run on Linux: write them with LF endings.
foreach ($h in Get-ChildItem .\pb_hooks\*.js) {
    $text = [IO.File]::ReadAllText($h.FullName) -replace "`r`n", "`n"
    [IO.File]::WriteAllText((Join-Path $stage "pb_hooks\$($h.Name)"), $text, (New-Object Text.UTF8Encoding $false))
}

New-Item -ItemType Directory -Force ..\dist | Out-Null
$out = Resolve-Path ..\dist
# Use Windows' bsdtar explicitly; Git's GNU tar reads "A:\..." as a remote host.
& "$env:SystemRoot\System32\tar.exe" -czf "$out\questline-server.tar.gz" -C $env:TEMP questline-server
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
Remove-Item $stage -Recurse -Force
Write-Host "Built $out\questline-server.tar.gz"
