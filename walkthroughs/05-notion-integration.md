# Walkthrough 05 — Crear integración de Notion (si el agente guarda en Notion)

> Notion es donde el agente puede guardar resultados de forma organizada, con links, etiquetas, y vista de base de datos.

---

## ¿Cuándo uso Notion?

Si tu agente:

- ✅ Guarda ideas, leads, tareas, notas
- ✅ Genera contenido (ideas de video, scripts, posts)
- ✅ Trackea métricas / status de algo en el tiempo
- ✅ Reporta hallazgos diarios

**NO uses Notion si**:

- Solo quieres notificaciones (ya con Pushover basta)
- Vas a guardar muchísimos datos (>10K rows/mes) — mejor una DB real
- Quieres procesar archivos pesados (imágenes, video) — usa Google Drive

---

## Paso 1 — Crear o decidir tu database de Notion

Decirle al alumno:

```
Antes de configurar la "puerta" que tu agente va a usar para hablar con
Notion, necesitamos decidir DÓNDE va a guardar las cosas.

Opción A: Ya tienes una database (DB) en tu Notion que quieres usar
Opción B: No tienes — vamos a crear una desde cero

¿Cuál de las dos?
```

### Opción A — Usar DB existente

```
Perfecto. Ábreme tu Notion, copia el link de la database, y pégamelo.

Importante: tiene que ser un link a una DATABASE (lo que se ve como una
tabla en Notion), NO a una página normal.

¿Cómo distinguir?
- Database: en el header dice "Table", "Board", "List" o similar
- Página normal: solo es una página con texto

Si no estás seguro, mándame screenshot del header y te digo.
```

### Opción B — Crear DB nueva

```
1. Abre Notion
2. Tap "+ New page" en el menú izquierdo (o donde tú quieras crear)
3. Le pones nombre (ej. "Resultados del agente")
4. En el centro de la página vacía, tap "+ Add new" → "Database — Full page"
5. Notion te crea una table vacía
6. Cambia los nombres de columnas a lo que tu agente vaya a guardar

Para casos típicos, sugerencia de columnas:

  Para "Ideas de contenido":
    - Title (default, ya viene)
    - Status (Select: Nueva / En progreso / Publicada)
    - Fecha (Date — auto: created_time)
    - Notas (Text)

  Para "Leads":
    - Title (nombre del lead)
    - Empresa (Text)
    - Email (Email)
    - Status (Select: Nuevo / Contactado / Calificado)
    - Score (Number)

  Para "Alertas":
    - Title (descripción de la alerta)
    - Tipo (Select: Info / Warning / Critical)
    - Fecha (Date)
    - URL (URL)

¿Qué tipo de cosa va a guardar tu agente?
```

Después de crearla, pedirle el link igual que en Opción A.

---

## Paso 2 — Crear integración de Notion (puerta privada)

```
Ahora vamos a crear la "puerta" privada que tu agente va a usar para
hablar con Notion. Esto es como darle a tu agente una llave de tu casa
de Notion.

1. Abre https://www.notion.so/profile/integrations
2. Tap "+ New integration"
3. Llena:
   - Name: "Agente [nombre del alumno]" (ej. "Agente Santi")
   - Associated workspace: tu workspace de Notion
   - Type: "Internal"
   - Logo: opcional
4. Tap "Save"
5. Te lleva a una nueva pantalla con un "Internal Integration Secret"
   que empieza con "ntn_"
6. Tap "Show" y cópialo COMPLETO
7. Pégamelo en el chat

(Esta llave solo TÚ y tu agente la conocen. Es como la llave del
departamento.)
```

**Cuando el alumno pegue el token**:
- NO imprimir
- Guardar como `NOTION_TOKEN` en `.dev.vars`
- Responder: *"Listo, llave guardada."*

---

## Paso 3 — Compartir la DB con la integración

⚠️ **Este paso es el que MÁS olvidan los alumnos**. Si lo brincan, después fallan con `object_not_found`.

```
Ya tienes la integración creada, pero por seguridad Notion no le da
acceso a NINGUNA página por default. Tienes que darle permiso a la DB
específica.

1. Abre tu DB de Notion (la que vamos a usar)
2. Arriba a la derecha, tap los "..." (tres puntos)
3. Tap "Connections" o "Add connections"
4. En la búsqueda escribe el nombre de tu integración
   (ej. "Agente Santi")
5. Tap el nombre cuando aparezca → "Confirm"
6. Listo, tu agente ya puede leer/escribir en esta DB

¿Pudiste? Confirma con "ya".
```

---

## Paso 4 — Verificar acceso (opcional pero seguro)

Para confirmar que la conexión funciona, correr este test (Claude lo corre, no el alumno):

```bash
NOTION_TOKEN="<token-del-alumno>"
DB_ID="<id-extraído-del-link>"  # extraerlo del URL: notion.so/...-{DB_ID}

curl -s -X GET "https://api.notion.com/v1/databases/$DB_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28" | python3 -m json.tool | head -20
```

Si responde con info de la DB → access OK.
Si responde `object_not_found` → el alumno no compartió bien la DB. Repetir paso 3.

---

## Paso 5 — Extraer el DB ID del link

El link que el alumno pegó se ve algo así:

```
https://www.notion.so/innovandohorizontes/Mi-DB-555211252da94fedae146d79a7be005a?v=...
```

El **DB_ID** es la parte después del último guion antes del `?`: `555211252da94fedae146d79a7be005a`.

Formato preferido en el código (con guiones): `55521125-2da9-4fed-ae14-6d79a7be005a` (Notion acepta ambos).

Guardar en `.dev.vars`:

```
NOTION_TOKEN=ntn_xxx
NOTION_DB_ID=55521125-2da9-4fed-ae14-6d79a7be005a
```

---

## Verificación final

```
¡Listo! Ya tienes:

✅ Database creada (o existente) en Notion
✅ Integración de Notion creada
✅ Integración compartida con la DB (importante)
✅ Token guardado de forma segura
✅ DB ID extraído del link

Pasamos al siguiente paso.
```

---

## Reglas del walkthrough

1. **El paso 3 (compartir DB con integración) es CRÍTICO.** Sin esto, el agente no puede ver ni escribir nada.
2. **Las propiedades de la DB (columnas) deben coincidir con lo que el código escribe.** Si la DB tiene columna "Status" y el código escribe "status" (minúscula), falla. Cuidado.
3. **Capitalización y espacios importan.** Notion es case-sensitive.
4. **Internal Integration vs Public Integration**: el alumno SIEMPRE usa "Internal". Public es para apps comerciales.
5. **Si el alumno quiere que el agente lea Y escriba**, la integración debe tener ambos permisos (es lo default en Internal).
