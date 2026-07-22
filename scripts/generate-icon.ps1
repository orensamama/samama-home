Add-Type -AssemblyName System.Drawing

function New-SmoothClosedPath {
    # Catmull-Rom spline through every point, converted to cubic Beziers --
    # traces a continuously smooth, organic curve with no straight edges or
    # hard corners (unlike a rounded polygon, which is still fundamentally
    # geometric underneath).
    param([System.Drawing.PointF[]]$Points)
    $n = $Points.Count
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    for ($i = 0; $i -lt $n; $i++) {
        $p0 = $Points[($i - 1 + $n) % $n]
        $p1 = $Points[$i]
        $p2 = $Points[($i + 1) % $n]
        $p3 = $Points[($i + 2) % $n]
        $c1 = New-Object System.Drawing.PointF(($p1.X + ($p2.X - $p0.X) / 6.0), ($p1.Y + ($p2.Y - $p0.Y) / 6.0))
        $c2 = New-Object System.Drawing.PointF(($p2.X - ($p3.X - $p1.X) / 6.0), ($p2.Y - ($p3.Y - $p1.Y) / 6.0))
        $path.AddBezier($p1, $c1, $c2, $p2)
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

    # House silhouette: a plush, huggable blob traced through a ring of
    # anchor points with a Catmull-Rom spline -- a gentle dome-like peak,
    # softly flared "shoulders", a rounded belly, and a wide, settled base.
    # No straight edges anywhere, so it reads as warm and organic rather
    # than a geometric stencil.
    $peakY = $S * 0.14
    $roofY = $S * 0.32
    $roofR = $S * 0.15
    $shoulderY = $S * 0.44
    $shoulderR = $S * 0.36
    $bellyY = $S * 0.62
    $bellyR = $S * 0.36
    $baseY = $S * 0.82
    $baseR = $S * 0.23

    $housePoints = @(
        (New-Object System.Drawing.PointF($cx, $peakY)),
        (New-Object System.Drawing.PointF(($cx + $roofR), $roofY)),
        (New-Object System.Drawing.PointF(($cx + $shoulderR), $shoulderY)),
        (New-Object System.Drawing.PointF(($cx + $bellyR), $bellyY)),
        (New-Object System.Drawing.PointF(($cx + $baseR), $baseY)),
        (New-Object System.Drawing.PointF(($cx - $baseR), $baseY)),
        (New-Object System.Drawing.PointF(($cx - $bellyR), $bellyY)),
        (New-Object System.Drawing.PointF(($cx - $shoulderR), $shoulderY)),
        (New-Object System.Drawing.PointF(($cx - $roofR), $roofY))
    )
    $housePath = New-SmoothClosedPath -Points $housePoints

    $houseFill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#fffdfa"))
    $g.FillPath($houseFill, $housePath)

    $houseOutline = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#c2410c"), [float]([Math]::Max(1.0, $S * 0.01)))
    $houseOutline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($houseOutline, $housePath)

    # "S" monogram, resting gently in the belly of the house -- Samama family initial.
    $sFont = New-Object System.Drawing.Font("Georgia", [float]($S * 0.26), [System.Drawing.FontStyle]::Bold)
    $sBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#c2410c"))
    $sFormat = New-Object System.Drawing.StringFormat
    $sFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $sFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $doorCenter = New-Object System.Drawing.RectangleF(
        [float]($cx - $bellyR), [float]$shoulderY,
        [float]($bellyR * 2), [float]($baseY - $shoulderY)
    )
    $g.DrawString("S", $sFont, $sBrush, $doorCenter, $sFormat)

    # Small heart accent, tucked beside the roof's peak -- the family touch.
    $heartColor = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#fb7185"))
    $hcx = $cx + $S * 0.13
    $hcy = $peakY + $S * 0.05
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
