Set-Location "C:\Users\saulo\.antigravity\El Primo\agente"
git config user.email "saulohs16@gmail.com"
git config user.name "Saulo"
git add "el-primo-render/wrangler.jsonc"
git commit -m "fix(render): IMAGE_QUALITY high en wrangler"
git push origin main
Set-Location "el-primo-render"
npx wrangler deploy
