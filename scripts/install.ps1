#!/usr/bin/env pwsh
# EngCode installer for Windows.
#
# Published release:
#   irm https://engcode.example/install.ps1 | iex
#
# From a checkout or a release folder:
#   .\scripts\install.ps1 -From .
#   .\scripts\install.ps1 -From .\release\engcode-0.1.0.tgz
param(
    [string]$Version = "",
    [string]$From = "",
    [string]$Prefix = "",
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

Write-Host "EngCode - Build with Simple English" -ForegroundColor Magenta
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }

if (-not $node -or -not $npm) {
    Write-Host "EngCode needs Node.js 20 or newer." -ForegroundColor Yellow
    Write-Host "Install it from https://nodejs.org/ and run this script again."
    exit 1
}

$nodeVersion = (& node --version).TrimStart("v")
$major = [int]($nodeVersion.Split(".")[0])
if ($major -lt 20) {
    Write-Host "EngCode needs Node.js 20 or newer. This machine has $nodeVersion." -ForegroundColor Yellow
    exit 1
}

if ($From -ne "") {
    $source = (Resolve-Path $From).Path
    Write-Step "Installing EngCode from $source"
    if ($Prefix) {
        & $npm install -g --prefix $Prefix $source
    } else {
        & $npm install -g $source
    }
} elseif ($Version -ne "") {
    Write-Step "Installing EngCode $Version from npm"
    if ($Prefix) {
        & $npm install -g --prefix $Prefix "engcode@$Version"
    } else {
        & $npm install -g "engcode@$Version"
    }
} else {
    Write-Step "Installing the latest EngCode from npm"
    if ($Prefix) {
        & $npm install -g --prefix $Prefix engcode
    } else {
        & $npm install -g engcode
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "The install did not finish. Check the messages above." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Step "Checking the command"
& engcode --version
Write-Host ""
Write-Host "EngCode is ready." -ForegroundColor Green
Write-Host "Try:"
Write-Host "  engcode learn"
Write-Host "  engcode new my-project --type script"
Write-Host "  engcode run my-project/main.eng"
