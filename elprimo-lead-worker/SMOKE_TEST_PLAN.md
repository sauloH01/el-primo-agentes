# 🧪 Smoke Test Plan — Post-Deployment Validation

**Fecha de Deploy:** 2026-06-15  
**Ejecutado por:** DevOps  
**Nivel de Riesgo:** ALTO (cambios en endpoint de producción)

---

## 📋 Smoke Tests Requeridos

Ejecuta estos tests **INMEDIATAMENTE** después del `wrangler deploy`:

### Test 1: Lead Normal con UTM (Validación Principal)

```powershell
# En PowerShell
$body = @{
    nombre = "Smoke Test UTM"
    telefono = "3001111111"
    zona = "Finca en Chinauta"
    tipo = "Cocina Integral"
    presupuesto = "$15M - $30M"
    mensaje = "Prueba de humo"
    source = "test"
    utm_campaign = "smoke_test_campaign"
    utm_source = "facebook"
    utm_medium = "cpc"
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

Write-Host "Response:" -ForegroundColor Green
$response | ConvertTo-Json | Write-Host

# ✅ VALIDAR:
# - success: true
# - contactId: NO NULO
# - dealId: NO NULO
# - correlationId: formato YYYY-MM-DDThh:mm:ss_xxxxxxxx
# - message: contiene "Ref-ID"
```

**Resultado esperado:**
```json
{
  "success": true,
  "contactId": "12345",
  "dealId": "67890",
  "correlationId": "2026-06-15T14:32:45_a1b2c3d4",
  "message": "Lead created successfully. Use correlationId as [Ref-ID] token..."
}
```

---

### Test 2: Lead sin UTM (Validación de Defaults)

```powershell
$body = @{
    nombre = "Smoke Test Sin UTM"
    telefono = "3002222222"
    zona = "Bogotá"
    tipo = "Vestier"
    presupuesto = "$4M - $8M"
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

$response | ConvertTo-Json | Write-Host

# ✅ VALIDAR:
# - success: true (sin UTM, debe funcionar igual)
# - contactId: NO NULO (valores por defecto aplicados)
# - correlationId: presente
```

---

### Test 3: Honeypot Detection (Spam)

```powershell
$body = @{
    nombre = "Spam Bot"
    telefono = "3003333333"
    website = "spam-bot.com"  # ← HONEYPOT
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

$response | ConvertTo-Json | Write-Host

# ✅ VALIDAR:
# - success: true (silenciosamente aceptado)
# - contactId: "honeypot" (indicador que fue bloqueado)
# - dealId: null (no se creó deal)
# - NO se llamó a HubSpot (protección SPAM)
```

---

### Test 4: Validación de Entrada (Error)

```powershell
$body = @{
    nombre = ""  # ← CAMPO REQUERIDO VACÍO
    telefono = "3004444444"
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -SkipHttpErrorCheck  # Para capturar status 400

Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Yellow
$response.Content | ConvertFrom-Json | ConvertTo-Json | Write-Host

# ✅ VALIDAR:
# - StatusCode: 400 (Bad Request)
# - success: false
# - error: contiene "nombre"
```

---

### Test 5: Normalización de Teléfono

```powershell
# Formato 1: 10 dígitos
$body1 = @{
    nombre = "Test Format 1"
    telefono = "3005555555"
} | ConvertTo-Json

$response1 = Invoke-RestMethod `
  -Uri "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body1

# Formato 2: 12 dígitos
$body2 = @{
    nombre = "Test Format 2"
    telefono = "573006666666"
} | ConvertTo-Json

$response2 = Invoke-RestMethod `
  -Uri "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body2

Write-Host "Response 1 (10 dígitos):" -ForegroundColor Green
$response1 | ConvertTo-Json | Write-Host

Write-Host "Response 2 (12 dígitos):" -ForegroundColor Green
$response2 | ConvertTo-Json | Write-Host

# ✅ VALIDAR:
# - Ambos crean contactos DIFERENTES (verificar en HubSpot: misma persona, dos contactos)
# - O bien, el segundo reusa el primero (si son el mismo número)
```

---

### Test 6: Verificación en HubSpot (Manual)

Después de los tests 1-5:

1. **Abre HubSpot Dashboard:**
   ```
   https://app.hubspot.com/contacts/
   ```

2. **Busca el contacto "Smoke Test UTM":**
   - Verifica propiedades:
     - `firstname`: "Smoke Test UTM"
     - `telefono_whatsapp_normalizado`: "+573001111111"
     - `hs_analytics_source`: "PAID_SEARCH"
     - `hs_analytics_source_data_1`: "smoke_test_campaign"
     - `hs_analytics_source_data_2`: "facebook"
     - `hs_analytics_source_data_3`: "cpc"

3. **Busca el Deal:**
   - Verifica que está asociado al contacto
   - Verifica `dealstage`: debe ser el configurado en `wrangler.jsonc`

4. **Verifica Logs:**
   ```
   Dashboard Cloudflare → Workers → elprimo-lead-worker → Logs
   
   Busca por: "[LEAD_INGESTION_START]" o "[DEAL_CREATED]"
   ```

---

## 🔄 Si Algo Falla

### Fallback Scenario 1: HubSpot API Error

**Síntoma:** Response devuelve `success: false` con error de HubSpot

**Acción:**
1. Verifica que `HUBSPOT_ACCESS_TOKEN` sea válido
2. Verifica que el pipeline y dealstage existan en HubSpot
3. Revisa logs en Cloudflare Logs

**Rollback:**
```bash
git checkout elprimo-worker/v1.0-stable  # O el tag anterior
npm run deploy
```

### Fallback Scenario 2: Propiedades No Aceptadas

**Síntoma:** HubSpot rechaza `hs_analytics_source_data_*`

**Acción:**
1. Modifica `src/index.ts`
2. Comenta las líneas que asignan propiedades `hs_analytics_*`
3. Mantén solo `utm_source`, `utm_medium`, `utm_campaign` como campos personalizados
4. Deploy nuevamente

**Líneas a modificar:**
```typescript
// En buildContactProperties()
// Comentar:
// hs_analytics_source: "PAID_SEARCH",
// hs_analytics_source_data_1: ...,
// hs_analytics_source_data_2: ...,
// hs_analytics_source_data_3: ...,
```

### Fallback Scenario 3: Correlación IDs no funcionan

**Síntoma:** Response no incluye `correlationId`

**Acción:**
1. Verifica que la función `generateCorrelationId()` esté exportada
2. Revisa logs: busca `[LEAD_INGESTION_SUCCESS]`
3. Compara con código de `src/index.ts` línea ~450

---

## ✅ Checklist Post-Smoke Test

- [ ] Test 1: Lead con UTM devuelve success, contactId, dealId, correlationId
- [ ] Test 2: Lead sin UTM aplica defaults correctamente
- [ ] Test 3: Honeypot detecta spam sin llamar HubSpot
- [ ] Test 4: Validación de entrada rechaza fields requeridos vacíos
- [ ] Test 5: Teléfono normalizado correctamente
- [ ] Test 6: HubSpot contiene propiedades analytics correctas
- [ ] Logs visibles en Cloudflare Logs
- [ ] Performance: respuesta < 500ms

---

## 📊 Métricas de Éxito

| Métrica | Target | Resultado |
|---------|--------|-----------|
| Success Rate | 100% | ? |
| Avg Response Time | < 500ms | ? |
| HubSpot Properties | Escritura OK | ? |
| Correlation IDs | Generados | ? |
| Fallback Logging | Funcionando | ? |

---

## 🚨 Abort Conditions

Haz **rollback inmediato** si:

1. ❌ Más del 5% de requests fallan
2. ❌ Response time > 2 segundos
3. ❌ HubSpot rechaza propiedades analytics
4. ❌ Correlation IDs no se generan
5. ❌ Honeypot falla y permite spam

---

## 📝 Notas

- Todos los tests usan el endpoint de **PRODUCCIÓN**
- Datos de prueba se enviarán a **HubSpot real** (no staging)
- Puedes limpiar contactos de prueba después en HubSpot
- Mantén este documento para futuras deployments

---

**Smoke Test Document v1.0**  
**Estado:** Listo para ejecución post-deploy
