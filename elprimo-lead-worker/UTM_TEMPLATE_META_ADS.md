# Plantilla UTM — EL PRIMO Carpintería · Meta Ads

## Estructura del URL de destino

```
https://carpinteriaelprimo.vercel.app/?utm_source={{source}}&utm_medium={{medium}}&utm_campaign={{campaign}}&utm_content={{content}}&utm_term={{term}}
```

En Meta Ads, usa las variables dinámicas de la plataforma para que se rellenen automáticamente:

```
https://carpinteriaelprimo.vercel.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

---

## Convención de nombres

### `utm_source` — Red publicitaria (fijo por campaña)
| Valor | Cuándo usarlo |
|---|---|
| `facebook` | Anuncios en Facebook Feed, Reels, Stories |
| `instagram` | Anuncios en Instagram Feed, Reels, Stories |
| `facebook_instagram` | Campañas con placement automático Meta |

### `utm_medium` — Tipo de tráfico (fijo)
| Valor | Cuándo usarlo |
|---|---|
| `paid_social` | Siempre para Meta Ads |
| `cpc` | Si usas campañas de tráfico / conversiones |

### `utm_campaign` — Nombre de la campaña
Formato: `[segmento]-[producto]-[mes][año]`

| Ejemplo | Descripción |
|---|---|
| `finca-cocinas-jun26` | Fincas del Sumapaz, cocinas, junio 2026 |
| `apto-closets-jun26` | Apartamentos Fusagasugá, closets |
| `fusa-general-jun26` | Campaña general Fusagasugá |
| `chinauta-finca-jul26` | Fincas en Chinauta, julio 2026 |

### `utm_content` — Variación del anuncio
Formato: `[formato]-[concepto]`

| Ejemplo | Descripción |
|---|---|
| `carrusel-antes-despues` | Carrusel con fotos de resultado |
| `video-testimonial` | Video corto con reseña de cliente |
| `imagen-3d-render` | Imagen de diseño 3D del proyecto |
| `reels-instalacion` | Reel mostrando el proceso de instalación |
| `imagen-precio-rh` | Imagen destacando material RH y precio |

### `utm_term` — Audiencia / segmentación
Formato: `[zona]-[interes]`

| Ejemplo | Descripción |
|---|---|
| `fusagasuga-cocinas` | Audiencia Fusagasugá interesada en cocinas |
| `chinauta-fincas` | Propietarios de fincas en Chinauta |
| `cundinamarca-remodelacion` | Cundinamarca amplio, remodelación |
| `retargeting-visita-web` | Retargeting visitantes del sitio |
| `lookalike-clientes` | Lookalike basado en clientes actuales |

---

## URLs listas para copiar

### Campaña 1 — Fincas Chinauta/Sumapaz (cocinas)
```
https://carpinteriaelprimo.vercel.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=finca-cocinas-jun26&utm_content=carrusel-antes-despues&utm_term=chinauta-fincas
```

### Campaña 2 — Apartamentos Fusagasugá (closets)
```
https://carpinteriaelprimo.vercel.app/?utm_source=instagram&utm_medium=paid_social&utm_campaign=apto-closets-jun26&utm_content=video-testimonial&utm_term=fusagasuga-cocinas
```

### Campaña 3 — Retargeting visitantes
```
https://carpinteriaelprimo.vercel.app/?utm_source=facebook_instagram&utm_medium=paid_social&utm_campaign=retargeting-jun26&utm_content=imagen-precio-rh&utm_term=retargeting-visita-web
```

### Con variables dinámicas de Meta (recomendado para escalar)
```
https://carpinteriaelprimo.vercel.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

---

## Cómo se ve en HubSpot

Cuando un lead llega desde un ad, en su ficha de contacto aparecen:

| Propiedad HubSpot | Ejemplo de valor |
|---|---|
| Fuente del Lead | `landing_contact_form` |
| UTM Source (Lead) | `facebook` |
| UTM Medium (Lead) | `paid_social` |
| UTM Campaign (Lead) | `finca-cocinas-jun26` |
| UTM Content (Lead) | `carrusel-antes-despues` |
| UTM Term (Lead) | `chinauta-fincas` |

Usa estas propiedades en **HubSpot → Reports → Create report** para ver qué campaña genera más leads y cuál convierte mejor.

---

## Flujo completo

```
Meta Ad (URL con UTMs)
        ↓
Landing carpinteriaelprimo.vercel.app
        ↓  (guarda UTMs en localStorage al llegar)
Cliente llena formulario → clic "Cotizar"
        ↓
Worker elprimo-lead-worker (Cloudflare)
        ↓
HubSpot: Contacto + Deal con todos los UTMs guardados
        ↓
WhatsApp abre con mensaje pre-llenado (contacto humano)
```
