#!/usr/bin/env pwsh
# EngCode installer for Windows.
#
# Published npm package (recommended):
#   npm install -g engcode
#
# From a checkout or a release folder:
#   .\scripts\install.ps1 -From .
#   .\scripts\install.ps1 -From .\release\engcode-1.0.0.tgz
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
    if (Test-Path $source -PathType Container) {
        if (Test-Path (Join-Path $source "package.json")) {
            # A checkout: pack it first so sources, tests, and node_modules are not copied.
            Write-Step "Packing EngCode from $source"
            $packDir = Join-Path ([System.IO.Path]::GetTempPath()) ("engcode-pack-" + [System.IO.Path]::GetRandomFileName())
            New-Item -ItemType Directory -Path $packDir | Out-Null
            $packed = & $npm pack --pack-destination $packDir | Where-Object { $_ -match '^engcode-.*\.tgz$' } | Select-Object -Last 1
            if ($LASTEXITCODE -ne 0 -or -not $packed) {
                Write-Host "npm pack did not finish. Run 'npm install' in the checkout first." -ForegroundColor Red
                exit 1
            }
            $source = Join-Path $packDir ([string]$packed).Trim()
        } else {
            # A release folder: use the packed tarball inside it.
            $tarball = Get-ChildItem -Path $source -Filter "engcode-*.tgz" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if (-not $tarball) {
                Write-Host "I could not find engcode-*.tgz or package.json in $source." -ForegroundColor Red
                exit 1
            }
            $source = $tarball.FullName
        }
    }
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
if ($Prefix) {
    $launcher = Join-Path $Prefix "engcode.cmd"
    if (-not (Test-Path $launcher)) {
        Write-Host "The install finished, but $launcher was not found." -ForegroundColor Red
        exit 1
    }
    & $launcher --version
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host ""
    Write-Host "Add $Prefix to your PATH to run 'engcode' anywhere." -ForegroundColor Yellow
} else {
    if (-not (Get-Command engcode -ErrorAction SilentlyContinue)) {
        Write-Host "The install finished, but 'engcode' is not on PATH yet." -ForegroundColor Red
        Write-Host "Open a new terminal, or add npm's global bin folder to PATH."
        exit 1
    }
    & engcode --version
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host ""
Write-Host "EngCode is ready." -ForegroundColor Green
Write-Host "Try:"
Write-Host "  engcode learn"
Write-Host "  engcode new my-project --type script"
Write-Host "  engcode run my-project/main.eng"
