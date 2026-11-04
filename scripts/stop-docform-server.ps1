$ErrorActionPreference = 'Stop'

$repoRoot = 'D:\DocForm'
$serverPath = Join-Path $repoRoot 'server.ts'
$tsxCli = Join-Path $repoRoot 'node_modules\tsx\dist\cli.mjs'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'DocForm\server-shortcuts'
$pidFile = Join-Path $runtimeRoot 'server-5050.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host 'No DocForm server managed by these shortcuts is running.'
    exit 0
}

$savedPidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
$serverPid = 0
if (-not [int]::TryParse($savedPidText, [ref]$serverPid)) {
    Remove-Item -LiteralPath $pidFile -Force
    throw 'The PID file was invalid. Its stale state was removed and no process was stopped.'
}

$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
if (-not $serverProcess) {
    Remove-Item -LiteralPath $pidFile -Force
    Write-Host 'The server had already stopped.'
    exit 0
}

$commandLine = [string]$serverProcess.CommandLine
if (-not $commandLine -or
    $commandLine.IndexOf($tsxCli, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $commandLine.IndexOf($serverPath, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $commandLine.IndexOf('--port 5050', [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    Remove-Item -LiteralPath $pidFile -Force
    throw "PID $serverPid is no longer the DocForm server managed by these shortcuts. The process was left untouched."
}

$taskkillPath = Join-Path $env:SystemRoot 'System32\taskkill.exe'
$killOutput = & $taskkillPath /PID $serverPid /T /F 2>&1
if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) {
    throw "Could not stop the DocForm process tree for PID $serverPid. $killOutput"
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $remainingRoot = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
    $remainingListeners = @(Get-NetTCPConnection -LocalPort 5050 -State Listen -ErrorAction SilentlyContinue)
    if (-not $remainingRoot -and $remainingListeners.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

$listeners = @(Get-NetTCPConnection -LocalPort 5050 -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    $owners = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    Write-Warning "Stopped PID $serverPid. Port 5050 still has another listener (PID $owners)."
} else {
    Write-Host 'DocForm server on port 5050 has stopped.'
}
