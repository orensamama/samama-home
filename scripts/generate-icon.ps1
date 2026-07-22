Add-Type -AssemblyName System.Drawing

function New-RoundedPolygonPath {
    param(
        [System.Drawing.PointF[]]$Points,
        [double]$Radius
    )
    $n = $Points.Count
    $insetStarts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    $insetEnds = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    for ($i = 0; $i -lt $n; $i++) {
        $prev = $Points[($i - 1 + $n) % $n]
        $cur = $Points[$i]
        $next = $Points[($i + 1) % $n]
        $toPrevX = $prev.X - $cur.X; $toPrevY = $prev.Y - $cur.Y
        $toNextX = $next.X - $cur.X; $toNextY = $next.Y - $cur.Y
        $lenPrev = [Math]::Sqrt($toPrevX * $toPrevX + $toPrevY * $toPrevY)
        $lenNext = [Math]::Sqrt($toNextX * $toNextX + $toNextY * $toNextY)
        $r = [Math]::Min($Radius, [Math]::Min($lenPrev, $lenNext) * 0.5)
        $startPt = New-Object System.Drawing.PointF(($cur.X + $toPrevX / $lenPrev * $r), ($cur.Y + $toPrevY / $lenPrev * $r))
        $endPt = New-Object System.Drawing.PointF(($cur.X + $toNextX / $lenNext * $r), ($cur.Y + $toNextY / $lenNext * $r))
        $insetStarts.Add($startPt)
        $insetEnds.Add($endPt)
    }
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    for ($i = 0; $i -lt $n; $i++) {
        $endPrev = $insetEnds[($i - 1 + $n) % $n]
        $startCur = $insetStarts[$i]
        $path.AddLine($endPrev, $startCur)
        $path.AddBezier($startCur, $Points[$i], $Points[$i], $insetEnds[$i])
    }
    $path.CloseFigure()
    return $path
}

function New-AppIcon {
    param([string]$Path, [int]$Size)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $S = [double]$Size

    # Warm cream -> peach/orange diagonal background (full bleed, no rounding --
    # the OS applies its own mask for maskable/adaptive icons).
    $bgRect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.ColorTranslator]::FromHtml("#fef3e2"),
        [System.Drawing.ColorTranslator]::FromHtml("#f97316"),
        45
    )
    $g.FillRectangle($bgBrush, $bgRect)

    # Soft glossy highlight, upper-left, for a little depth.
    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50, 255, 255, 255))
    $glowSize = $S * 0.9
    $g.FillEllipse($glowBrush, [float](-$glowSize * 0.35), [float](-$glowSize * 0.45), [float]$glowSize, [float]$glowSize)

    $cx = $S * 0.5

    # House silhouette: a simple, convex roof-into-wall pentagon (no overhang
    # notch to catch weird corners on), gently flared at the base, every
    # corner softly rounded for a warm, organic (not boxy) shape. Sized to
    # fill most of the icon's safe area.
    $peakY = $S * 0.16
    $eaveY = $S * 0.40
    $bottomY = $S * 0.76
    $wallTopHalfW = $S * 0.27
    $wallBottomHalfW = $S * 0.30
    $cornerR = $S * 0.075

    $housePoints = @(
        (New-Object System.Drawing.PointF($cx, $peakY)),
        (New-Object System.Drawing.PointF(($cx + $wallTopHalfW), $eaveY)),
        (New-Object System.Drawing.PointF(($cx + $wallBottomHalfW), $bottomY)),
        (New-Object System.Drawing.PointF(($cx - $wallBottomHalfW), $bottomY)),
        (New-Object System.Drawing.PointF(($cx - $wallTopHalfW), $eaveY))
    )
    $housePath = New-RoundedPolygonPath -Points $housePoints -Radius $cornerR
    $bodyHalfWBottom = $wallBottomHalfW

    $houseFill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#fffdfa"))
    $g.FillPath($houseFill, $housePath)

    $houseOutline = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#c2410c"), [float]([Math]::Max(1.0, $S * 0.01)))
    $houseOutline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($houseOutline, $housePath)

    # "S" monogram, standing in for the door -- Samama family initial.
    $sFont = New-Object System.Drawing.Font("Georgia", [float]($S * 0.26), [System.Drawing.FontStyle]::Bold)
    $sBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#c2410c"))
    $sFormat = New-Object System.Drawing.StringFormat
    $sFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $sFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $doorCenter = New-Object System.Drawing.RectangleF(
        [float]($cx - $bodyHalfWBottom), [float]$eaveY,
        [float]($bodyHalfWBottom * 2), [float]($bottomY - $eaveY + $S * 0.02)
    )
    $g.DrawString("S", $sFont, $sBrush, $doorCenter, $sFormat)

    # Small heart accent, tucked beside the roof peak -- the family touch.
    $heartColor = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#fb7185"))
    $hcx = $cx + $S * 0.13
    $hcy = $peakY + $S * 0.03
    $hs = $S * 0.10
    $g.FillEllipse($heartColor, [float]($hcx - $hs * 0.5), [float]($hcy - $hs * 0.28), [float]($hs * 0.55), [float]($hs * 0.55))
    $g.FillEllipse($heartColor, [float]($hcx - $hs * 0.05), [float]($hcy - $hs * 0.28), [float]($hs * 0.55), [float]($hs * 0.55))
    $tri = @(
        (New-Object System.Drawing.PointF(($hcx - $hs * 0.47), ($hcy - $hs * 0.02))),
        (New-Object System.Drawing.PointF(($hcx + $hs * 0.47), ($hcy - $hs * 0.02))),
        (New-Object System.Drawing.PointF($hcx, ($hcy + $hs * 0.55)))
    )
    $g.FillPolygon($heartColor, $tri)

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $houseOutline.Dispose()
    $houseFill.Dispose()
    $sBrush.Dispose()
    $sFont.Dispose()
    $glowBrush.Dispose()
    $bgBrush.Dispose()
    $heartColor.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

New-AppIcon "public\icons\icon-192.png" 192
New-AppIcon "public\icons\icon-512.png" 512
New-AppIcon "public\icons\apple-touch-icon.png" 180

Write-Output "Icons generated."
