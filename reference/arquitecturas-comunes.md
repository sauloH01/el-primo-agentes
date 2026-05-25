# Arquitecturas comunes de agentes

> 6 patrones que cubren el 80% de los casos de uso. Cuando el alumno describe su idea, mapearla a uno de estos y proponerlo.

---

## Patrón 1 — Trend Watcher (vigilante de tendencias)

**Cuando**: el alumno quiere saber qué está pasando en su nicho/industria sin tener que estar pegado a redes.

**Ejemplos de cómo se ven**:
- *"Cada mañana, qué se está moviendo en IA"*
- *"Qué tendencias hay esta semana en mi industria"*
- *"Qué temas están agarrando velocidad en Twitter"*

**Stack**:

```
┌────────────────────────────────────────┐
│  Cron diario (8am)                     │
│    ↓                                   │
│  Scrape Twitter (Apify)                │
│    ↓                                   │
│  GPT-4o-mini clusterea por tema        │
│    ↓                                   │
│  Genera N ideas accionables            │
│    ↓                                   │
│  Notion DB (1 página por día)          │
│    ↓                                   │
│  Pushover a iPhone                     │
└────────────────────────────────────────┘
```

**Fragments usados**: `scrape-twitter`, `llm-summarize`, `save-notion`, `notify-pushover`

**Costo estimado**: ~$5/mes (Apify) + ~$2/mes (OpenAI)

---

## Patrón 2 — Daily News Brief (resumen diario de noticias)

**Cuando**: el alumno quiere un resumen de noticias específicas sin leer 20 fuentes.

**Ejemplos**:
- *"Resumen de las noticias importantes de IA de hoy"*
- *"Qué pasó en cripto ayer"*
- *"Novedades de marketing digital esta semana"*

**Stack**:

```
┌────────────────────────────────────────┐
│  Cron diario (8am)                     │
│    ↓                                   │
│  Fetch RSS feeds (Anthropic, OpenAI,   │
│  TechCrunch, The Verge, etc — gratis)  │
│    ↓                                   │
│  GPT-4o-mini sintetiza top 5           │
│    ↓                                   │
│  Email + Notion (opcional)             │
│    ↓                                   │
│  Pushover                              │
└────────────────────────────────────────┘
```

**Fragments usados**: `scrape-rss` (gratis), `llm-summarize`, `save-notion`, `notify-pushover`

**Costo estimado**: ~$2/mes (solo OpenAI). RSS es gratis.

---

## Patrón 3 — Site Monitor (vigilante de sitio web)

**Cuando**: el alumno quiere saber si su sitio/SaaS/landing está vivo (o si un sitio externo cambió algo importante).

**Ejemplos**:
- *"Avísame si mi sitio se cae"*
- *"Avísame si cambia el precio de un producto en Amazon"*
- *"Avísame cuando aparezca el cupo de un curso que quiero"*

**Stack**:

```
┌────────────────────────────────────────┐
│  Cron cada hora                        │
│    ↓                                   │
│  fetch(URL) → checa status + content   │
│    ↓                                   │
│  Compara contra estado anterior        │
│  (guardado en Durable Object state)    │
│    ↓                                   │
│  Si hay cambio → Pushover urgente      │
│  Si no → no hace nada                  │
└────────────────────────────────────────┘
```

**Fragments usados**: `scrape-website`, `notify-pushover` (priority=2 para emergency)

**Costo estimado**: $0 — no usa LLM ni Apify.

---

## Patrón 4 — Lead Hunter (buscador de oportunidades)

**Cuando**: el alumno quiere encontrar clientes potenciales automáticamente.

**Ejemplos**:
- *"Encuéntrame founders en LinkedIn que estén contratando freelancers"*
- *"Empresas en LATAM que mencionaron 'necesito un agente IA'"*
- *"Anuncios de Meta Ads de mi competencia"*

**Stack**:

```
┌────────────────────────────────────────┐
│  Cron diario (10am)                    │
│    ↓                                   │
│  Apify (LinkedIn / X / Google Maps)    │
│  con keywords específicos              │
│    ↓                                   │
│  GPT-4o-mini califica cada lead (1-10) │
│    ↓                                   │
│  Filtra > 7/10                         │
│    ↓                                   │
│  Notion DB de CRM                      │
│    ↓                                   │
│  Pushover con top 3                    │
└────────────────────────────────────────┘
```

**Fragments usados**: `scrape-twitter`/`scrape-linkedin`, `llm-summarize` (con prompt de calificación), `save-notion`, `notify-pushover`

**Costo estimado**: ~$5-15/mes según volumen.

---

## Patrón 5 — Content Idea Generator (generador de ideas de contenido)

**Cuando**: el alumno hace contenido y necesita ideas frescas todos los días.

**Ejemplos**:
- *"Ideas de video para mi canal de YouTube de [nicho]"*
- *"Threads de Twitter para mi cuenta"*
- *"Hooks para posts de LinkedIn"*

**Stack**:

```
┌────────────────────────────────────────┐
│  Cron diario (8am)                     │
│    ↓                                   │
│  Scrape de cuentas referentes          │
│  del nicho del alumno                  │
│    ↓                                   │
│  GPT-4o-mini detecta tendencias        │
│  + genera ideas en TU estilo           │
│  (few-shot con scripts pasados)        │
│    ↓                                   │
│  Notion DB Ideas                       │
│    ↓                                   │
│  Pushover                              │
└────────────────────────────────────────┘
```

**Fragments usados**: `scrape-twitter`, `llm-summarize` (con system prompt customizado de voz), `save-notion`, `notify-pushover`

**Costo estimado**: ~$5/mes.

**Nota**: este es el patrón EXACTO del Trend Agent que ya construyó Santi.

---

## Patrón 6 — Inbox Triage (clasificador de email)

**Cuando**: el alumno recibe muchos emails y quiere saber cuáles son importantes sin abrir todos.

**Ejemplos**:
- *"Clasifica mis emails entrantes: urgente / lead / newsletter / spam"*
- *"Avísame solo si un email es de un cliente real"*

**Stack**:

```
┌────────────────────────────────────────┐
│  Gmail webhook (push notification)     │
│  → Cloudflare Worker                   │
│    ↓                                   │
│  Lee el email entrante                 │
│    ↓                                   │
│  GPT-4o-mini lo clasifica              │
│    ↓                                   │
│  Si "urgente" o "lead" → Pushover      │
│  Si "spam" → archiva                   │
│  Si "newsletter" → DB Notion           │
└────────────────────────────────────────┘
```

**Fragments usados**: `llm-summarize` (con prompt de clasificación), `notify-pushover`

**Costo estimado**: ~$3-8/mes según volumen de emails.

**Complejidad**: ⚠️ MÁS COMPLEJO — requiere setup de Gmail webhook (Google Cloud Console). Solo recomendar a alumnos que ya tengan experiencia.

---

## ¿Cómo escoger patrón?

Mapear preguntas → patrones:

| Lo que dice el alumno | Patrón recomendado |
|---|---|
| "Quiero saber qué pasa en [nicho]" | 1 (Trend Watcher) |
| "Resumen de noticias de [tema]" | 2 (Daily News Brief) |
| "Avísame si X cambia / se cae" | 3 (Site Monitor) |
| "Buscame clientes / leads" | 4 (Lead Hunter) |
| "Ideas para mi contenido" | 5 (Content Idea Generator) |
| "Clasifica mis emails" | 6 (Inbox Triage) ⚠️ avanzado |

**Si el caso no calza con ninguno**, hacer entrevista de Fase 1 más larga y diseñar custom.

---

## Costos relativos

```
Más barato $:    Site Monitor (Patrón 3) — solo fetch HTTP, sin LLM
Barato:          Daily News Brief (Patrón 2) — RSS gratis, solo OpenAI
Medio:           Trend Watcher / Content Idea (Patrones 1, 5) — Apify + OpenAI
Más caro $$$:    Lead Hunter (Patrón 4) — scraping intensivo en LinkedIn
```

Todos siguen estando en rangos accesibles para personal use ($2-15/mes).
