# Walkthrough 02 — Crear cuenta de Cloudflare + login

> Cloudflare es la "casa" del agente: donde va a vivir y correr todos los días sin que el alumno prenda su compu.

---

## ¿Por qué Cloudflare?

Decirle al alumno:

```
Tu agente necesita un lugar donde "vivir" en internet. No puedes usar
tu propia compu porque tendría que estar prendida 24/7.

Cloudflare es una empresa enorme que renta servidores. Y la mejor parte:
tienen un plan GRATIS que es PERFECTO para agentes personales como el
nuestro. Casi nunca vas a pagar — aguanta hasta 100,000 ejecuciones
al día gratis. Tu agente probablemente va a correr 1-3 veces al día.

Empresas como Discord, OpenAI, Shopify y Loom usan Cloudflare. Es de
confianza.
```

---

## Paso 1 — Crear cuenta de Cloudflare (3 min)

Decirle al alumno:

```
1. Abre tu navegador
2. Ve a https://dash.cloudflare.com/sign-up
3. Pon tu email (te recomiendo el mismo que usas para Notion / OpenAI,
   así no te confundes después)
4. Pon una contraseña fuerte y guárdala en algún lado (1Password, Notes,
   donde tengas tus contraseñas)
5. Tap "Sign Up"
6. Va a llegarte un email de verificación → tap el link que te manden
7. Una vez verificada, te lleva al dashboard de Cloudflare

¿Ya entraste? Dime cuando estés en el dashboard.
```

**Esperar respuesta.**

---

## Paso 2 — Conectar el dashboard con tu compu

Decirle al alumno:

```
Ahora vamos a "conectar" tu compu con tu cuenta de Cloudflare. Esto se
hace UNA SOLA VEZ y queda guardado para siempre.

Abre tu terminal (Terminal en Mac, PowerShell en Windows) y pega este
comando exacto, después dale enter:

  npx wrangler login

¿Qué va a pasar?
1. Te va a abrir el navegador automáticamente
2. Te va a pedir que autorices a "Wrangler" (la herramienta de Cloudflare)
3. Tap "Allow"
4. Vas a ver una pantalla que dice "Success!"
5. Vuelve a tu terminal — verás un mensaje de éxito ahí también

¿Te funcionó? Dime "ya" cuando hayas autorizado.
```

**Si el navegador no se abre automáticamente:**

```
A veces el navegador no se abre solo. No pasa nada. En la terminal vas
a ver una URL larga que empieza con https://dash.cloudflare.com/oauth...
Cópiala completa, ábrela manualmente en tu navegador, y autoriza ahí.
```

**Si el login falla con error:**

Ir a `99-troubleshooting.md`.

---

## Paso 3 — Verificar que el login funcionó

Decirle al alumno:

```
Para confirmar que tu compu y Cloudflare están conectados, pega este
comando:

  npx wrangler whoami

Te debe responder con:
- Tu email de Cloudflare
- Un Account ID (un código largo)
- Una lista de permisos

Si te responde eso, ¡ya estás listo! Si te dice "you are not logged in",
algo salió mal y volvemos al paso anterior.
```

**Esperar respuesta.**

---

## Paso 4 — Confirmar y celebrar

```
¡Excelente! Ya tienes:

✅ Cuenta de Cloudflare creada (gratis)
✅ Tu compu autorizada para publicar agentes en tu cuenta

Esto es como tener la llave del departamento donde va a vivir tu agente.
Ya no tenemos que volver a hacer este paso para futuros agentes — la
conexión queda guardada.

Pasamos al siguiente servicio.
```

---

## Reglas del walkthrough

1. **No pedir al alumno que pague nada en Cloudflare**. Todo lo que vamos a hacer cabe en el free tier.
2. **Si pide tarjeta de crédito, NO es necesario para el plan gratis**. Si Cloudflare pide tarjeta, es un upsell — saltarlo.
3. **El `wrangler login` se hace UNA VEZ por compu**. Si el alumno cambia de compu, hay que correrlo otra vez en la nueva.
4. **Si el alumno tiene múltiples cuentas Cloudflare** (raro en no-devs), preguntar cuál usar y guiar a `wrangler config` para escoger.
