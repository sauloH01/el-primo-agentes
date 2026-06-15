# ─────────────────────────────────────────────
# EL PRIMO — Deploy + Smoke Test
# Ejecuta desde la carpeta elprimo-lead-worker
# ─────────────────────────────────────────────

Set-Location "$PSScriptRoot"

Write-Host "`n[1/2] Desplegando Worker a produccion..." -ForegroundColor Cyan
npx wrangler deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nDeploy fallido. Revisa el error arriba." -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/2] Smoke test — presupuesto '$`15M - $`30M' (esperado amount: 22500000)..." -ForegroundColor Cyan

$body = @{
    nombre      = "Validacion Monto"
    telefono    = "3008888888"
    zona        = "Finca en Chinauta"
    tipo        = "Cocina Integral"
    presupuesto = '$15M - $30M'
    mensaje     = "Prueba de monto"
    source      = "smoke_test"
    utm_source  = "direct"
    utm_medium  = "none"
    utm_campaign = "test_monto"
} | ConvertTo-Json -Compress

$response = Invoke-RestMethod `
    -Uri "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead" `
    -Method POST `
    -ContentType "application/json; charset=utf-8" `
    -Body $body

$response | ConvertTo-Json -Depth 5

if ($response.success -eq $true -and $response.dealAmount -eq 22500000) {
    Write-Host "`n✅ SMOKE TEST PASADO — dealAmount: $($response.dealAmount)" -ForegroundColor Green
} else {
    Write-Host "`n❌ SMOKE TEST FALLIDO — success: $($response.success) | dealAmount: $($response.dealAmount)" -ForegroundColor Red
}
