Add-Type -AssemblyName System.Drawing

function New-RoundedPolygonPath {
    # Straight-edged polygon with each corner softened by a quadratic-Bezier
    # round (per-vertex radius) -- reads as a clean, classic silhouette
    # (unlike a spline through every point, which drifts into a blobby,
    # amorphous shape with no recognizable straight edges).
    param([System.Drawing.PointF[]]$Points, [double[]]$Radii)
    $n = $Points.Count
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $prevOut = $null
    $firstIn = $null
    for ($i = 0; $i -lt $n; $i++) {
        $prev = $Points[($i - 1 + $n) % $n]
        $cur = $Points[$i]
        $next = $Points[($i + 1) % $n]
        $r = $Radii[$i]

        $toPrevX = $prev.X - $cur.X; $toPrevY = $prev.Y - $cur.Y
        $toNextX = $next.X - $cur.X; $toNextY = $next.Y - $cur.Y
        $lenPrev = [Math]::Sqrt($toPrevX * $toPrevX + $toPrevY * $toPrevY)
        $lenNext = [Math]::Sqrt($toNextX * $toNextX + $toNextY * $toNextY)
        $rr = [Math]::Min($r, [Math]::Min($lenPrev, $lenNext) * 0.5)

        $inPt = New-Object System.Drawing.PointF(($cur.X + $toPrevX / $lenPrev * $rr), ($cur.Y + $toPrevY / $lenPrev * $rr))
        $outPt = New-Object System.Drawing.PointF(($cur.X + $toNextX / $lenNext * $rr), ($cur.Y + $toNextY / $lenNext * $rr))

        if ($i -eq 0) {
            $firstIn = $inPt
        } else {
            $path.AddLine($prevOut, $inPt)
        }
        $c1 = New-Object System.Drawing.PointF(($inPt.X + ($cur.X - $inPt.X) * 0.6667), ($inPt.Y + ($cur.Y - $inPt.Y) * 0.6667))
        $c2 = New-Object System.Drawing.PointF(($outPt.X + ($cur.X - $outPt.X) * 0.6667), ($outPt.Y + ($cur.Y - $outPt.Y) * 0.6667))
        $path.AddBezier($inPt, $c1, $c2, $outPt)
        $prevOut = $outPt
    }
    $path.AddLine($prevOut, $firstIn)
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

    # Warm cream -> orange diagonal background (full bleed -- the OS applies
    # its own mask for maskable/adaptive icons).
    $bgRect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.ColorTranslator]::FromHtml("#fef3e2"),
        [System.Drawing.ColorTranslator]::FromHtml("#f97316"),
        45
    )
    $g.FillRectangle($bgBrush, $bgRect)

    # Soft glossy highlight, upper-left, for a little depth.
    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 255, 255, 255))
    $glowSize = $S * 0.9
    $g.FillEllipse($glowBrush, [float](-$glowSize * 0.35), [float](-$glowSize * 0.45), [float]$glowSize, [float]$glowSize)

    $cx = $S * 0.5

    # Classic house silhouette: a clear triangular roof over a softened
    # square body -- five anchor points (peak, two eaves, two base
    # corners), each corner rounded just enough to feel friendly while
    # keeping straight, legible edges throughout.
    $peakY = $S * 0.15
    $eaveY = $S * 0.46
    $baseY = $S * 0.83
    $bodyR = $S * 0.29

    $housePoints = @(
        (New-Object System.Drawing.PointF($cx, $peakY)),
        (New-Object System.Drawing.PointF(($cx + $bodyR), $eaveY)),
        (New-Object System.Drawing.PointF(($cx + $bodyR), $baseY)),
        (New-Object System.Drawing.PointF(($cx - $bodyR), $baseY)),
        (New-Object System.Drawing.PointF(($cx - $bodyR), $eaveY))
    )
    $houseRadii = @(($S * 0.05), ($S * 0.035), ($S * 0.09), ($S * 0.09), ($S * 0.035))
    $housePath = New-RoundedPolygonPath -Points $housePoints -Radii $houseRadii

    $houseFill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#fffdfa"))
    $g.FillPath($houseFill, $housePath)

    $houseOutline = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#c2410c"), [float]([Math]::Max(1.0, $S * 0.014)))
    $houseOutline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($houseOutline, $housePath)

    # Roofline accent: a warm band along the two roof slopes, like a ridge.
    $roofBand = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#fb923c"), [float]($S * 0.03))
    $roofBand.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $roofBand.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $roofBand.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($roofBand, [float]($cx - $bodyR * 0.62), [float]($peakY + ($eaveY - $peakY) * 0.62), [float]$cx, [float]$peakY)
    $g.DrawLine($roofBand, [float]($cx + $bodyR * 0.62), [float]($peakY + ($eaveY - $peakY) * 0.62), [float]$cx, [float]$peakY)

    # "S" monogram, centered in the body -- Samama family initial.
    $sFont = New-Object System.Drawing.Font("Georgia", [float]($S * 0.30), [System.Drawing.FontStyle]::Bold)
    $sBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#c2410c"))
    $sFormat = New-Object System.Drawing.StringFormat
    $sFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $sFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $bodyRect = New-Object System.Drawing.RectangleF(
        [float]($cx - $bodyR), [float]$eaveY,
        [float]($bodyR * 2), [float]($baseY - $eaveY)
    )
    $g.DrawString("S", $sFont, $sBrush, $bodyRect, $sFormat)

    # Small heart accent, tucked beside the roof peak -- the family touch.
    $heartColor = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#fb7185"))
    $hcx = $cx + $S * 0.33
    $hcy = $peakY + $S * 0.10
    $hs = $S * 0.13
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
    $roofBand.Dispose()
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
