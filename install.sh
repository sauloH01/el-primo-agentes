#!/usr/bin/env bash
# install.sh — Instala el skill "crear-agente" en Claude Code (Mac / Linux)
#
# Uso (curl 1-liner):
#   curl -fsSL https://raw.githubusercontent.com/santmun/crear-agente/main/install.sh | bash
#
# O clonando manualmente:
#   git clone https://github.com/santmun/crear-agente.git
#   bash crear-agente/install.sh

set -euo pipefail

SKILL_NAME="crear-agente"
REPO_URL="https://github.com/santmun/crear-agente.git"
TARGET="$HOME/.claude/skills/$SKILL_NAME"

echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  Instalador: skill 'crear-agente'               │"
echo "  │  Para Claude Code — Horizontes IA               │"
echo "  └─────────────────────────────────────────────────┘"
echo ""

# Detectar OS
case "$(uname -s)" in
  Darwin*) OS_NAME="macOS" ;;
  Linux*)  OS_NAME="Linux" ;;
  *)       OS_NAME="Desconocido" ;;
esac
echo "  ✓ Sistema operativo detectado: $OS_NAME"

# Verificar requisitos
if ! command -v git >/dev/null 2>&1; then
  echo ""
  echo "  ✗ ERROR: necesitas Git instalado."
  echo "    En Mac: instala desde https://git-scm.com o ejecuta 'xcode-select --install'"
  echo "    En Linux: 'sudo apt install git' o equivalente"
  exit 1
fi
echo "  ✓ Git OK"

# Verificar que ~/.claude existe (Claude Code instalado)
if [ ! -d "$HOME/.claude" ]; then
  echo ""
  echo "  ✗ ERROR: no encuentro la carpeta ~/.claude"
  echo "    ¿Tienes Claude Code instalado?"
  echo "    Instala primero desde: https://claude.com/code"
  exit 1
fi
echo "  ✓ Claude Code detectado"

# Crear carpeta de skills si no existe
mkdir -p "$HOME/.claude/skills"

# Si ya existe la skill, preguntar
if [ -d "$TARGET" ]; then
  echo ""
  echo "  ⚠️  Ya tienes 'crear-agente' instalado en $TARGET"
  read -p "  ¿Quieres actualizarlo a la última versión? (s/n): " RESP
  if [[ ! "$RESP" =~ ^[Ss]$ ]]; then
    echo "  Instalación cancelada. Tu skill actual queda intacta."
    exit 0
  fi
  echo "  Removiendo versión anterior..."
  rm -rf "$TARGET"
fi

# Clonar el repo (sin .git para que sea más limpio)
echo ""
echo "  → Descargando skill desde GitHub..."
TMP_DIR=$(mktemp -d)
git clone --depth 1 --quiet "$REPO_URL" "$TMP_DIR/crear-agente"
rm -rf "$TMP_DIR/crear-agente/.git"
mv "$TMP_DIR/crear-agente" "$TARGET"
rm -rf "$TMP_DIR"

echo "  ✓ Skill instalado en: $TARGET"

# Mensaje final
echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  🎉 INSTALACIÓN COMPLETA                        │"
echo "  └─────────────────────────────────────────────────┘"
echo ""
echo "  Para usar el skill:"
echo ""
echo "    1. Abre (o reinicia) Claude Code"
echo "    2. Escribe: '/crear-agente'  o  'quiero hacer un agente que [...]'"
echo "    3. Claude te guiará paso a paso"
echo ""
echo "  El proceso tarda 45-60 minutos la primera vez."
echo "  Después puedes crear más agentes en 15 min."
echo ""
echo "  Si te atoras, escribe en:"
echo "    👥 Comunidad Skool: https://skool.com/horizontes-ia"
echo "    🐦 Twitter: @tazeebtw"
echo ""
