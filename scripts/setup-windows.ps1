$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22.13 or newer is required. Install it from https://nodejs.org/ and reopen PowerShell."
}

$NodeVersionText = (node --version).TrimStart("v")
$NodeVersion = [version]$NodeVersionText
$MinimumNodeVersion = [version]"22.13.0"
if ($NodeVersion -lt $MinimumNodeVersion) {
  throw "Node.js $NodeVersionText is installed; version 22.13.0 or newer is required."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Reinstall Node.js with npm included."
}

Write-Host "Installing lockfile-pinned dependencies for the local synthetic demo..."
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

Write-Host "Setup complete. Run scripts\run-windows.bat to build and start the prototype."
