# 🤖 Crear Agente — Skill para Claude Code

> Crea automatizaciones inteligentes (agentes de IA) en la nube de Cloudflare, paso a paso, en español sencillo, sin necesidad de saber programar.

[![Instala con un comando](https://img.shields.io/badge/instalar-1_comando-cyan)](#-instalación)
[![Funciona en Mac y Windows](https://img.shields.io/badge/macOS-✓-blue)](#) [![Windows](https://img.shields.io/badge/Windows-✓-blue)](#) [![Linux](https://img.shields.io/badge/Linux-✓-blue)](#)

---

## ¿Qué hace este skill?

Este skill convierte cualquier idea que tengas tipo *"quiero un programa que..."* en un **agente de IA real publicado en internet** que corre solo todos los días, sin que tú prendas tu computadora.

**Ejemplos de lo que puedes hacer**:

- 🐦 Que te avise cuando alguien hable mal de tu marca en Twitter
- 📰 Que te genere un resumen de las noticias importantes de tu industria cada mañana
- 💼 Que busque clientes potenciales en LinkedIn según tus criterios
- 🚨 Que te alerte si tu sitio web se cae
- 💡 Que te genere ideas de contenido todos los días basadas en tu nicho
- 📧 Que clasifique tus emails por importancia automáticamente

**No necesitas saber programar.** Claude te guía paso a paso, en español, en lenguaje normal.

---

## 🚀 Instalación

### Mac / Linux (1 comando)

```bash
curl -fsSL https://raw.githubusercontent.com/santmun/crear-agente/main/install.sh | bash
```

### Windows (PowerShell, 1 comando)

```powershell
irm https://raw.githubusercontent.com/santmun/crear-agente/main/install.ps1 | iex
```

### Manual (cualquier sistema)

```bash
git clone https://github.com/santmun/crear-agente.git ~/.claude/skills/crear-agente
```

---

## ✅ Requisitos previos

Solo necesitas tener instalado:

1. **Claude Code** — descarga gratis desde https://claude.com/code
2. **Git** — Mac suele tenerlo, Windows descárgalo de https://git-scm.com
3. **Node.js** — el skill te ayuda a instalarlo si no lo tienes

Todo lo demás (cuentas Cloudflare, OpenAI, etc) lo creas durante el proceso.

---

## 📖 Cómo usar el skill

1. **Instala** con el comando de arriba
2. **Abre Claude Code** (cualquier proyecto, no importa)
3. **Escribe**:

   ```
   /crear-agente
   ```

   O en lenguaje natural:

   ```
   quiero hacer un agente que me avise cuando alguien hable de mi marca en Twitter
   ```

4. **Sigue las preguntas**. Claude te lleva paso a paso.

5. **Al terminar** tienes tu agente vivo en internet, corriendo solo.

---

## 💰 Costos (totales, no recurrentes)

Para tu primer agente vas a invertir aprox **$10 USD una vez**:

| Servicio | Costo | Tipo |
|---|---|---|
| **Claude Code** | Gratis o $20/mes | Free tier alcanza |
| **Cloudflare Workers** | Gratis | 100K ejecuciones/día gratis |
| **OpenAI** | $5 una vez | Te dura varios meses |
| **Apify** (si usas scraping) | Gratis ($5 free/mes) | Casi nunca lo pasas |
| **Notion** | Gratis | Plan free alcanza |
| **Pushover** (opcional) | $4.99 una vez | iOS app, no suscripción |

**Costo MENSUAL después del setup**: ~$1-5 USD según uso. Para un agente que corre 1 vez al día, no llega a $3.

---

## 📦 ¿Qué viene en el skill?

```
crear-agente/
├── SKILL.md                           # protocolo conversacional principal
├── walkthroughs/                      # guías paso a paso por servicio
│   ├── 00-bienvenida.md
│   ├── 01-instalar-node.md
│   ├── 02-cloudflare-cuenta.md
│   ├── 03-openai-cuenta.md
│   ├── 04-apify-cuenta.md
│   ├── 05-notion-integration.md
│   ├── 06-pushover-setup.md
│   └── 99-troubleshooting.md
├── blueprints/                        # piezas reusables del agente
│   ├── worker-skeleton.ts
│   ├── wrangler-template.jsonc
│   └── fragments/
│       ├── scrape-twitter.ts
│       ├── scrape-rss.ts
│       ├── scrape-website.ts
│       ├── llm-summarize.ts
│       ├── save-notion.ts
│       └── notify-pushover.ts
└── reference/
    ├── arquitecturas-comunes.md       # 6 patrones que cubren 80% casos
    └── glosario.md                    # diccionario técnico → español sencillo
```

---

## 🎯 Patrones de agente soportados

El skill puede construir cualquiera de estos:

1. **Trend Watcher** — vigila tendencias en tu nicho
2. **Daily News Brief** — resumen diario de noticias
3. **Site Monitor** — alerta si un sitio cambia/se cae
4. **Lead Hunter** — encuentra clientes potenciales
5. **Content Idea Generator** — ideas de contenido diarias
6. **Custom** — describe tu idea y Claude diseña la arquitectura

Detalles en `reference/arquitecturas-comunes.md` después de instalar.

---

## 🆘 Si te atoras

1. **Revisa el troubleshooting**: `~/.claude/skills/crear-agente/walkthroughs/99-troubleshooting.md`
2. **Pregunta en la comunidad de Horizontes IA en Skool**: https://skool.com/horizontes-ia
3. **Twitter**: [@tazeebtw](https://twitter.com/tazeebtw)

---

## 🛠 Para developers

Si quieres contribuir al skill, mejorar walkthroughs, agregar fragments nuevos:

1. Fork el repo
2. Haz cambios en tu fork
3. Submit un Pull Request

Issues bienvenidos también.

---

## 📜 Licencia

MIT. Úsalo, modifícalo, distribúyelo. Si lo subes a otro lado, dame crédito si puedes.

---

## 👋 Sobre Horizontes IA

Comunidad y academia de IA aplicada en español. 600+ miembros aprendiendo a construir sistemas reales con Claude Code, agentes, automatizaciones.

- **Comunidad**: https://skool.com/horizontes-ia
- **YouTube**: [@horizontes-ia](https://youtube.com/@horizontes-ia)
- **Twitter**: [@tazeebtw](https://twitter.com/tazeebtw)
- **Web**: https://horizontesia.com

---

_Hecho con cariño por [Santiago Muñoz](https://horizontesia.com) — Horizontes IA_
