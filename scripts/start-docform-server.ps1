$ErrorActionPreference = 'Stop'

$repoRoot = 'D:\DocForm'
$serverPath = Join-Path $repoRoot 'server.ts'
$tsxCli = Join-Path $repoRoot 'node_modules\tsx\dist\cli.mjs'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'DocForm\server-shortcuts'
$logsRoot = Join-Path $runtimeRoot 'logs'
$pidFile = Join-Path $runtimeRoot 'server-5050.pid'

New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$serverProcessId = $null

function Get-ManagedProcessIds([int]$rootProcessId) {
    $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $managedIds = @($rootProcessId)
    $added = $true
    while ($added) {
        $added = $false
        foreach ($candidate in $allProcesses) {
            $candidatePid = [int]$candidate.ProcessId
            $parentPid = [int]$candidate.ParentProcessId
            if (($managedIds -contains $parentPid) -and ($managedIds -notcontains $candidatePid)) {
                $managedIds += $candidatePid
                $added = $true
            }
        }
    }
    return $managedIds
}

if (Test-Path -LiteralPath $pidFile) {
    $savedPidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    $savedPid = 0
    if ([int]::TryParse($savedPidText, [ref]$savedPid)) {
        $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
        if ($savedProcess -and $savedProcess.CommandLine -and
            $savedProcess.CommandLine.IndexOf($tsxCli, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $savedProcess.CommandLine.IndexOf($serverPath, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $serverProcessId = $savedPid
        } else {
            Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        }
    } else {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
}

$listeners = @(Get-NetTCPConnection -LocalPort 5050 -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0 -and -not $serverProcessId) {
    $owners = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Port 5050 is already in use by another process (PID $owners). No server was started."
}

if (-not $serverProcessId) {
    if (-not (Test-Path -LiteralPath $serverPath)) { throw "Could not find $serverPath" }
    if (-not (Test-Path -LiteralPath $tsxCli)) { throw "tsx is missing at $tsxCli. Install the project dependencies, then try again." }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdoutPath = Join-Path $logsRoot "server-$stamp.out.log"
    $stderrPath = Join-Path $logsRoot "server-$stamp.err.log"
    $arguments = '"{0}" "{1}" --port 5050' -f $tsxCli, $serverPath
    $started = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    $serverProcessId = $started.Id
    Set-Content -LiteralPath $pidFile -Value $serverProcessId -Encoding ASCII
}

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $listeners = @(Get-NetTCPConnection -LocalPort 5050 -State Listen -ErrorAction SilentlyContinue)
    $managedIds = @(Get-ManagedProcessIds -rootProcessId $serverProcessId)
    $managedListeners = @($listeners | Where-Object { $managedIds -contains [int]$_.OwningProcess })
    if ($managedListeners.Count -gt 0) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5050/' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
    }

    if (-not (Get-Process -Id $serverProcessId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    $details = ''
    $lastErrorLog = Get-ChildItem -LiteralPath $logsRoot -Filter 'server-*.err.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($lastErrorLog) { $details = (Get-Content -LiteralPath $lastErrorLog.FullName -Tail 20) -join [Environment]::NewLine }
    $lastOutputLog = Get-ChildItem -LiteralPath $logsRoot -Filter 'server-*.out.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($lastOutputLog) { $details += [Environment]::NewLine + ((Get-Content -LiteralPath $lastOutputLog.FullName -Tail 20) -join [Environment]::NewLine) }
    throw "DocForm did not respond at http://localhost:5050/. PID: $serverProcessId. Logs: $logsRoot. $details"
}

Write-Host "DocForm is running at http://localhost:5050/ (PID $serverProcessId)."
Start-Process 'http://localhost:5050/'
