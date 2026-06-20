# Walkthrough 06 — Pushover (notificaciones al iPhone)

> Para configurar notificaciones push al celular del alumno, este walkthrough delega al skill ya existente `pushover-notifications`. Aquí está el resumen rápido de lo que hace.

---

## Estrategia

Para no duplicar contenido, **invocar el skill `pushover-notifications`** que ya tiene el protocolo completo, screenshots y troubleshooting.

Desde dentro de este walkthrough:

```
Para las notificaciones al iPhone vamos a usar Pushover, que es lo más
confiable para iOS. Te voy a guiar paso a paso. Toma 5 minutos.

(Aquí Claude invoca internamente el skill pushover-notifications
y sigue su protocolo de 6 fases. El alumno no nota la diferencia.)
```

---

## Resumen rápido (qué va a hacer el alumno)

1. **Crear cuenta Pushover** en https://pushover.net/signup (gratis registrarse)
2. **Copiar su USER_KEY** del dashboard (uno por cuenta de por vida)
3. **Crear una nueva Application** en https://pushover.net/apps/build:
   - Name: "Mi Agente" (o como quiera llamarlo)
   - Type: Application
   - Description: 1 línea
4. **Copiar el APP_TOKEN** de esa Application
5. **Instalar app Pushover en iPhone**: https://apps.apple.com/app/pushover/id506088175
   - 30 días gratis trial
   - Después $4.99 USD una sola vez (NO suscripción)
6. **Login en la app** con cuenta de Pushover
7. **Mandar test push** con curl desde la terminal del alumno

---

## Env vars finales

Al terminar el alumno tiene:

```
PUSHOVER_USER_KEY=u8xxxxxxxxxxxxxxxxxxxx     # constante (la persona, no cambia)
PUSHOVER_APP_TOKEN=apkxxxxxxxxxxxxxxxxxxxx    # único de este agente
```

---

## Defaults probados (los que el code usa)

En el fragment `blueprints/fragments/notify-pushover.ts`:

```typescript
priority: 1      // high — bypass quiet hours, banner persistent
sound: "magic"   // distintivo, reliable en iOS
```

**Importante:** priority=0 (default genérico) a veces NO dispara push en iOS por Focus mode/DND. SIEMPRE usar priority=1 para agentes que avisan al alumno.

---

## Para Android

Pushover también funciona en Android — el setup es igual:

- App Play Store: https://play.google.com/store/apps/details?id=net.superblock.pushover
- Mismo $4.99 USD una sola vez

---

## Para alternativas (si el alumno no quiere pagar $5 Pushover)

| Alternativa | Pros | Contras |
|---|---|---|
| **Telegram bot** | Gratis, reliable | 5-10 min setup adicional en BotFather |
| **Email (Resend free)** | Gratis | Menos inmediato — depende de tu email app |
| **Slack DM** | Gratis si ya usas Slack | Push de Slack a veces falla en iOS |
| **ntfy.sh** | Gratis, open source | Push en iOS es poco reliable (no usa APNs) |

**Recomendación**: si el alumno NO quiere pagar $5, ofrecer Telegram bot. Más reliable que email.

---

## Reglas del walkthrough

1. **Para Pushover completo**, delegar al skill `pushover-notifications` que ya existe.
2. **Para alternativas (Telegram/email)**, ajustar el `notify-*.ts` fragment según el canal escogido.
3. **El alumno DEBE haber instalado y loggeado la app en su phone ANTES** de seguir adelante. Si no, los tests fallan silenciosamente.
4. **Mandar un test push antes de seguir.** Si el alumno no recibe el test, hay que arreglar antes de codear más.
