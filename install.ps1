# install.ps1 — Instala el skill "crear-agente" en Claude Code (Windows)
#
# Uso (PowerShell, 1-liner):
#   irm https://raw.githubusercontent.com/santmun/crear-agente/main/install.ps1 | iex
#
# O clonando manualmente:
#   git clone https://github.com/santmun/crear-agente.git
#   .\crear-agente\install.ps1

$ErrorActionPreference = "Stop"

$SkillName = "crear-agente"
$RepoUrl = "https://github.com/santmun/crear-agente.git"
$Target = Join-Path $HOME ".claude\skills\$SkillName"

Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  Instalador: skill 'crear-agente'               │" -ForegroundColor Cyan
Write-Host "  │  Para Claude Code — Horizontes IA               │" -ForegroundColor Cyan
Write-Host "  └─────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

Write-Host "  ✓ Sistema operativo: Windows"

# Verificar Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "  ✗ ERROR: necesitas Git instalado." -ForegroundColor Red
  Write-Host "    Descarga desde https://git-scm.com/download/win"
  Write-Host "    Después de instalarlo, cierra y vuelve a abrir PowerShell."
  exit 1
}
Write-Host "  ✓ Git OK"

# Verificar Claude Code
$ClaudeDir = Join-Path $HOME ".claude"
if (-not (Test-Path $ClaudeDir)) {
  Write-Host ""
  Write-Host "  ✗ ERROR: no encuentro la carpeta ~\.claude" -ForegroundColor Red
  Write-Host "    ¿Tienes Claude Code instalado?"
  Write-Host "    Instala primero desde: https://claude.com/code"
  exit 1
}
Write-Host "  ✓ Claude Code detectado"

# Crear carpeta de skills
$SkillsDir = Join-Path $HOME ".claude\skills"
if (-not (Test-Path $SkillsDir)) {
  New-Item -ItemType Directory -Path $SkillsDir -Force | Out-Null
}

# Si ya existe, preguntar
if (Test-Path $Target) {
  Write-Host ""
  Write-Host "  ⚠️  Ya tienes 'crear-agente' instalado en $Target" -ForegroundColor Yellow
  $Resp = Read-Host "  ¿Quieres actualizarlo a la última versión? (s/n)"
  if ($Resp -notmatch "^[Ss]$") {
    Write-Host "  Instalación cancelada. Tu skill actual queda intacta."
    exit 0
  }
  Write-Host "  Removiendo versión anterior..."
  Remove-Item -Path $Target -Recurse -Force
}

# Clonar el repo
Write-Host ""
Write-Host "  → Descargando skill desde GitHub..."
$TmpDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
$TmpRepo = Join-Path $TmpDir "crear-agente"

git clone --depth 1 --quiet $RepoUrl $TmpRepo
Remove-Item -Path (Join-Path $TmpRepo ".git") -Recurse -Force
Move-Item -Path $TmpRepo -Destination $Target
Remove-Item -Path $TmpDir -Recurse -Force

Write-Host "  ✓ Skill instalado en: $Target"

# Mensaje final
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  🎉 INSTALACIÓN COMPLETA                        │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host "  Para usar el skill:"
Write-Host ""
Write-Host "    1. Abre (o reinicia) Claude Code"
Write-Host "    2. Escribe: '/crear-agente'  o  'quiero hacer un agente que [...]'"
Write-Host "    3. Claude te guiará paso a paso"
Write-Host ""
Write-Host "  El proceso tarda 45-60 minutos la primera vez."
Write-Host "  Después puedes crear más agentes en 15 min."
Write-Host ""
Write-Host "  Si te atoras, escribe en:"
Write-Host "    👥 Comunidad Skool: https://skool.com/horizontes-ia"
Write-Host "    🐦 Twitter: @tazeebtw"
Write-Host ""
