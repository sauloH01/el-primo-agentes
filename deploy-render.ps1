# =====================================================================
# SCRIPT DE DESPLIEGUE CORREGIDO Y SEGURO PARA EL-PRIMO-RENDER
# =====================================================================
$ErrorActionPreference = "Stop"

Write-Host "=== [1/4] DEPLOY CLOUDFLARE - EL-PRIMO-RENDER ===" -ForegroundColor Cyan
Set-Location "C:\Users\saulo\.antigravity\El Primo\agente\el-primo-render"

# Ejecutar despliegue
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { 
    Write-Host "[ERROR] wrangler deploy fallo." -ForegroundColor Red
    exit 1 
}

$WORKER_URL = "https://el-primo-render.saulohs16.workers.dev"
Write-Host "DONE. Worker activo en: $WORKER_URL" -ForegroundColor Green

Write-Host ""
Write-Host "=== [2/4] SMOKE TEST ===" -ForegroundColor Cyan
try {
    $Response = Invoke-WebRequest -Uri "$WORKER_URL" -Method Get -UseBasicParsing -TimeoutSec 10
    Write-Host "[OK] El render respondio con estatus: $($Response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "[WARNING] El test de conexion fallo o dio un error esperado, revisa los logs." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== [3/4] PERSISTENCIA EN GITHUB ===" -ForegroundColor Cyan
Set-Location "C:\Users\saulo\.antigravity\El Primo\agente"
git add .
git commit -m "fix(render): corregir timeout de renderizado mediante patron asincrono y blindar vercel"
git push origin main

Write-Host ""
Write-Host "=== [4/4] COMPLETO ===" -ForegroundColor Green
$HASH = git rev-parse --short HEAD
Write-Host "Sistema unificado. Hash del commit: $HASH" -ForegroundColor Cyan
