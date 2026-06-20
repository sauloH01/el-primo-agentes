$ErrorActionPreference = "Stop"
$ROOT = "C:\Users\saulo\.antigravity\El Primo\agente"
$NEW_REPO = "https://github.com/sauloH01/el-primo-agentes.git"

Set-Location $ROOT

Write-Host "=== [1/4] REMOTE ACTUAL ===" -ForegroundColor Cyan
git remote -v

Write-Host ""
Write-Host "=== [2/4] VERIFICANDO gh CLI ===" -ForegroundColor Cyan
$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue

if ($ghAvailable) {
    Write-Host "GitHub CLI detectado. Creando repo..." -ForegroundColor Green
    gh repo create sauloH01/el-primo-agentes --private --description "El Primo Workers multi-agente" --confirm
    Write-Host "Repo creado." -ForegroundColor Green
} else {
    Write-Host "gh CLI no encontrado." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "PASO MANUAL:" -ForegroundColor Yellow
    Write-Host "  1. Abre https://github.com/new" -ForegroundColor Yellow
    Write-Host "  2. Repository name: el-primo-agentes" -ForegroundColor Yellow
    Write-Host "  3. Visibility: Private" -ForegroundColor Yellow
    Write-Host "  4. NO marques README, .gitignore ni license" -ForegroundColor Yellow
    Write-Host "  5. Click Create repository" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona ENTER cuando el repo este creado"
}

Write-Host ""
Write-Host "=== [3/4] REDIRIGIENDO REMOTE ===" -ForegroundColor Cyan
git remote set-url origin $NEW_REPO
git remote -v

Write-Host ""
Write-Host "=== [4/4] PUSH ===" -ForegroundColor Cyan
git push -u origin main

Write-Host ""
$SHORT = git rev-parse --short HEAD
$FULL = git rev-parse HEAD
Write-Host "LISTO. Repo: https://github.com/sauloH01/el-primo-agentes" -ForegroundColor Green
Write-Host "Hash: $SHORT  ($FULL)" -ForegroundColor Green
