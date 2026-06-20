# Glosario — qué significa cada palabra técnica

> Diccionario para que el alumno entienda los términos cuando aparezcan inevitablemente en errores o docs externas.

---

## Cosas que vive tu agente

| Palabra | Qué es realmente |
|---|---|
| **Agente** | Programa que corre solo en internet y hace algo útil. |
| **Cloudflare Workers** | El servicio donde vive tu agente. Como Google Drive pero para programas en lugar de archivos. |
| **Durable Object** | La "memoria" de tu agente. Recuerda lo que pasó en runs anteriores. |
| **Edge** | Las computadoras de Cloudflare repartidas por el mundo. Tu agente puede correr en la más cercana al usuario. |
| **Endpoint** | La dirección web (URL) de tu agente. Como una calle donde le puedes "tocar el timbre". |
| **Worker** | El nombre técnico de tu agente cuando vive en Cloudflare. |

---

## Cosas que necesita instalado

| Palabra | Qué es realmente |
|---|---|
| **Node.js** | El motor que ejecuta tu agente. Como necesitar Word para abrir .docx. |
| **npm** | El "App Store" para descargar las piezas que tu agente usa. |
| **npx** | Una variante de npm que ejecuta cosas sin instalarlas globalmente. |
| **Wrangler** | La herramienta oficial de Cloudflare para subir y manejar Workers desde tu terminal. |
| **package.json** | Lista de las "piezas" que tu agente necesita. |
| **node_modules** | La carpeta gigante con todas esas piezas descargadas. **Nunca subir a internet.** |

---

## Cosas que el agente hace

| Palabra | Qué es realmente |
|---|---|
| **API** | Una "puerta" por donde un programa habla con otro. Como un menú de restaurant: pides X, te dan X. |
| **API key** | La "contraseña" para usar la puerta de un servicio (OpenAI, Notion, etc). |
| **Webhook** | Un evento del servicio externo que tu agente puede escuchar. "Avísame cuando llegue email nuevo". |
| **Scraping** | Cuando tu agente lee información de un sitio web sin que ese sitio tenga API oficial. |
| **Cron** | El "calendario" que dispara a tu agente a una hora específica. Ej. "0 14 * * *" = todos los días a las 14:00 UTC. |
| **Secret / Variable de entorno** | Una contraseña o config que NO se guarda en el código, sino aparte por seguridad. |

---

## Términos comunes en errores

| Palabra | Qué es realmente |
|---|---|
| **HTTP 200** | Funcionó bien. |
| **HTTP 4xx** (400, 401, 403, 404, 429) | Algo está mal de tu lado (typo, credenciales, demasiado uso). |
| **HTTP 5xx** (500, 502, 503) | Algo está mal del lado del servicio externo (no es tu culpa). |
| **Timeout** | Una operación tardó demasiado y se canceló. |
| **JSON** | Un formato de texto para enviar datos estructurados. Lo que se ve `{"a":"b"}`. |
| **Stack trace** | Lista de líneas donde el error ocurrió. La primera es donde realmente está el problema. |
| **Rate limit** | "Te estás pasando, espera un rato". El servicio te bloquea temporalmente. |

---

## Términos de Git / GitHub (si el alumno los oye)

| Palabra | Qué es realmente |
|---|---|
| **Git** | Sistema para guardar versiones de tu código. Como deshacer pero para todo el proyecto. |
| **Repo / Repositorio** | Carpeta del proyecto + su historial de cambios. |
| **GitHub** | Plataforma en la nube donde se guardan repos. Como Google Drive pero para código. |
| **Commit** | Una "foto" del estado del proyecto en un momento. Le pones nombre/descripción. |
| **Push** | Subir tus commits a GitHub. |
| **Pull** | Bajar los commits que otros hicieron. |
| **Branch / Rama** | Una "línea paralela" del proyecto donde experimentas sin afectar lo principal. |

---

## Modelos de IA (cuando el alumno pregunte cuál usar)

| Modelo | Cuándo usar | Costo aprox |
|---|---|---|
| `gpt-4o-mini` | **Default para todo.** Suficiente para resumir, clasificar, generar. | Centavos por uso |
| `gpt-4o` | Si quieres mejor calidad en escritura compleja o análisis difícil | ~10x más caro que mini |
| `gpt-4.1-mini` | Versión más nueva del mini. Similar precio. | ~$0.40/1M tokens |
| `o1-mini` | Para tareas que requieren razonamiento paso a paso | Caro |
| `claude-haiku` (Anthropic) | Alternativa rápida y barata. Mejor para español. | Similar a gpt-4o-mini |
| `claude-sonnet` (Anthropic) | Alternativa de calidad alta. | Similar a gpt-4o |

**Recomendación**: empieza con `gpt-4o-mini`. Si los resultados no te convencen, prueba `gpt-4o`. Cambiar es 1 línea de código.

---

## ¿Cómo leer un error en el chat de la terminal?

Cuando algo falla, te aparece algo así:

```
Error: Cannot read properties of undefined (reading 'foo')
    at runPipeline (src/index.ts:42:18)
    at scheduled (src/index.ts:108:5)
```

**Cómo entenderlo (de arriba a abajo)**:

1. **Línea 1**: el error en sí. *"Algo es undefined cuando intenté leer 'foo'"*.
2. **Línea 2**: dónde explotó. *"En la función runPipeline, archivo src/index.ts, línea 42"*.
3. **Línea 3**: quién llamó esa función. *"Fue llamado desde la función scheduled, línea 108"*.

**Para arreglar**: ve al archivo y línea de la PRIMERA mención (línea 2 arriba). Ahí está el problema casi siempre.

---

## ¿Cómo saber si tengo algo instalado?

```bash
[nombre-del-programa] --version
```

Ejemplos:
- `node --version` → te dice si tienes Node
- `npm --version` → te dice si tienes npm
- `git --version` → te dice si tienes git
- `npx wrangler --version` → te dice si tienes wrangler

Si te responde un número (`v22.x.x`) → lo tienes.
Si te dice `command not found` o `not recognized` → no lo tienes.
