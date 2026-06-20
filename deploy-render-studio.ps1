Set-Location "C:\Users\saulo\.antigravity\El Primo\agente"
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue
git config user.email "saulohs16@gmail.com"
git config user.name "Saulo"
git add -A
git commit -m "feat(render-studio): prompt-preview route + agente proxy + Render Studio params"
git push origin main
Set-Location "el-primo-agente"
npx wrangler deploy
Set-Location ".."
Set-Location "el-primo-render"
npx wrangler deploy
Set-Location "..\..\landing"
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue
git add -A
git commit -m "feat(render-studio): configurador avanzado de render en panel admin"
git push origin main
