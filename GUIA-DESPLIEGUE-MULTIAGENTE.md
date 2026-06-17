# 🚀 Guía de despliegue — Sistema multi-agente EL PRIMO

Tres agentes nuevos que se conectan en cadena con el calificador que ya existe.

```
WhatsApp ─► el-primo-agente ──(califica)──► el-primo-cotizador ──► correo a Audenar (DOCX)
            (calificador)                         │  │
                                                  │  └──► el-primo-render ──► render IA + plano (correo)
                                                  └──► el-primo-closer ──► seguimiento WhatsApp + cierre
```

Cada agente es un Worker independiente con su propio Durable Object. Comparten **secrets
idénticos** para autenticarse entre sí (X-Secret).

---

## 🔑 Secrets compartidos — invéntalos UNA vez y reúsalos

| Secret | Lo usan | Para qué |
|--------|---------|----------|
| `COTIZADOR_SECRET` | calificador → cotizador | que solo el calificador dispare la cotización |
| `CLOSER_SECRET` | cotizador → closer | que solo el cotizador dispare el seguimiento |
| `RENDER_SECRET` | cotizador → render | que solo el cotizador dispare el render |

Genera 3 claves largas (ej. con un gestor de contraseñas) y anótalas. Deben ser EXACTAS
en cada par.

---

## 1️⃣ Desplegar el COTIZADOR

```bash
cd agente/el-primo-cotizador
npm install
npm run typecheck
npm run deploy        # anota la URL: https://el-primo-cotizador.<sub>.workers.dev

# Secrets
echo "<tu-openai-key>"   | npx wrangler secret put OPENAI_API_KEY
echo "<tu-resend-key>"   | npx wrangler secret put RESEND_API_KEY
echo "<COTIZADOR_SECRET>"| npx wrangler secret put COTIZADOR_SECRET
echo "<CLOSER_SECRET>"   | npx wrangler secret put CLOSER_SECRET
echo "<RENDER_SECRET>"   | npx wrangler secret put RENDER_SECRET
```

---

## 2️⃣ Desplegar el RENDER

```bash
cd ../el-primo-render
npm install
npm run typecheck
npm run deploy        # https://el-primo-render.<sub>.workers.dev

echo "<tu-openai-key>" | npx wrangler secret put OPENAI_API_KEY
echo "<tu-resend-key>" | npx wrangler secret put RESEND_API_KEY
echo "<RENDER_SECRET>" | npx wrangler secret put RENDER_SECRET
```

> El render usa `gpt-image-1` (se cobra por imagen). Ajusta `IMAGE_QUALITY` /
> `IMAGE_SIZE` en `wrangler.jsonc` si quieres bajar el costo.

---

## 3️⃣ Desplegar el CLOSER

```bash
cd ../el-primo-closer
npm install
npm run typecheck
npm run deploy        # https://el-primo-closer.<sub>.workers.dev

echo "<tu-openai-key>"          | npx wrangler secret put OPENAI_API_KEY
echo "<tu-resend-key>"          | npx wrangler secret put RESEND_API_KEY
echo "<twilio-account-sid>"     | npx wrangler secret put TWILIO_ACCOUNT_SID
echo "<twilio-auth-token>"      | npx wrangler secret put TWILIO_AUTH_TOKEN
echo "whatsapp:+14155238886"    | npx wrangler secret put TWILIO_WHATSAPP_FROM
echo "<CLOSER_SECRET>"          | npx wrangler secret put CLOSER_SECRET
```

**Webhook de Twilio** (si el closer atiende su propio número/sandbox):
Messaging → "When a message comes in":
`https://el-primo-closer.<sub>.workers.dev/webhook/message`

---

## 4️⃣ Conectar el CALIFICADOR (ya desplegado)

```bash
cd ../el-primo-agente
# Verifica que COTIZADOR_URL en wrangler.jsonc apunte a la URL real del paso 1.
echo "<COTIZADOR_SECRET>" | npx wrangler secret put COTIZADOR_SECRET
npm run deploy
```

Verifica que en `wrangler.jsonc` del cotizador, `CLOSER_URL` y `RENDER_URL` apunten a las
URLs reales de los pasos 2 y 3 (si tu subdominio no es `saulohs16`, edítalas y redeploy).

---

## ✅ Prueba de extremo a extremo

1. Escríbele al WhatsApp del **calificador** y deja que te califique (tipo de mueble + zona + presupuesto).
2. Al calificar → te llega a tu correo la **cotización con DOCX** (del cotizador).
3. Casi enseguida → te llega el **render + plano** (del render) para revisar.
4. El **closer** le escribe al lead el primer mensaje y arranca la secuencia de seguimiento.
5. Responde como si fueras el cliente diciendo "listo, agéndame" → te llega a tu WhatsApp el aviso de **lead listo para cerrar**.

---

## 📋 Resumen de URLs

| Agente | URL | Disparador |
|--------|-----|-----------|
| Calificador | `el-primo-agente.<sub>.workers.dev/whatsapp/webhook` | WhatsApp entrante |
| Cotizador | `el-primo-cotizador.<sub>.workers.dev/notificar` | calificador (X-Secret) |
| Render | `el-primo-render.<sub>.workers.dev/generar` | cotizador (X-Secret) |
| Closer | `el-primo-closer.<sub>.workers.dev/webhook/message` | WhatsApp + cotizador |

---

## 🗒️ Registro de despliegues / iteraciones

- **2026-06-17 — Cotizador probado en local + rotación de llave OpenAI en producción**
  - Prueba local del `el-primo-cotizador` (`/cotizar`) **OK** de extremo a extremo:
    precio calculado (`$9M – $13,4M` para una cocina en L de 4m en Chinauta), IA
    redactó la propuesta, se generó el DOCX y Resend envió el correo. ✅
  - Se detectó que la llave de OpenAI anterior estaba **sin saldo** (error `429
    quota`). Se **rotó `OPENAI_API_KEY` en producción** del `el-primo-agente`
    (`wrangler secret put`) + `wrangler deploy`. El calificador en vivo vuelve a
    responder. Version ID `ec3c729c`.
  - ⚠️ **Pendiente Resend**: en modo gratis solo envía al correo de la cuenta
    (`saulo.hernandez.s@uniautonoma.edu.co`). Para enviar a Audenar hay que
    **verificar un dominio** en resend.com/domains y cambiar `FROM_EMAIL`
    (p. ej. `cotizaciones@carpinteriaelprimo.com`).
  - ⚠️ **Pendiente**: desplegar los 3 nuevos (cotizador, closer, render) + sus secrets.
