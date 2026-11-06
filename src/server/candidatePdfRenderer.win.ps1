param(
  [Parameter(Mandatory = $true)][string]$InputDocxPath,
  [Parameter(Mandatory = $true)][string]$OutputPdfPath,
  [Parameter(Mandatory = $true)][string]$MetadataPath
)

$ErrorActionPreference = 'Stop'
$wps = $null
$document = $null
$exitCode = 0
$ownsWpsInstance = $false
$wpsProcessNames = @('wps.exe', 'kwps.exe')
$existingWpsProcessIds = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in $wpsProcessNames
} | ForEach-Object { [int]$_.ProcessId })
$existingAutomationProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in $wpsProcessNames -and $_.CommandLine -match '/Automation -Embedding'
})

try {
  if ($existingAutomationProcesses.Count -gt 0) {
    $exitCode = 44
  }

  if ($exitCode -eq 0) {
    try {
      $wps = New-Object -ComObject 'kwps.application'
    } catch {
      $exitCode = 42
    }
  }

  if ($exitCode -eq 0) {
    $previousProcessIds = ''
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
      $currentAutomationProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in $wpsProcessNames -and
        $_.CommandLine -match '/Automation -Embedding' -and
        $existingWpsProcessIds -notcontains [int]$_.ProcessId
      })
      $ownedAutomationProcesses = @($currentAutomationProcesses)
      $currentProcessIds = (($currentAutomationProcesses | ForEach-Object { [int]$_.ProcessId } | Sort-Object) -join ',')
      if ($currentProcessIds -and $currentProcessIds -eq $previousProcessIds) { break }
      $previousProcessIds = $currentProcessIds
      Start-Sleep -Milliseconds 250
    }
    if ($ownedAutomationProcesses.Count -eq 0) {
      $exitCode = 44
      throw 'WPS automation process could not be isolated.'
    }
    $ownsWpsInstance = $true

    $wps.Visible = $false
    $wps.DisplayAlerts = 0
    $wps.AutomationSecurity = 3
    $wps.Options.UpdateLinksAtOpen = $false

    $inputFile = Get-Item -LiteralPath $InputDocxPath
    $inputFile.IsReadOnly = $true
    $document = $wps.Documents.Open($InputDocxPath, $false, $true, $false)
    $document.ExportAsFixedFormat($OutputPdfPath, 17)
    if (-not (Test-Path -LiteralPath $OutputPdfPath -PathType Leaf)) {
      throw 'WPS PDF export did not create a file.'
    }

    $metadata = [ordered]@{
      rendererName = 'WPS Office'
      rendererVersion = [string]$wps.Version
    }
    $json = ConvertTo-Json -InputObject $metadata -Compress
    [System.IO.File]::WriteAllText($MetadataPath, $json, [System.Text.UTF8Encoding]::new($false))
  }
} catch {
  if ($exitCode -ne 42 -and $exitCode -ne 44) { $exitCode = 43 }
} finally {
  if ($document -ne $null) {
    try { $document.Close(0) } catch { }
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null } catch { }
  }
  if ($wps -ne $null) {
    if ($ownsWpsInstance) {
      try { $wps.Quit(0) } catch { }
    }
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wps) | Out-Null } catch { }
  }
  if ($ownsWpsInstance) {
    foreach ($ownedProcess in $ownedAutomationProcesses) {
      $ownedProcessId = [int]$ownedProcess.ProcessId
      for ($attempt = 0; $attempt -lt 12; $attempt++) {
        $currentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ownedProcessId" -ErrorAction SilentlyContinue
        if (-not $currentProcess -or $currentProcess.CreationDate -ne $ownedProcess.CreationDate) { break }
        Start-Sleep -Milliseconds 250
      }
      $currentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ownedProcessId" -ErrorAction SilentlyContinue
      if ($currentProcess -and
          $currentProcess.Name -in $wpsProcessNames -and
          $currentProcess.CommandLine -match '/Automation -Embedding' -and
          $currentProcess.CreationDate -eq $ownedProcess.CreationDate) {
        try { Stop-Process -Id $ownedProcessId -Force -ErrorAction SilentlyContinue } catch { }
      }
    }
  }
}

exit $exitCode
