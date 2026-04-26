# Stop all Etalo dev services
Write-Host "Stopping Etalo dev services..." -ForegroundColor Yellow

$killed = 0
foreach ($port in @(3000, 8000)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        try {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            $killed++
        } catch {}
    }
}

Get-Process ngrok -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $killed++
}

Write-Host "Killed $killed processes." -ForegroundColor Green
