# ─────────────────────────────────────────────────────────────────────────────
# EL PRIMO — Deploy + Smoke Test (Consolidación de Producción)
# Ejecuta desde la carpeta elprimo-lead-worker:
#   cd elprimo-lead-worker
#   .\deploy-and-test.ps1
# ─────────────────────────────────────────────────────────────────────────────

Set-Location "$PSScriptRoot"

$WORKER_URL = "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead"

# ─── PASO 1: Deploy ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[1/3] Desplegando Worker a produccion..." -ForegroundColor Cyan
npx wrangler deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Deploy fallido (exit code $LASTEXITCODE). Revisa los errores arriba." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[OK] Deploy completado exitosamente." -ForegroundColor Green

# ─── PASO 2: Smoke test — presupuesto alto "Más de $60M" (dealAmount: 35_000_000) ──
Write-Host ""
Write-Host "[2/3] Smoke test A — 'Mas de `$60M' (esperado dealAmount: 35000000)..." -ForegroundColor Cyan

$bodyA = @{
    nombre       = "Validacion Rango Alto"
    telefono     = "3008888888"
    zona         = "Finca en Chinauta"
    tipo         = "Cocina Integral Premium"
    presupuesto  = 'Más de $60M'
    mensaje      = "Prueba rango alto 60M"
    source       = "smoke_test"
    utm_source   = "direct"
    utm_medium   = "none"
    utm_campaign = "test_60m"
} | ConvertTo-Json -Compress

$responseA = Invoke-RestMethod `
    -Uri $WORKER_URL `
    -Method POST `
    -ContentType "application/json; charset=utf-8" `
    -Body $bodyA

Write-Host "Respuesta:" -ForegroundColor Gray
$responseA | ConvertTo-Json -Depth 5

if ($responseA.success -eq $true -and $responseA.dealAmount -eq 35000000) {
    Write-Host "[PASS] Smoke test A: dealAmount = $($responseA.dealAmount) COP" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Smoke test A: success=$($responseA.success) | dealAmount=$($responseA.dealAmount)" -ForegroundColor Red
}

# ─── PASO 3: Smoke test — presupuesto "$15M - $30M" (dealAmount: 22_500_000) ──
Write-Host ""
Write-Host "[3/3] Smoke test B — '`$15M - `$30M' (esperado dealAmount: 22500000)..." -ForegroundColor Cyan

$bodyB = @{
    nombre       = "Validacion Rango Medio"
    telefono     = "3007777777"
    zona         = "Zona Rosa Fusa"
    tipo         = "Closet Premium"
    presupuesto  = '$15M - $30M'
    mensaje      = "Prueba rango medio"
    source       = "smoke_test"
    utm_source   = "facebook"
    utm_medium   = "cpc"
    utm_campaign = "test_15m_30m"
} | ConvertTo-Json -Compress

$responseB = Invoke-RestMethod `
    -Uri $WORKER_URL `
    -Method POST `
    -ContentType "application/json; charset=utf-8" `
    -Body $bodyB

Write-Host "Respuesta:" -ForegroundColor Gray
$responseB | ConvertTo-Json -Depth 5

if ($responseB.success -eq $true -and $responseB.dealAmount -eq 22500000) {
    Write-Host "[PASS] Smoke test B: dealAmount = $($responseB.dealAmount) COP" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Smoke test B: success=$($responseB.success) | dealAmount=$($responseB.dealAmount)" -ForegroundColor Red
}

# ─── Resumen ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "correlationId A: $($responseA.correlationId)" -ForegroundColor DarkGray
Write-Host "correlationId B: $($responseB.correlationId)" -ForegroundColor DarkGray
Write-Host "────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
