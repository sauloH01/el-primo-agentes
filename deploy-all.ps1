$ErrorActionPreference = "Stop"

Write-Host "[1/3] LANDING - commit + push" -ForegroundColor Cyan
Set-Location "C:\Users\saulo\.antigravity\El Primo\landing"
git config user.email "saulohs16@gmail.com"
git config user.name "Saulo"
if (Test-Path ".git\index.lock") { Remove-Item ".git\index.lock" -Force }
git add "src/app/admin/(panel)/leads/[id]/page.tsx"
git add "src/app/admin/(panel)/leads/[id]/quote-studio.tsx"
$st = git status --porcelain
if ($st) {
    git commit -m "fix(admin): null guard phone, prose save fix, no sobreescribir texto editado"
    git push origin main
    Write-Host "Landing pusheado - Vercel desplegara en ~2 min" -ForegroundColor Green
} else {
    Write-Host "Landing sin cambios pendientes" -ForegroundColor Yellow
}

Write-Host "[2/3] AGENTE - commit render mejorado" -ForegroundColor Cyan
Set-Location "C:\Users\saulo\.antigravity\El Primo\agente"
git config user.email "saulohs16@gmail.com"
git config user.name "Saulo"
git add "el-primo-render/src/knowledge.ts"
git add "el-primo-render/src/render.ts"
$st2 = git status --porcelain
if ($st2) {
    git commit -m "feat(render): prompt arquitectonico ultra-preciso + quality high"
    git push origin main
    Write-Host "Agente pusheado" -ForegroundColor Green
} else {
    Write-Host "Agente sin cambios pendientes" -ForegroundColor Yellow
}

Write-Host "[3/3] CLOUDFLARE - wrangler deploy render" -ForegroundColor Cyan
Set-Location "C:\Users\saulo\.antigravity\El Primo\agente\el-primo-render"
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: wrangler deploy fallo" -ForegroundColor Red
    exit 1
}

Write-Host "LISTO. Todo desplegado en produccion." -ForegroundColor Green
