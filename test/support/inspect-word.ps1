# Chặng 5 — kiểm tra Word thật (Word COM), chỉ đọc candidate tổng hợp.
# Tham số: -Docx <đường dẫn> -Pdf <đường dẫn pdf> -Out <đường dẫn json>
param(
  [Parameter(Mandatory=$true)][string]$Docx,
  [Parameter(Mandatory=$true)][string]$Pdf,
  [Parameter(Mandatory=$true)][string]$Out
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

function Get-Stat([object]$rng, [int]$which) { try { return $rng.ComputeStatistics($which) } catch { return -1 } }
function Clean([string]$s) { return ($s -replace "[`r`a`n`v]", " ") -replace "\s+", " " }
# Số dòng mà một đoạn chiếm trong trang (Word): so dòng của ký tự đầu và ký tự cuối.
# wdFirstCharacterLineNumber = 10 → trả về -1 nếu Word không tính được.
function Get-LineSpan([object]$para) {
  try {
    $r = $para.Range
    $start = $r.Information(10)
    $tail = $doc.Range([math]::Max($r.Start, $r.End - 1), [math]::Max($r.Start, $r.End - 1))
    $end = $tail.Information(10)
    if ($start -lt 0 -or $end -lt 0) { return $null }
    return ($end - $start + 1)
  } catch { return $null }
}
# Bề rộng thực tế của một đoạn theo chính engine đo của Word (điểm bắt đầu →
# điểm cuối, tương đối trang) — dùng để kết luận đoạn có xuống dòng hay không.
function Get-RenderedWidth([object]$para) {
  try {
    $r = $para.Range
    $x1 = $r.Information(5)
    $tail = $doc.Range([math]::Max($r.Start, $r.End - 1), [math]::Max($r.Start, $r.End - 1))
    $x2 = $tail.Information(5)
    if ($x1 -lt 0 -or $x2 -lt 0) { return $null }
    return [math]::Round($x2 - $x1, 2)
  } catch { return $null }
}
# Cao thực tế của đoạn theo engine đo của Word (vị trí dọc tương đối trang):
# nếu đoạn xuống dòng thì chênh lệch dọc > 0 và xấp xỉ chiều cao một dòng.
function Get-RenderedHeight([object]$para) {
  try {
    $r = $para.Range
    $y1 = $r.Information(6)
    $tail = $doc.Range([math]::Max($r.Start, $r.End - 1), [math]::Max($r.Start, $r.End - 1))
    $y2 = $tail.Information(6)
    if ($y1 -lt 0 -or $y2 -lt 0) { return $null }
    return [math]::Round([math]::Abs($y2 - $y1), 2)
  } catch { return $null }
}

try {
  $doc = $word.Documents.Open($Docx, $false, $true)   # ConfirmConversions=false, ReadOnly=true

  $result = [ordered]@{
    wordVersion        = $word.Version
    wordBuild          = $word.Build
    opened              = $true
    pages               = Get-Stat $doc.Content 2
    paragraphCount      = $doc.Paragraphs.Count
    tableCount          = $doc.Tables.Count
    pageWidthPt         = [math]::Round($doc.PageSetup.PageWidth, 2)
    pageHeightPt        = [math]::Round($doc.PageSetup.PageHeight, 2)
    marginTopPt         = [math]::Round($doc.PageSetup.TopMargin, 2)
    marginBottomPt      = [math]::Round($doc.PageSetup.BottomMargin, 2)
    marginLeftPt        = [math]::Round($doc.PageSetup.LeftMargin, 2)
    marginRightPt       = [math]::Round($doc.PageSetup.RightMargin, 2)
    bodyFont            = $null
    headerTable         = $null
    headerCellWidthsPt  = @()
    headerCellWidthsTwip = @()
    headerTableIndentPt = $null
    headerTableIndentTwip = $null
    dateParagraphText   = ""
    dateParagraphLines  = $null
    dateParagraphFont   = ""
    dateParagraphSize   = $null
    separatorCount      = 0
    signatureText       = ""
    tables              = @()
    fontsUsed           = @()
  }

  try { $result.bodyFont = $doc.Content.Font.Name } catch {}

  # Duyệt toàn bộ bảng: đo bảng phần đầu và tìm ngày / chữ ký trong mọi ô
  $headerTableIndex = 0
  $allDateParas = @()
  $allSigParas = @()
  for ($ti = 1; $ti -le $doc.Tables.Count; $ti++) {
    $t = $doc.Tables.Item($ti)
    $tblInfo = [ordered]@{ index = $ti; rows = $t.Rows.Count; columns = $t.Columns.Count; cellTexts = @() }
    for ($c = 1; $c -le $t.Columns.Count; $c++) {
      $cellText = ""
      try { $cellText = Clean $t.Cell(1, $c).Range.Text } catch {}
      $tblInfo.cellTexts += $cellText
    }
    $result.tables += $tblInfo
    if ($ti -eq 1) {
      $headerTableIndex = 1
      $widths = @(); $widthsTw = @()
      for ($c = 1; $c -le $t.Columns.Count; $c++) {
        try {
          $w = $t.Cell(1, $c).Width
          $widths += [math]::Round($w, 2)
          $widthsTw += [math]::Round($w * 20, 0)
        } catch { $widths += -1; $widthsTw += -1 }
      }
      $result.headerCellWidthsPt = $widths
      $result.headerCellWidthsTwip = $widthsTw
      try { $result.headerTableIndentPt = [math]::Round($t.Rows.LeftIndent, 2) } catch {}
      try { $result.headerTableIndentTwip = [math]::Round($t.Rows.LeftIndent * 20, 0) } catch {}
      $result.headerTable = $tblInfo
    }
    # Ngày tháng và chữ ký trong ô bảng
    for ($r = 1; $r -le $t.Rows.Count; $r++) {
      for ($c = 1; $c -le $t.Columns.Count; $c++) {
        $cell = $null
        try { $cell = $t.Cell($r, $c) } catch { continue }
        for ($p = 1; $p -le $cell.Range.Paragraphs.Count; $p++) {
          $para = $cell.Range.Paragraphs.Item($p)
          $txt = Clean $para.Range.Text
          if ($txt -match 'ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}') {
            $allDateParas += [ordered]@{
              text = $txt
              lines = Get-LineSpan $para; renderedWidthPt = Get-RenderedWidth $para; renderedHeightPt = Get-RenderedHeight $para
              font = $para.Range.Font.Name
              size = $para.Range.Font.Size
              cellWidthPt = [math]::Round($cell.Width, 2)
            }
          }
          if ($txt -match 'GIÁM ĐỐC|T/M ĐẢNG ỦY|BÍ THƯ|Nguyễn Văn') {
            $allSigParas += $txt
          }
        }
      }
    }
  }

  # Ngày trong ngoài bảng
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $p = $doc.Paragraphs.Item($i)
    $txt = Clean $p.Range.Text
    if ($txt -match 'ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}') {
      $allDateParas += [ordered]@{
        text = $txt; lines = Get-LineSpan $p; renderedWidthPt = Get-RenderedWidth $p; renderedHeightPt = Get-RenderedHeight $p; font = $p.Range.Font.Name
        size = $p.Range.Font.Size; cellWidthPt = $null
      }
    }
    if ($txt -match 'GIÁM ĐỐC|T/M ĐẢNG ỦY|BÍ THƯ|Nguyễn Văn|CHỦ TRÌ|THƯ KÝ|ĐẠI DIỆN ĐƠN VỊ|Nguyễn An|Trần Bình|Lê Chi|Nơi nhận:|Như trên;|Lưu: VT') { $allSigParas += $txt }
  }

  if ($allDateParas.Count -gt 0) {
    $result.dateParagraphText = $allDateParas[0].text
    $result.dateParagraphLines = $allDateParas[0].lines
    $result.dateParagraphFont = $allDateParas[0].font
    $result.dateParagraphSize = $allDateParas[0].size
    $result.dateParagraphCellWidthPt = $allDateParas[0].cellWidthPt
    $result.dateParagraphRenderedWidthPt = $allDateParas[0].renderedWidthPt
    $result.dateParagraphRenderedHeightPt = $allDateParas[0].renderedHeightPt
    $result.allDateParagraphs = $allDateParas
  }
  $result.signatureText = (($allSigParas | Select-Object -Unique) -join " | ")

  # Số dấu phân cách "-----"
  $full = $doc.Content.Text
  $result.separatorCount = ([regex]::Matches($full, '-{3,}')).Count

  # Font dùng trong tài liệu
  $fonts = @{}
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    try {
      $n = $doc.Paragraphs.Item($i).Range.Font.Name
      $s = $doc.Paragraphs.Item($i).Range.Font.Size
      if ($n) { $key = "$n|$s"; if (-not $fonts.ContainsKey($key)) { $fonts[$key] = 0 }; $fonts[$key] = $fonts[$key] + 1 }
    } catch {}
  }
  $result.fontsUsed = @($fonts.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 12 | ForEach-Object { [ordered]@{ font = $_.Key; paragraphs = $_.Value } })

  # Xuất PDF bằng chính engine dàn trang của Word
  $doc.ExportAsFixedFormat($Pdf, 17)
  $result.pdfExported = (Test-Path $Pdf)
  if ($result.pdfExported) { $result.pdfBytes = (Get-Item $Pdf).Length }

  $doc.Close($false)
  $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Out -Encoding UTF8
  Write-Output "WORD_OK"
} catch {
  [ordered]@{ opened = $false; error = $_.Exception.Message } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Out -Encoding UTF8
  Write-Output ("WORD_ERROR: " + $_.Exception.Message)
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
