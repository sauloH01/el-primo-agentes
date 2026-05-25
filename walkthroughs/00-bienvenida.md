# Walkthrough 00 — Bienvenida y verificación inicial

> Este es el primer walkthrough que se corre. Detecta el sistema operativo del alumno y verifica qué tiene instalado.

---

## 1. Saludo inicial

Decir al alumno:

```
¡Hola! Te voy a ayudar a crear tu primer agente de IA. 🤖

Un "agente" es básicamente un programa que corre solo en internet, todos
los días sin que tú lo prendas. Hace algo útil para ti (busca info,
te avisa, organiza datos, lo que tú quieras), y vive en una computadora
de Cloudflare (una empresa que renta servidores gratis para esto).

Tardamos aprox 45-60 minutos la primera vez. Después tú solito puedes
hacer otros agentes en 15 min.

Antes de empezar, déjame revisar qué tienes en tu compu.
```

---

## 2. Detectar sistema operativo

Correr en Bash:

```bash
uname -s 2>/dev/null || echo "WINDOWS_OR_OTHER"
```

Interpretación:

- `Darwin` → **macOS**
- `Linux` → **Linux**
- `WINDOWS_OR_OTHER` → muy probable Windows

Si Windows: también verificar la shell que está usando el alumno preguntando:

```
Veo que estás en Windows. ¿Estás usando "PowerShell", "CMD" (Command
Prompt) o "Git Bash"?

- PowerShell: tiene fondo azul y el cursor dice algo como "PS C:\>"
- CMD: tiene fondo negro y dice "C:\>"
- Git Bash: dice algo como "usuario@PC MINGW64 ~"

Si no estás seguro, mándame screenshot y te confirmo.
```

A partir de aquí, **TODOS los comandos se dan según el OS detectado**.

---

## 3. Verificar Node.js

### En Mac / Linux:

```bash
node --version 2>/dev/null
npm --version 2>/dev/null
git --version 2>/dev/null
```

### En Windows (PowerShell):

```powershell
node --version
npm --version
git --version
```

### En Windows (CMD):

```cmd
node --version
npm --version
git --version
```

### Interpretación de resultados

| Resultado | Significado |
|---|---|
| `v20.x.x` o superior | ✅ Node OK |
| `v18.x.x` o inferior | ⚠️ Node viejo, hay que actualizar |
| `command not found` o `not recognized` | ❌ Node NO instalado |

Si falta Node → ir a `01-instalar-node.md`.

---

## 4. Reportar status al alumno

Después de las verificaciones, decirle al alumno **en lenguaje sencillo**:

```
Esto es lo que detecté en tu compu:

✅ Sistema operativo: macOS Sonoma
✅ Node.js v22.x  — esto es el "motor" que ejecuta tu agente.
✅ npm v10.x      — esto es el "instalador" de las piezas que necesita.
✅ Git v2.39      — esto sirve para guardar versiones de tu código.

¡Todo listo! Pasamos al siguiente paso.
```

Si falta algo:

```
Esto detecté:

✅ Sistema: Windows 11
❌ Node.js: no lo tienes
❌ npm: no lo tienes
✅ Git: instalado

No te preocupes, esto es normal. Te ayudo a instalar Node.js (con npm
viene incluido). Tarda 5 minutos.
```

Después ir al walkthrough `01-instalar-node.md`.

---

## 5. Cuando todo esté listo

Decirle al alumno:

```
Ya tienes lo básico en tu compu. Ahora viene lo divertido: vamos a
diseñar TU agente.

Cuéntame en 1-2 frases: ¿qué quieres que tu agente haga por ti?

Puedes ser muy específico o muy vago, no importa. Yo te ayudo a aterrizar
la idea.

Ejemplos para que te inspires:
• "que me avise cuando alguien hable mal de mi marca en Twitter"
• "que me genere ideas de contenido cada mañana basadas en mi nicho"
• "que me alerte si mi sitio web se cae"
• "que clasifique mis emails por importancia automáticamente"
• "que busque ofertas de empleo en LinkedIn según mis criterios"
• "que me resuma las noticias importantes del día sobre [tema]"
```

Esperar respuesta y pasar a Fase 1 del SKILL.md (entrevista).

---

## 6. Reglas duras de este walkthrough

1. **NUNCA avances si falta un prerequisite**. Es mejor instalar bien que avanzar con errores.
2. **Detecta el OS al inicio y úsalo en TODOS los comandos posteriores**.
3. **Si el alumno está perdido, pídele screenshot**. No asumas.
4. **Reasegura constantemente**. Esto es lo más difícil para no-devs: el primer setup. Si lo pasas bien, lo demás es fácil.
