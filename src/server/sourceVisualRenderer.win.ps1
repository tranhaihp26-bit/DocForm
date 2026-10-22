param(
  [Parameter(Mandatory = $true)][string]$InputDocxPath,
  [Parameter(Mandatory = $true)][string]$OutputPdfPath,
  [Parameter(Mandatory = $true)][string]$MetadataPath
)

$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
$exitCode = 0

try {
  try {
    $word = New-Object -ComObject Word.Application
  } catch {
    $exitCode = 42
  }

  if ($exitCode -eq 0) {
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    $word.Options.UpdateLinksAtOpen = $false

    $sourceFile = Get-Item -LiteralPath $InputDocxPath
    $sourceFile.IsReadOnly = $true
    $document = $word.Documents.Open($InputDocxPath, $false, $true, $false)
    $document.ExportAsFixedFormat($OutputPdfPath, 17)
    if (-not (Test-Path -LiteralPath $OutputPdfPath -PathType Leaf)) {
      throw 'Word PDF export did not create a file.'
    }

    $metadata = [ordered]@{
      rendererName = 'Microsoft Word'
      rendererVersion = [string]$word.Version
    }
    $json = ConvertTo-Json -InputObject $metadata -Compress
    [System.IO.File]::WriteAllText($MetadataPath, $json, [System.Text.UTF8Encoding]::new($false))
  }
} catch {
  $exitCode = 43
} finally {
  if ($document -ne $null) {
    try { $document.Close(0) } catch { }
  }
  if ($word -ne $null) {
    try { $word.Quit(0) } catch { }
  }
}

exit $exitCode
