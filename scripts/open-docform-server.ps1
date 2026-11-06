$ErrorActionPreference = 'Stop'

$startScript = Join-Path $PSScriptRoot 'start-docform-server.ps1'
if (-not (Test-Path -LiteralPath $startScript)) {
    throw "Could not find $startScript"
}

& $startScript
Start-Process 'http://localhost:5050/'
