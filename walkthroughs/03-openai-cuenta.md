# Walkthrough 03 — Crear cuenta OpenAI + llave de acceso

> OpenAI es el "cerebro" del agente: lo que usa para entender texto, generar contenido, clasificar información, etc.

---

## ¿Por qué OpenAI?

Decirle al alumno:

```
Tu agente va a necesitar "pensar". No con su propia cabeza (los programas
no piensan), sino pidiéndole a una IA que lo haga por él.

OpenAI es la empresa que hace ChatGPT. Nos van a dejar usar su IA dentro
de tu agente, para que cuando llegue información nueva, la IA decida qué
hacer con ella, la resuma, la clasifique, etc.

Vas a invertir $5 USD una vez. Eso da para muchos miles de "pensamientos"
del agente (cada pensamiento cuesta centavos). Para un agente personal
que corre 1-3 veces al día, $5 te van a durar varios meses.
```

---

## Paso 1 — Crear cuenta OpenAI (3 min)

```
1. Abre tu navegador
2. Ve a https://platform.openai.com/signup
3. Tap "Sign up"
4. Usa tu email habitual o Google/Microsoft login (más fácil)
5. Confirma email
6. OpenAI te va a pedir verificar con un código por SMS al celular
   (esto es para evitar bots)
7. Una vez verificado, entras al dashboard

¿Ya entraste? Dime cuando estés.
```

---

## Paso 2 — Cargar $5 USD (necesario, una vez)

```
Sin saldo, OpenAI no te deja usar la IA. Vamos a cargarte $5.

1. En el dashboard, busca arriba a la derecha tu nombre/avatar → tap
2. Tap "Settings" o "Billing" en el menú
3. En la izquierda, tap "Billing"
4. Tap "Add payment method"
5. Pon tu tarjeta de débito o crédito
6. Tap "Add credit balance" o "Add to balance"
7. Pon $5 USD (el mínimo)
8. Tap "Continue" → "Confirm payment"

Te debe aparecer "Credit balance: $5.00" en pocos segundos.

¿Ya cargaste? Dime cuando aparezca tu saldo.
```

**Si la tarjeta es rechazada:**

```
OpenAI a veces es estricto con tarjetas de Latinoamérica. Cosas que
puedes intentar:
1. Usa una tarjeta diferente (débito de algún banco distinto)
2. Si tienes PayPal vinculado, prueba con eso
3. Si tienes una tarjeta virtual de Nu, Mercado Pago o similar, esas
   suelen funcionar mejor

Si nada funciona, mándame screenshot del error y vemos otras opciones.
```

---

## Paso 3 — Crear tu llave de acceso (API key)

```
Ahora vamos a generar tu "llave de acceso". Es como una contraseña que
tu agente va a usar para hablarle a OpenAI.

1. En el dashboard, busca en el menú izquierdo "API Keys"
   (o ve a https://platform.openai.com/api-keys)
2. Tap "Create new secret key"
3. Te pide un nombre. Pon: "agente-cloudflare-[tu-nombre]"
4. En "Project" deja "Default project"
5. En "Permissions" deja "All"
6. Tap "Create secret key"
7. Te muestra una llave que empieza con "sk-proj-..."
8. ⚠️ MUY IMPORTANTE: cópiala COMPLETA inmediatamente. OpenAI nunca te
   la vuelve a mostrar — si la pierdes, hay que crear otra.
9. Tap "Done"

Cuando tengas la llave copiada, pégamela en el chat.
```

**Cuando el alumno pegue la llave:**

1. **NO la imprimas en ningún output después**. Guardadla solo en `.dev.vars`.
2. Responder: *"Perfecto, ya la tengo guardada de forma segura. Pasamos al siguiente servicio."*

---

## Paso 4 — Configurar límite de gasto (recomendado)

```
Última cosa antes de irnos: vamos a poner un límite para que tu agente
nunca pueda gastar más de cierta cantidad por mes (por si algo se sale
de control).

1. En el dashboard, ve a Settings → "Billing" → "Limits"
2. En "Monthly budget" pon: $10 USD
3. En "Email alerts" pon tu email
4. Tap "Save"

Con esto, si algo raro pasa y el agente intenta gastar más de $10 al mes,
OpenAI lo bloquea automáticamente. Es tu paracaídas.
```

---

## Verificación final

Decirle al alumno:

```
¡Listo! Ya tienes:

✅ Cuenta OpenAI activa
✅ $5 USD cargados
✅ Llave de acceso creada (yo ya la guardé)
✅ Límite de $10/mes configurado (por seguridad)

Esto es el "cerebro" de tu agente. Pasamos al siguiente componente.
```

---

## Reglas del walkthrough

1. **NUNCA imprimas la API key** después de que el alumno te la pase. Quedó en `.dev.vars`.
2. **Insiste en que cargue saldo mínimo $5**. Sin saldo, OpenAI bloquea todo.
3. **Insiste en el límite mensual**. Es un "paracaídas" para evitar sustos por bugs.
4. **Si el alumno pregunta por modelos**, decir: *"Por default vamos a usar `gpt-4o-mini`, que es el más barato y suficiente. Si después quieres que tu agente piense más profundo, hablamos de modelos más caros."*
5. **Free trial de OpenAI** (los $5 gratis del principio) **ya no existe en 2026**. Hay que cargar saldo siempre.
